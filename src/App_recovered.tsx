import { useState, useEffect, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "./lib/promptMerger";
import {
  saveApiKey,
  getApiKey,
  deleteApiKey,
  hasAnyApiKey,
  PROVIDERS,
  ProviderType,
} from "./lib/apiKeyStore";

// 部署・メンバープリセット定義
const DEPT_PRESETS = [
  {
    key: "strategy",
    name: "経営・戦略部",
    prompt: "大局観を持ち、優先順位とリソース配分を重視する。プロジェクトの長期的成功と持続可能性の視点から議論に参加する。",
    members: [
      { name: "経営戦略担当 山田", role: "経営戦略・ロードマップ策定", personality: "論理的かつ冷静。マイルストーンとROI（投資対効果）を意識した発言を行う。", avatar: "avatar_yamada", is_thinking: 0 },
      { name: "プロジェクトマネージャー 佐藤", role: "進行管理・課題解決", personality: "協調性があり、タスクの依存関係や現実的なスケジュール感に厳しい。", avatar: "avatar_sato", is_thinking: 0 }
    ]
  },
  {
    key: "engineering",
    name: "エンジニアリング部",
    prompt: "実現可能性と保守性を重視し、技術的リスクに敏感である。堅牢でスケーラブルなシステム設計의視点から議論に参加する。",
    members: [
      { name: "UI/UXデザイナー 高橋", role: "ユーザーインターフェース設計・体験向上", personality: "ユーザー中心設計を信条とし、使いやすさと視覚的一貫性にこだわる。", avatar: "avatar_takahashi", is_thinking: 0 },
      { name: "セキュリティエンジニア 田中", role: "脆弱性対策・アクセス制御・暗号化", personality: "慎重かつ懐疑的。データ流出や権限昇格などの脆弱性を徹底的に排除しようとする。", avatar: "avatar_tanaka", is_thinking: 0 }
    ]
  },
  {
    key: "legal",
    name: "法務・コンプライアンス部",
    prompt: "慎重でリスク回避的。規約や合意事項の一言一句にこだわり、将来的なトラブル（訴訟、権利侵害、契約違反）を防止するための防衛策を徹底的に講じる立場から議論に参加する。",
    members: [
      { name: "契約レビュー担当 鈴木", role: "提携契約や利用規約のリーガルチェック", personality: "冷静沈着で丁寧な敬語。曖昧な表現や法的リスクに対して極めて敏感であり、明確な定義とエビデンスを要求する。", avatar: "avatar_suzuki", is_thinking: 0 }
    ]
  },
  {
    key: "marketing",
    name: "マーケティング部",
    prompt: "機会とスピードを重視し、市場・顧客視点で発想する。競合分析とユーザー獲得、認知向上の視点から議論に参加する。",
    members: [
      { name: "マーケティング戦略担当 渡辺", role: "市場分析・プロモーション設計", personality: "アイデア豊富で前向き。データに基づきつつも、競合に勝つためのユニークな施策を提案する。", avatar: "avatar_watanabe", is_thinking: 0 }
    ]
  },
  {
    key: "thinking_style",
    name: "思考スタイル部",
    prompt: "（部署としての性質はありません。個人の思考法をダイレクトに展開します）",
    is_thinking_style: true,
    members: [
      { name: "ドリーマー", role: "夢と可能性を論じる。プロジェクトへの情熱を代弁する", personality: "熱狂的で楽観的。「もし制限がなければ何をしたいか」という理想像を掲げ、メンバーを鼓舞する。", avatar: "avatar_dreamer", is_thinking: 1 },
      { name: "悪魔の代弁者", role: "あえて批判的・懐疑的な立場から意見を述べ、議論の死角をあぶり出す", personality: "自信に満ち、辛口でストレート。計画の欠陥や失敗要因を「もし〜ならどうする？」という問いかけを通じてあぶり出す。", avatar: "avatar_devil", is_thinking: 1 },
      { name: "現実路線", role: "実行可能性の番人。コストと制約の中で考える", personality: "現実的で堅実。時間、資金、リソースの限界を常に意識し、今できる最小限のステップを提案する。", avatar: "avatar_realist", is_thinking: 1 }
    ]
  }
];

function App() {
  // DB & マージテスト関連の状態
  const [dbInstance, setDbInstance] = useState<Database | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number>(1);
  const [mergedPrompt, setMergedPrompt] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [initError, setInitError] = useState<string>("");
  const [generateError, setGenerateError] = useState<string>("");

  // 画面遷移・APIキー関連の状態
  const [currentScreen, setCurrentScreen] = useState<"home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat">("apiKeySetup");
  const [chatMemberId, setChatMemberId] = useState<number | null>(null);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<{id: number, role: "user" | "assistant", content: string, created_at: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isGeneratingReply, setIsGeneratingReply] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // DB Sync Effect for Chat (Session creation and Message loading)
  useEffect(() => {
    if (currentScreen === "chat" && chatMemberId && dbInstance) {
      async function syncChat() {
        try {
          // 1. セッションがあるか確認
          let sessionRows = await dbInstance.select<{ id: number }[]>(
            "SELECT id FROM chat_sessions WHERE member_id = ? LIMIT 1",
            [chatMemberId]
          );
          let sId: number;
          if (sessionRows.length === 0) {
            // なければ新規作成
            const res = await dbInstance.execute(
              "INSERT INTO chat_sessions (member_id, started_at) VALUES (?, ?)",
              [chatMemberId, new Date().toISOString()]
            );
            sId = res.lastInsertId;
          } else {
            sId = sessionRows[0].id;
          }
          setChatSessionId(sId);

          // 2. メッセージ履歴の取得
          const msgs = await dbInstance.select<{id: number, session_id: number, sender: string, content: string, created_at: string}[]>(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            [sId]
          );
          
          // 画面表示用にフォーマット（dbのsenderをroleにマッピング）
          const formattedMsgs = msgs.map(m => ({
            id: m.id,
            role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
            created_at: m.created_at
          }));
          setChatMessages(formattedMsgs);
        } catch (e) {
          console.error("Failed to sync chat session / messages", e);
        }
      }
      syncChat();
    }
  }, [currentScreen, chatMemberId, dbInstance]);

  // チャット自動スクロール
  useEffect(() => {
    if (currentScreen === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isGeneratingReply, currentScreen]);

  // 新規プロジェクト作成用の状態
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [newProjectPurpose, setNewProjectPurpose] = useState<string>("");
  const [newProjectValues, setNewProjectValues] = useState<string>("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["strategy", "engineering", "legal", "marketing", "thinking_style"]);
  const [createProjectError, setCreateProjectError] = useState<string>("");
  const [apiKeysStatus, setApiKeysStatus] = useState<Record<ProviderType, boolean>>({
    [PROVIDERS.OPENAI]: false,
    [PROVIDERS.ANTHROPIC]: false,
    [PROVIDERS.GEMINI]: false,
    [PROVIDERS.TAVILY]: false,
    [PROVIDERS.BRAVE]: false
  });

  const [inputKeys, setInputKeys] = useState<Record<ProviderType, string>>({
    [PROVIDERS.OPENAI]: "",
    [PROVIDERS.ANTHROPIC]: "",
    [PROVIDERS.GEMINI]: "",
    [PROVIDERS.TAVILY]: "",
    [PROVIDERS.BRAVE]: ""
  });

  const [saveErrors, setSaveErrors] = useState<Record<ProviderType, string>>({
    [PROVIDERS.OPENAI]: "",
    [PROVIDERS.ANTHROPIC]: "",
    [PROVIDERS.GEMINI]: "",
    [PROVIDERS.TAVILY]: "",
    [PROVIDERS.BRAVE]: ""
  });

  const [successMsg, setSuccessMsg] = useState<string>("");

  // ユーザーコアプロフィール関連の状態
  const [coreProfile, setCoreProfile] = useState<string>("");
  const [editCoreProfile, setEditCoreProfile] = useState<string>("");
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string>("");
  const [profileSaveError, setProfileSaveError] = useState<string>("");


  // 役割に応じた背景色を取得（DESIGN_SYSTEM §2.3）
  const getRoleColor = (roleStr: string, deptName: string) => {
    const text = (roleStr + deptName).toLowerCase();
    if (text.includes("戦略") || text.includes("経営") || text.includes("pm")) return "#FAD8C3";
    if (text.includes("ui") || text.includes("ux") || text.includes("デザイン")) return "#D5E8D4";
    if (text.includes("エンジニア") || text.includes("技術")) return "#E1D5E7";
    if (text.includes("インフラ") || text.includes("セキュリティ")) return "#D4E8D4";
    if (text.includes("法務") || text.includes("コンプライアンス")) return "#E8E8E4";
    if (text.includes("思考スタイル") || text.includes("ドリーマー") || text.includes("代弁者")) return "#FEF3C7";
    return "var(--color-panel)";
  };

  const getEmojiForRole = (deptName: string, role: string) => {
    const text = (deptName + role).toLowerCase();
    if (text.includes("法務")) return "⚖️";
    if (text.includes("エンジニア") || text.includes("技術")) return "💻";
    if (text.includes("戦略") || text.includes("経営")) return "📊";
    if (text.includes("マーケティング")) return "📢";
    if (text.includes("思考スタイル")) return "💡";
    return "🧑‍💼";
  };

  const getAvatarPath = (avatarId: string) => {
    if (!avatarId) return "";
    if (avatarId.includes("strategy") || avatarId.includes("yamada")) return "/avatars/avatar_strategy.png";
    if (avatarId.includes("designer") || avatarId.includes("takahashi")) return "/avatars/avatar_designer.png";
    if (avatarId.includes("security") || avatarId.includes("tanaka")) return "/avatars/avatar_security.png";
    if (avatarId.includes("infrastructure") || avatarId.includes("sato")) return "/avatars/avatar_infrastructure.png";
    if (avatarId.includes("legal") || avatarId.includes("suzuki")) return "/avatars/avatar_legal.png";
    if (avatarId.includes("devil")) return "/avatars/avatar_security.png";
    return "";
  };

  // S2 (Dashboard) 関連の状態
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);

  // プロジェクト編集用の状態
  const [isEditingProject, setIsEditingProject] = useState<boolean>(false);
  const [editProjectPurpose, setEditProjectPurpose] = useState<string>("");
  const [editProjectValues, setEditProjectValues] = useState<string>("");

  // モデル管理用の状態
  const [availableModels, setAvailableModels] = useState<{ id: number; provider: string; model_id: string; display_name: string }[]>([]);
  const [newModelProvider, setNewModelProvider] = useState<string>("OpenAI");
  const [newModelId, setNewModelId] = useState<string>("");
  const [newModelDisplayName, setNewModelDisplayName] = useState<string>("");
  const [modelSyncStatus, setModelSyncStatus] = useState<string>("");
  const [settingsTab, setSettingsTab] = useState<"profile" | "apikeys" | "models">("profile");

  // メンバー編集モーダル用の状態（S5）
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [editMemberName, setEditMemberName] = useState<string>("");
  const [editMemberRole, setEditMemberRole] = useState<string>("");
  const [editMemberPersonality, setEditMemberPersonality] = useState<string>("");
  const [editMemberModel, setEditMemberModel] = useState<string>("");

  // APIキーからリアルタイムに利用可能モデルを取得してデータベースを同期する
  const syncAllAvailableModels = async (db: Database) => {
    let statusText: string[] = [];
    setModelSyncStatus("開始中...");
    try {
      const nowStr = new Date().toISOString();

      // 1. OpenAI モデルの同期
      const openaiKey = await getApiKey(PROVIDERS.OPENAI);
      if (openaiKey) {
        statusText.push("OpenAI: 接続中...");
        setModelSyncStatus(statusText.join(" | "));
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { "Authorization": `Bearer ${openaiKey}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.data)) {
              let count = 0;
              for (const m of data.data) {
                const id = m.id;
                if (id.startsWith("gpt-") || id.startsWith("o1-") || id.startsWith("o3-")) {
                  await db.execute(
                    "INSERT OR REPLACE INTO ai_models (provider, model_id, display_name, created_at) VALUES (?, ?, ?, ?)",
                    ["OpenAI", id, id, nowStr]
                  );
                  count++;
                }
              }
              statusText = statusText.filter(t => !t.startsWith("OpenAI:"));
              statusText.push(`OpenAI: ${count}件同期完了`);
            } else {
              statusText = statusText.filter(t => !t.startsWith("OpenAI:"));
              statusText.push("OpenAI: パース失敗");
            }
          } else {
            statusText = statusText.filter(t => !t.startsWith("OpenAI:"));
            statusText.push(`OpenAI: エラー (ステータス: ${res.status})`);
          }
        } catch (err) {
          statusText = statusText.filter(t => !t.startsWith("OpenAI:"));
          statusText.push(`OpenAI: 通信エラー (${String(err)})`);
        }
        setModelSyncStatus(statusText.join(" | "));
      } else {
        statusText.push("OpenAI: キー未登録");
        setModelSyncStatus(statusText.join(" | "));
      }

      // 2. Gemini モデルの同期
      const geminiKey = await getApiKey(PROVIDERS.GEMINI);
      if (geminiKey) {
        statusText.push("Gemini: 接続中...");
        setModelSyncStatus(statusText.join(" | "));
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.models)) {
              let count = 0;
              for (const m of data.models) {
                const name = m.name;
                const modelId = name.replace(/^models\//, "");
                const displayName = m.displayName || modelId;
                if (m.supportedGenerationMethods?.includes("generateContent")) {
                  await db.execute(
                    "INSERT OR REPLACE INTO ai_models (provider, model_id, display_name, created_at) VALUES (?, ?, ?, ?)",
                    ["Gemini", modelId, displayName, nowStr]
                  );
                  count++;
                }
              }
              statusText = statusText.filter(t => !t.startsWith("Gemini:"));
              statusText.push(`Gemini: ${count}件同期完了`);
            } else {
              statusText = statusText.filter(t => !t.startsWith("Gemini:"));
              statusText.push("Gemini: パース失敗");
            }
          } else {
            statusText = statusText.filter(t => !t.startsWith("Gemini:"));
            statusText.push(`Gemini: エラー (ステータス: ${res.status})`);
          }
        } catch (err) {
          statusText = statusText.filter(t => !t.startsWith("Gemini:"));
          statusText.push(`Gemini: 通信エラー (${String(err)})`);
        }
        setModelSyncStatus(statusText.join(" | "));
      } else {
        statusText.push("Gemini: キー未登録");
        setModelSyncStatus(statusText.join(" | "));
      }

      // 3. Anthropic モデルの同期 (API取得不可のため静的定義を同期)
      const anthropicKey = await getApiKey(PROVIDERS.ANTHROPIC);
      if (anthropicKey) {
        const defaultAnthropic = [
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet v2" },
          { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" }
        ];
        for (const m of defaultAnthropic) {
          await db.execute(
            "INSERT OR IGNORE INTO ai_models (provider, model_id, display_name, created_at) VALUES (?, ?, ?, ?)",
            ["Anthropic", m.id, m.name, nowStr]
          );
        }
        statusText.push("Anthropic: プリセット同期完了");
        setModelSyncStatus(statusText.join(" | "));
      }
    } catch (e) {
      console.error("Failed to sync models", e);
      setModelSyncStatus(`同期失敗: ${String(e)}`);
    }
  };

  // モデル一覧の取得
  const fetchModels = async () => {
    if (!dbInstance) return;
    try {
      const result = await dbInstance.select<{ id: number; provider: string; model_id: string; display_name: string }[]>(
        "SELECT id, provider, model_id, display_name FROM ai_models ORDER BY provider, display_name"
      );
      setAvailableModels(result);
    } catch (e) {
      console.error("Failed to fetch models", e);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [dbInstance]);

  // 初期化とAPIキーの存在チェック
  useEffect(() => {
    async function initApp() {
      try {
        // 1. データベースの初期化とシードデータの確認
        const db = await Database.load("sqlite:ai_company.db");
        setDbInstance(db);

        // ai_models テーブルの作成 (もし存在しなければ)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS ai_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            model_id TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        // 初期モデルシードの投入
        const modelsCount = await db.select<{ count: number }[]>(
          "SELECT COUNT(*) as count FROM ai_models"
        );
        if ((modelsCount[0]?.count || 0) === 0) {
          const nowStr = new Date().toISOString();
          const defaultModels = [
            { provider: "OpenAI", id: "gpt-4o", name: "GPT-4o" },
            { provider: "OpenAI", id: "gpt-4o-mini", name: "GPT-4o Mini" },
            { provider: "Anthropic", id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet v2" },
            { provider: "Anthropic", id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
            { provider: "Gemini", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
            { provider: "Gemini", id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }
          ];
          for (const m of defaultModels) {
            await db.execute(
              "INSERT OR IGNORE INTO ai_models (provider, model_id, display_name, created_at) VALUES (?, ?, ?, ?)",
              [m.provider, m.id, m.name, nowStr]
            );
          }
        }

        const countResult = await db.select<{ count: number }[]>(
          "SELECT COUNT(*) as count FROM members"
        );
        const memberCount = countResult[0]?.count || 0;

        // membersが0件（データが未登録）の場合のみ初期データを注入
        if (memberCount === 0) {
          const nowStr = new Date().toISOString();
          await db.execute("DELETE FROM members");
          await db.execute("DELETE FROM departments");
          await db.execute("DELETE FROM projects");
          await db.execute("DELETE FROM users");
          
          await db.execute(
            "INSERT INTO users (id, core_profile, created_at, updated_at) VALUES (?, ?, ?, ?)",
            [
              1, 
              "【ユーザー像】NWエンジニア10年、PM2年経験。隙間時間の5分で完結する設計を徹底してほしい。\n【コアバリュー】生命の最適利用、少年の眼差し、絶対積極。",
              nowStr, 
              nowStr
            ]
          );

          await db.execute(
            'INSERT INTO projects (id, name, purpose, "values", created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              1, 
              "NPO-Trust-Platform", 
              "非営利団体の活動実績と資金使途を透明化し、寄付者への信頼性を最大化するプラットフォーム", 
              "透明性と実現可能性を最優先し、持続可能かつ堅牢なシステムを構築すること。",
              nowStr, 
              nowStr
            ]
          );

          await db.execute(
            "INSERT INTO departments (id, project_id, name, department_prompt, display_order, is_thinking_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              1, 
              1, 
              "法務・コンプライアンス部", 
              "慎重でリスク回避的。規約や合意事項の一言一句にこだわり、将来的なトラブル（訴訟、権利侵害、契約違反）を防止するための防衛策を徹底的に講じる立場から議論に参加する。",
              1,
              0,
              nowStr,
              nowStr
            ]
          );

          await db.execute(
            "INSERT INTO departments (id, project_id, name, department_prompt, display_order, is_thinking_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              2, 
              1, 
              "思考スタイル部", 
              "（部署としての性質はありません。個人の思考法をダイレクトに展開します）",
              2,
              1,
              nowStr,
              nowStr
            ]
          );

          await db.execute(
            "INSERT INTO members (id, department_id, name, role, personality_prompt, avatar_id, ai_model, is_thinking_style_member, is_active_in_meeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              1,
              1, 
              "契約レビュー担当 鈴木",
              "提携契約や利用規約のリーガルチェック",
              "冷静沈着で丁寧な敬語。曖昧な表現や法的リスクに対して極めて敏感であり、明確な定義とエビデンスを要求する。",
              "avatar_suzuki",
              "claude-sonnet-3.5",
              0,
              1,
              nowStr,
              nowStr
            ]
          );

          await db.execute(
            "INSERT INTO members (id, department_id, name, role, personality_prompt, avatar_id, ai_model, is_thinking_style_member, is_active_in_meeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              2,
              2, 
              "悪魔の代弁者（デビルズ・アドボケイト）",
              "あえて批判的・懐疑的な立場から意見を述べ、議論の死角をあぶり出す",
              "自信に満ち、辛口でストレート。計画の欠陥や失敗要因を「もし〜ならどうする？」という問いかけを通じてあぶり出す。",
              "avatar_devil",
              "gpt-4o",
              1,
              1,
              nowStr,
              nowStr
            ]
          );
        }

        // 1.5. ユーザーコアプロフィールの読み込み
        const userResult = await db.select<{ core_profile: string }[]>(
          "SELECT core_profile FROM users WHERE id = 1"
        );
        if (userResult && userResult.length > 0) {
          const profile = userResult[0].core_profile || "";
          setCoreProfile(profile);
          setEditCoreProfile(profile);
        }

        // 2. セキュリティ金庫（APIキー）の登録状態を確認
        await refreshApiKeysStatus();

        // 3. APIキーが登録されているプロバイダーの最新モデルをAPIからリアルタイム同期
        await syncAllAvailableModels(db);
        await fetchModels();

        setLoading(false);
      } catch (err) {
        console.error(err);
        setInitError(String(err));
        setLoading(false);
      }
    }

    initApp();
  }, []);

  // 設定画面を開いたときに自動的に最新モデル同期を行う
  useEffect(() => {
    if (currentScreen === "settings" && dbInstance) {
      syncAllAvailableModels(dbInstance).then(() => {
        fetchModels();
      });
    }
  }, [currentScreen, dbInstance]);

  // APIキーの保存状況を最新にする
  async function refreshApiKeysStatus() {
    const openaiKey = await getApiKey(PROVIDERS.OPENAI);
    const anthropicKey = await getApiKey(PROVIDERS.ANTHROPIC);
    const geminiKey = await getApiKey(PROVIDERS.GEMINI);
    const tavilyKey = await getApiKey(PROVIDERS.TAVILY);
    const braveKey = await getApiKey(PROVIDERS.BRAVE);

    const hasAny = !!(openaiKey || anthropicKey || geminiKey);
    setApiKeysStatus({
      [PROVIDERS.OPENAI]: !!openaiKey,
      [PROVIDERS.ANTHROPIC]: !!anthropicKey,
      [PROVIDERS.GEMINI]: !!geminiKey,
      [PROVIDERS.TAVILY]: !!tavilyKey,
      [PROVIDERS.BRAVE]: !!braveKey,
    });

    // キーが1つ以上登録されていれば、初期起動時の強制セットアップをスキップ可能にする
    if (hasAny) {
      setCurrentScreen("home");
    } else {
      setCurrentScreen("apiKeySetup");
    }
  }


  // プロジェクト一覧の取得
  const fetchProjects = async () => {
    if (!dbInstance) return;
    try {
      const result = await dbInstance.select<{id: number, name: string, purpose: string}[]>(
        "SELECT id, name, purpose FROM projects"
      );
      setProjects(result);
      if (result.length > 0 && selectedProjectId === null) {
        setSelectedProjectId(result[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [dbInstance]);

  // 選択中プロジェクトのメンバー取得
  const fetchMembers = async () => {
    if (!dbInstance || selectedProjectId === null) return;
    try {
      const result = await dbInstance.select<{id: number, name: string, role: string, avatar_id: string, dept_name: string, personality_prompt: string}[]>(
        `SELECT m.id, m.name, m.role, m.avatar_id, m.personality_prompt, d.name as dept_name
         FROM members m
         JOIN departments d ON m.department_id = d.id
         WHERE d.project_id = ?
         ORDER BY d.display_order, m.id`,
         [selectedProjectId]
      );
      setProjectMembers(result);
    } catch (e) {
      console.error("Failed to fetch members", e);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [dbInstance, selectedProjectId]);

  // プロジェクト作成処理
  const handleCreateProject = async () => {
    if (!dbInstance) return;
    if (!newProjectName.trim()) {
      setCreateProjectError("プロジェクト名を入力してください。");
      return;
    }

    try {
      setCreateProjectError("");
      const nowStr = new Date().toISOString();
      
      // 1. プロジェクトを挿入
      const projResult = await dbInstance.execute(
        'INSERT INTO projects (name, purpose, "values", created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [newProjectName, newProjectPurpose, newProjectValues, nowStr, nowStr]
      );

      // 2. 挿入したプロジェクトのIDを取得
      const projectId = projResult.lastInsertId;

      // 3. 選択された部署とメンバーを挿入
      let deptOrder = 1;
      for (const preset of DEPT_PRESETS) {
        if (selectedDepts.includes(preset.key)) {
          const isThinking = preset.is_thinking_style ? 1 : 0;
          const deptResult = await dbInstance.execute(
            "INSERT INTO departments (project_id, name, department_prompt, display_order, is_thinking_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [projectId, preset.name, preset.prompt, deptOrder++, isThinking, nowStr, nowStr]
          );

          const departmentId = deptResult.lastInsertId;

          for (const member of preset.members) {
            await dbInstance.execute(
              "INSERT INTO members (department_id, name, role, personality_prompt, avatar_id, ai_model, is_thinking_style_member, is_active_in_meeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [
                departmentId,
                member.name,
                member.role,
                member.personality,
                member.avatar,
                member.is_thinking ? "gpt-4o" : "claude-sonnet-3.5",
                member.is_thinking,
                1,
                nowStr,
                nowStr
              ]
            );
          }
        }
      }

      // 作成後のクリーンアップと遷移
      setNewProjectName("");
      setNewProjectPurpose("");
      setNewProjectValues("");
      setSelectedDepts(["strategy", "engineering", "legal", "marketing", "thinking_style"]);
      
      // プロジェクト一覧を更新し、作成したプロジェクトを選択状態にする
      await fetchProjects();
      setSelectedProjectId(projectId as number);
      setCurrentScreen("home");
    } catch (e) {
      console.error("Failed to create project", e);
      setCreateProjectError(`プロジェクト作成失敗: ${String(e)}`);
    }
  };

  // プロジェクト設定の更新処理
  const handleSaveProjectSettings = async () => {
    if (!dbInstance || selectedProjectId === null) return;
    try {
      const nowStr = new Date().toISOString();
      await dbInstance.execute(
        'UPDATE projects SET purpose = ?, "values" = ?, updated_at = ? WHERE id = ?',
        [editProjectPurpose, editProjectValues, nowStr, selectedProjectId]
      );
      await fetchProjects();
      setIsEditingProject(false);
    } catch (e) {
      console.error("Failed to update project settings", e);
      alert(`更新に失敗しました: ${String(e)}`);
    }
  };

  // APIキーの個別保存処理
  async function handleSaveKey(provider: ProviderType) {
    try {
      setSaveErrors((prev) => ({ ...prev, [provider]: "" }));
      setSuccessMsg("");
      const keyVal = inputKeys[provider];

      if (!keyVal.trim()) {
        setSaveErrors((prev) => ({ ...prev, [provider]: "APIキーを入力してください" }));
        return;
      }

      await saveApiKey(provider, keyVal);
      setInputKeys((prev) => ({ ...prev, [provider]: "" }));
      setSuccessMsg(`${provider.toUpperCase()} のAPIキーをセキュアストレージに安全に保管しました！`);
      
      // 保存完了後に再スキャン
      await refreshApiKeysStatus();
      if (dbInstance) {
        await syncAllAvailableModels(dbInstance);
        await fetchModels();
      }
    } catch (err) {
      console.error(err);
      setSaveErrors((prev) => ({ ...prev, [provider]: `保存失敗: ${String(err)}` }));
    }
  }

  // APIキーの個別削除処理
  async function handleDeleteKey(provider: ProviderType) {
    try {
      setSuccessMsg("");
      await deleteApiKey(provider);
      setSuccessMsg(`${provider.toUpperCase()} のAPIキーを金庫から削除しました。`);
      await refreshApiKeysStatus();
      if (dbInstance) {
        await fetchModels();
      }
    } catch (err) {
      console.error(err);
      alert(`削除に失敗しました: ${String(err)}`);
    }
  }

  // コアプロフィールのDB保存処理
  async function handleSaveProfile() {
    if (!dbInstance) return;
    try {
      setProfileSaveSuccess("");
      setProfileSaveError("");

      const nowStr = new Date().toISOString();
      await dbInstance.execute(
        "UPDATE users SET core_profile = ?, updated_at = ? WHERE id = 1",
        [editCoreProfile, nowStr]
      );

      setCoreProfile(editCoreProfile);
      setProfileSaveSuccess("コアプロフィールをデータベースに安全に保存しました！");
    } catch (err) {
      console.error(err);
      setProfileSaveError(`プロフィール保存失敗: ${String(err)}`);
    }
  }

  // メンバーが切り替わった時、またはDB初期化完了時にマージプロンプトを生成 (テスト用)
  useEffect(() => {
    if (!dbInstance || loading || initError || currentScreen !== "promptTest") return;

    async function generatePrompt() {
      try {
        setGenerateError("");
        const prompt = await getMergedSystemPrompt(dbInstance as Database, {
          userId: 1,
          projectId: 1,
          memberId: selectedMemberId,
        });
        setMergedPrompt(prompt);
      } catch (err) {
        console.error(err);
        setGenerateError(`プロンプト生成失敗: ${String(err)}`);
      }
    }

    generatePrompt();
  }, [selectedMemberId, dbInstance, loading, initError, currentScreen, coreProfile]);

  if (loading) {
    return (
      <div className="p-8 bg-[var(--color-bg)] min-h-screen flex items-center justify-center text-[var(--color-text)]">
        <p className="text-xl font-bold animate-pulse">システム起動中（ローカルDB＆金庫の接続中）...</p>
      </div>
    );
  }

  return (
    <main className="bg-[var(--color-bg)] overflow-hidden text-[var(--color-text)] flex flex-col p-8 gap-6" style={{ height: '100vh', border: "6px solid var(--color-border-outer)", borderRadius: "8px", boxShadow: "inset 0 0 20px rgba(139,90,43,0.2)", boxSizing: 'border-box' }}>
      {/* 共通ヘッダー */}
      <div className="border-b-[4px] border-[var(--color-border-outer)] pb-4 flex justify-between items-center bg-[var(--color-panel)] p-4 rounded-lg shadow-sm shrink-0">
        <div
          onClick={() => {
            if (Object.values(apiKeysStatus).some((v) => v)) {
              setCurrentScreen("home");
            }
          }}
          className={`cursor-pointer ${Object.values(apiKeysStatus).some((v) => v) ? "hover:opacity-80 transition-opacity" : ""}`}
          title={Object.values(apiKeysStatus).some((v) => v) ? "ホーム画面に戻る" : ""}
        >
          <h1 className="font-title text-4xl text-[var(--color-border-outer)] flex items-center gap-2">🪵 AIカンパニー</h1><span className="ml-4 text-sm text-[var(--color-text-sub)] font-sans">Build the perfect AI team for your mission. 🌸</span>
        </div>
        <div className="flex gap-2">
          {Object.values(apiKeysStatus).some((v) => v) && currentScreen !== "home" && (
            <button
              onClick={() => setCurrentScreen("home")}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50 btn-secondary"
            >
              🏠 ホーム
            </button>
          )}
          <button onClick={() => setCurrentScreen("settings")} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold" disabled={!Object.values(apiKeysStatus).some((v) => v)} title={!Object.values(apiKeysStatus).some((v) => v) ? "APIキーを設定してください" : "設定画面を開く"}>⚙ 設定</button>
          <button
            onClick={async () => {
              const hasAny = await hasAnyApiKey();
              if (!hasAny) {
                alert("APIキーが1つも登録されていません。先に設定してください。");
                return;
              }
              setCurrentScreen("promptTest");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              currentScreen === "promptTest"
                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent-shadow)]"
                : "bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50"
            }`}
            disabled={!Object.values(apiKeysStatus).some((v) => v)}
          >
            📊 マージ検証テスト (ノードB)
          </button>
        </div>
      </div>

      {initError && (
        <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg flex flex-col gap-1 shadow-sm">
          <p className="font-bold text-sm">⚠️ 起動時初期化エラー</p>
          <p className="text-xs font-mono">{initError}</p>
        </div>
      )}


      {/* S2: プロジェクト一覧（ホーム）画面 */}
      {currentScreen === "home" && (
        <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '24px', overflow: 'hidden' }}>
          {/* 左サイドバー */}
          <div className="w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="panel-paper p-3 text-center mb-2 shrink-0">
              <h2 className="font-title text-xl font-bold">プロジェクト 🌿</h2>
            </div>

            <div className="flex-1 flex flex-col gap-2" style={{ overflowY: 'auto', minHeight: 0 }}>
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={selectedProjectId === proj.id ? "sidebar-item-active" : "sidebar-item"}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌱</span>
                    <span className="truncate">{proj.name}</span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => {
                setCreateProjectError("");
                setCurrentScreen("createProject");
              }}
              className="btn-secondary w-full justify-center shrink-0 py-3"
            >
              ＋ 新しいプロジェクト
            </button>
          </div>

          {/* 右メインエリア: flex-colで「スクロール域」と「フッターボタン」を確実に分離 */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {selectedProjectId ? (
              (() => {
                // 部署ごとにメンバーをグループ化
                const deptsMap: { [key: string]: any[] } = {};
                projectMembers.forEach((m) => {
                  if (!deptsMap[m.dept_name]) {
                    deptsMap[m.dept_name] = [];
                  }
                  deptsMap[m.dept_name].push(m);
                });

                const project = projects.find((p) => p.id === selectedProjectId);

                return (
                  <>
                    {/* スクロールするコンテンツ領域 */}
                    <div style={{ flex: '1 1 0%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px', minHeight: 0 }}>
                      {/* ヘッダー情報 */}
                      <div className="panel-paper p-6 flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                          <div className="text-5xl shrink-0">🌱</div>
                          <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold mb-1 truncate">
                              {project?.name}
                            </h2>
                            <div className="text-sm text-[var(--color-text-sub)] space-y-2 mt-2">
                              <div>
                                <span className="font-bold text-xs text-gray-500 block">🎯 プロジェクトの目的</span>
                                <p className="mt-0.5 leading-relaxed">{project?.purpose || "目的が未設定です"}</p>
                              </div>
                              <div>
                                <span className="font-bold text-xs text-gray-500 block">💎 価値観・判断基準（コンテキスト）</span>
                                <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">{project?.values || "価値観が未設定です"}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button 
                              className="btn-secondary text-xs py-2 px-3 text-left whitespace-nowrap"
                              onClick={() => {
                                if (project) {
                                  setEditProjectPurpose(project.purpose || "");
                                  setEditProjectValues(project.values || "");
                                  setIsEditingProject(true);
                                }
                              }}
                            >
                              📝 コンテキスト編集
                            </button>
                            <button className="btn-secondary text-xs py-2 px-3 text-left whitespace-nowrap" onClick={() => setCurrentScreen("teamManage")}>👥 チームを管理する</button>
                          </div>
                        </div>
                      </div>

                      {/* 統計情報 */}
                      <div className="flex gap-4"><div className="panel-paper px-5 py-3 flex items-center gap-3 border-2 border-[var(--color-border-inner)] bg-[var(--color-bg)]"><span>👥 {projectMembers.length} メンバー</span></div><div className="panel-paper px-5 py-3 flex items-center gap-3 border-2 border-[var(--color-border-inner)] bg-[var(--color-bg)]"><span>📅 最終会議: --</span></div><div className="panel-paper px-5 py-3 flex items-center gap-3 border-2 border-[var(--color-border-inner)] bg-[var(--color-bg)]"><span>🎙️ 会議回数: 0回</span></div></div>

                      {/* メンバーグリッド（部署グループごと） */}
                      <div className="mt-4">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                          <span>👥</span> チームメンバー
                        </h3>

                        {Object.keys(deptsMap).map((deptName) => (
                          <div key={deptName} className="mb-8 last:mb-0">
                            {/* 部署ヘッダーラベル */}
                            <div className="flex items-center justify-between border-b-2 border-[var(--color-border-inner)] pb-2 mb-4 px-1">
                              <span className="font-bold text-sm text-[var(--color-text-sub)] flex items-center gap-1.5">
                                📁 {deptName}
                              </span>
                              <span className="text-[10px] bg-[#EDD9B0] text-[var(--color-text-sub)] border border-[var(--color-border-inner)] px-2 py-0.5 rounded font-bold shadow-sm">
                                ✓ 価値観を継承中
                              </span>
                            </div>

                            {/* 部署内メンバーカードの横並びグリッド */}
                            <div 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                                gap: '20px' 
                              }} 
                              className="w-full"
                            >
                              {deptsMap[deptName].map((member) => (
                                <div
                                  key={member.id}
                                  className="panel-paper flex flex-col items-center p-4 text-center relative overflow-hidden shadow transition-all hover:-translate-y-1 hover:shadow-md max-w-[220px] w-full mx-auto"
                                  style={{ backgroundColor: getRoleColor(member.role, member.dept_name), boxShadow: "2px 4px 0px var(--color-border-inner)" }}
                                >
                                  {/* アバター画像枠 */}
                                  <div 
                                    className="bg-white/60 rounded-xl flex items-center justify-center border-2 border-[var(--color-border-inner)] avatar-pixel shadow-inner overflow-hidden mb-3 shrink-0"
                                    style={{ width: '100px', height: '100px' }}
                                  >
                                    {getAvatarPath(member.avatar_id) ? (
                                      <img 
                                        src={getAvatarPath(member.avatar_id)} 
                                        alt={member.name}
                                        className="w-full h-full object-cover select-none"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <span className="text-4xl">{getEmojiForRole(member.dept_name, member.role)}</span>
                                    )}
                                  </div>
                                  {/* 役割名 */}
                                  <h4 className="font-bold text-sm mb-1 text-[var(--color-text)]">
                                    {member.name}
                                  </h4>
                                  {/* 役割の説明 */}
                                  <p className="text-xxs text-[var(--color-text-sub)] leading-relaxed max-w-[180px] h-10 overflow-y-auto mb-3">
                                    {member.role}
                                  </p>
                                  {/* 1on1で話すボタンを追加 */}
                                  <button
                                    onClick={() => {
                                      setChatMemberId(member.id);
                                      setCurrentScreen("chat");
                                    }}
                                    className="btn-secondary w-full justify-center py-1 text-xs shrink-0"
                                    style={{ padding: '0.25rem 0.5rem', boxShadow: '0px 2px 0px var(--color-border-inner)' }}
                                  >
                                    💬 1on1で話す
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* 全体メンバー追加プレースホルダー */}
                        <div className="mt-6 flex justify-start">
                          <div 
                            className="panel-paper flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-[#EDD9B0] transition-all border-dashed border-4 border-[var(--color-border-inner)] opacity-70 hover:opacity-90 w-full max-w-[220px]"
                            style={{ minHeight: '172px' }}
                          >
                            <span className="text-3xl text-[var(--color-text-sub)] mb-1">＋</span>
                            <span className="font-bold text-xs text-[var(--color-text-sub)]">メンバーを追加</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 会議開始フッター（スクロール外の固定フッター＝絶対配置なし） */}
                    <div 
                      className="border-t-2 border-[var(--color-border-inner)] bg-[var(--color-panel)] flex justify-end"
                      style={{ padding: '12px 24px', flexShrink: 0 }}
                    >
                      <button
                        onClick={() => alert("会議機能は今後実装予定です")}
                        className="btn-primary text-lg py-3 px-8 rounded-xl shadow-lg hover:scale-105 transition-transform"
                      >
                        <span className="text-2xl">🎙️</span> 会議を始める
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="panel-paper p-10 flex flex-col items-center justify-center h-full gap-4 text-[var(--color-text-sub)]">
                <span className="text-4xl">🌱</span>
                <div className="flex flex-col items-center justify-center h-full"><div className="text-6xl mb-4">🏡</div><p className="font-title text-3xl text-center leading-relaxed">あなたのミッションのために、<br/>最高のAIチームをつくりましょう。🌸</p></div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* S4: チーム管理画面 */}
      {currentScreen === "teamManage" && projects.find(p => p.id === selectedProjectId) && (
        <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '24px', overflow: 'hidden' }}>
          {/* 左サイドバー */}
          <div className="w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="panel-paper p-3 text-center mb-2 shrink-0">
              <h2 className="font-title text-xl font-bold">プロジェクト 🌿</h2>
            </div>
            <div className="flex-1 flex flex-col gap-2" style={{ overflowY: 'auto', minHeight: 0 }}>
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={selectedProjectId === proj.id ? "sidebar-item-active" : "sidebar-item"}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌱</span>
                    <span className="truncate">{proj.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setCreateProjectError("");
                setCurrentScreen("createProject");
              }}
              className="btn-secondary w-full justify-center shrink-0 py-3"
            >
              ＋ 新しいプロジェクト
            </button>
          </div>

          {/* 右メインエリア */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {/* メインエリアヘッダー */}
            <div className="panel-paper p-4 flex justify-between items-center mb-4 shrink-0">
              <h2 className="font-bold text-xl">{projects.find(p => p.id === selectedProjectId)?.name} チーム ✏️</h2>
              <button className="btn-secondary" onClick={() => setCurrentScreen("home")}>← プロジェクトに戻る</button>
            </div>

            {/* メンバーリスト（縦型） */}
            <div style={{ flex: '1 1 0%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px', minHeight: 0 }}>
              {projectMembers.map((member) => (
                <div key={member.id} className="panel-paper flex items-center p-3 gap-4 shadow-sm" style={{ backgroundColor: 'var(--color-bg)' }}>
                  {/* アバター画像枠 */}
                  <div className="bg-white/60 rounded flex items-center justify-center border-2 border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0" style={{ width: '60px', height: '60px' }}>
                    {getAvatarPath(member.avatar_id) ? (
                      <img src={getAvatarPath(member.avatar_id)} alt={member.name} className="w-full h-full object-cover select-none" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
                    ) : (
                      <span className="text-2xl">{getEmojiForRole(member.dept_name, member.role)}</span>
                    )}
                  </div>

                  {/* 情報エリア */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-[var(--color-text)] truncate">{member.name}</h4>
                      <span className="text-[10px] text-[var(--color-text-sub)] border border-[var(--color-border-inner)] px-2 py-0.5 rounded font-bold shadow-sm whitespace-nowrap" style={{ backgroundColor: getRoleColor(member.role, member.dept_name) }}>
                        {member.role}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-sub)] truncate">
                      {member.personality_prompt.substring(0, 50)}...
                    </p>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary text-green-700 py-1.5" onClick={() => { setChatMemberId(member.id); setCurrentScreen("chat"); }}>💬 話す</button>
                    <button 
                      className="btn-secondary text-purple-700 py-1.5" 
                      onClick={() => {
                        setEditingMember(member);
                        setEditMemberName(member.name);
                        setEditMemberRole(member.role || "");
                        setEditMemberPersonality(member.personality_prompt || "");
                        setEditMemberModel(member.ai_model || "");
                      }}
                    >
                      ✏️ 編集
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="mt-4 pt-4 border-t-2 border-[var(--color-border-inner)] flex justify-between items-center gap-4">
              <button className="btn-secondary border-dashed w-1/3 justify-center py-3 text-sm">＋ メンバーを追加</button>
              <button className="btn-primary flex-1 justify-center py-3 text-lg" onClick={() => setCurrentScreen("promptTest")}>🎙️ 会議を開始する</button>
            </div>
          </div>
        </div>
      )}


      {/* S6: 1on1チャット画面 */}
      {currentScreen === "chat" && chatMemberId && (
        <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '24px', overflow: 'hidden' }}>
          {/* 左サイドバー */}
          <div className="w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="panel-paper p-3 text-center mb-2 shrink-0">
              <h2 className="font-title text-xl font-bold">プロジェクト 🌿</h2>
            </div>
            <div className="flex-1 flex flex-col gap-2" style={{ overflowY: 'auto', minHeight: 0 }}>
              {projects.map((proj) => (
                <div key={proj.id} onClick={() => setSelectedProjectId(proj.id)} className={selectedProjectId === proj.id ? "sidebar-item-active" : "sidebar-item"}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌱</span><span className="truncate">{proj.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右メインエリア */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            {/* メインエリアヘッダー */}
            <div className="panel-paper p-4 flex justify-between items-center mb-4 shrink-0">
              <div className="flex items-center gap-3">
                {(() => {
                  const m = projectMembers.find(m => m.id === chatMemberId);
                  return m ? (
                    <>
                      <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0" style={{ width: '40px', height: '40px' }}>
                        {getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt={m.name} className="w-full h-full object-cover" /> : <span>{getEmojiForRole(m.dept_name, m.role)}</span>}
                      </div>
                      <h2 className="font-bold text-lg">{m.name}</h2>
                      <span className="text-[10px] text-[var(--color-text-sub)] border border-[var(--color-border-inner)] px-2 py-0.5 rounded font-bold shadow-sm" style={{ backgroundColor: getRoleColor(m.role, m.dept_name) }}>{m.role}</span>
                    </>
                  ) : null;
                })()}
              </div>
              <button className="btn-secondary" onClick={() => setCurrentScreen("teamManage")}>← チームに戻る</button>
            </div>

            {/* チャットエリア */}
            <div className="panel-paper mb-4 p-4 flex flex-col gap-4 bg-[var(--color-bg)]" style={{ flex: '1 1 0%', overflowY: 'auto', minHeight: 0 }}>
              {chatMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-sub)] opacity-70 gap-2 h-full py-10">
                  <span className="text-4xl">💬</span>
                  <p className="text-sm font-bold">まだメッセージはありません。</p>
                  <p className="text-xs">このメンバーに相談してみましょう！</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0 mr-2" style={{ width: '30px', height: '30px' }}>
                         {(() => {
                            const m = projectMembers.find(m => m.id === chatMemberId);
                            return m && getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt="AI" className="w-full h-full object-cover" /> : <span>🤖</span>;
                         })()}
                      </div>
                    )}
                    <div className={`px-4 py-2 rounded-2xl max-w-[70%] text-sm ${msg.role === 'user' ? 'bg-[var(--color-bg)] border-2 border-[var(--color-border-inner)] text-[var(--color-text)] rounded-br-sm' : 'bg-white border-2 border-[var(--color-border-inner)] text-[var(--color-text)] rounded-bl-sm shadow-sm'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}

              {isGeneratingReply && (
                <div className="flex justify-start items-center">
                  <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0 mr-2" style={{ width: '30px', height: '30px' }}>
                     {(() => {
                        const m = projectMembers.find(m => m.id === chatMemberId);
                        return m && getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt="AI" className="w-full h-full object-cover" /> : <span>🤖</span>;
                     })()}
                  </div>
                  <div className="px-4 py-2 rounded-2xl max-w-[70%] bg-white border-2 border-[var(--color-border-inner)] text-[var(--color-text-sub)] text-sm rounded-bl-sm shadow-sm animate-pulse">
                    🤔 考え中...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 入力フォームフッター */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if(!chatInput.trim() || !dbInstance || !chatMemberId || !chatSessionId || isGeneratingReply) return;
              const msgText = chatInput;
              setChatInput("");
              setIsGeneratingReply(true);
              try {
                // 1. ユーザーメッセージをDBに保存
                await dbInstance.execute(
                  'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
                  [chatSessionId, 'user', msgText, new Date().toISOString()]
                );
                const msgs = await dbInstance.select<{id: number, session_id: number, sender: string, content: string, created_at: string}[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
                const formattedMsgs = msgs.map(m => ({
                  id: m.id,
                  role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                  content: m.content,
                  created_at: m.created_at
                }));
                setChatMessages(formattedMsgs);

                // 2. プロバイダーのAPIキーとモデルを特定
                const member = projectMembers.find(m => m.id === chatMemberId);
                const modelId = member?.ai_model || "gpt-4o";
                let providerType: ProviderType | null = null;
                let apiKey = "";

                if (modelId.includes("gpt")) providerType = PROVIDERS.OPENAI;
                else if (modelId.includes("claude")) providerType = PROVIDERS.ANTHROPIC;
                else if (modelId.includes("gemini")) providerType = PROVIDERS.GEMINI;

                if (providerType) {
                  const key = await getApiKey(providerType);
                  if (key) apiKey = key;
                }

                if (!apiKey) {
                   await dbInstance.execute(
                     'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
                     [chatSessionId, 'member', 'APIキーが設定されていません。設定画面からAPIキーを登録してください。', new Date().toISOString()]
                   );
                   const finalMsgs = await dbInstance.select<{id: number, session_id: number, sender: string, content: string, created_at: string}[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
                   const finalFormatted = finalMsgs.map(m => ({
                     id: m.id,
                     role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                     content: m.content,
                     created_at: m.created_at
                   }));
                   setChatMessages(finalFormatted);
                   return;
                }

                // 3. システムプロンプトの組み立て
                const projectId = selectedProjectId;
                let sysPrompt = "";
                if (projectId) {
                  try {
                    sysPrompt = await getMergedSystemPrompt(dbInstance, {
                      userId: 1, // Phase1では1固定
                      projectId,
                      memberId: chatMemberId
                    });
                  } catch (e) {
                    console.error("System prompt merge error:", e);
                  }
                }

                // 4. APIコール
                let replyContent = "（APIコールエラー）";

                try {
                  if (providerType === PROVIDERS.OPENAI) {
                     const response = await fetch("https://api.openai.com/v1/chat/completions", {
                       method: "POST",
                       headers: {
                         "Content-Type": "application/json",
                         "Authorization": `Bearer ${apiKey}`
                       },
                       body: JSON.stringify({
                         model: modelId,
                         messages: [
                           { role: "system", content: sysPrompt },
                           ...formattedMsgs.map(m => ({ role: m.role, content: m.content }))
                         ]
                       })
                     });
                     const data = await response.json();
                     if (data.choices && data.choices[0]) {
                       replyContent = data.choices[0].message.content;
                     } else {
                       console.error("OpenAI API response format error:", data);
                       replyContent = JSON.stringify(data);
                     }
                  } else if (providerType === PROVIDERS.ANTHROPIC) {
                     const response = await fetch("https://api.anthropic.com/v1/messages", {
                       method: "POST",
                       headers: {
                         "Content-Type": "application/json",
                         "x-api-key": apiKey,
                         "anthropic-version": "2023-06-01",
                         "anthropic-dangerous-direct-browser-access": "true"
                       },
                       body: JSON.stringify({
                         model: modelId,
                         system: sysPrompt,
                         max_tokens: 1024,
                         messages: formattedMsgs.map(m => ({ role: m.role, content: m.content }))
                       })
                     });
                     const data = await response.json();
                     if (data.content && data.content[0]) {
                        replyContent = data.content[0].text;
                     } else {
                        console.error("Anthropic API response format error:", data);
                        replyContent = JSON.stringify(data);
                     }
                  } else if (providerType === PROVIDERS.GEMINI) {
                     const geminiMsgs = formattedMsgs.map(m => ({
                        role: m.role === 'user' ? 'user' : 'model',
                        parts: [{ text: m.content }]
                     }));
                     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          system_instruction: { parts: [{ text: sysPrompt }] },
                          contents: geminiMsgs
                        })
                     });
                     const data = await response.json();
                     if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                        replyContent = data.candidates[0].content.parts[0].text;
                     } else {
                        console.error("Gemini API response format error:", data);
                        replyContent = JSON.stringify(data);
                     }
                  }
                } catch (apiErr) {
                   console.error("API Call failed:", apiErr);
                   replyContent = `APIリクエストに失敗しました: ${apiErr}`;
                }

                // 5. 返答の保存と画面への反映
                await dbInstance.execute(
                  'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
                  [chatSessionId, 'member', replyContent, new Date().toISOString()]
                );

                const finalMsgs = await dbInstance.select<{id: number, session_id: number, sender: string, content: string, created_at: string}[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
                const finalFormatted = finalMsgs.map(m => ({
                  id: m.id,
                  role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                  content: m.content,
                  created_at: m.created_at
                }));
                setChatMessages(finalFormatted);

              } catch(err) { 
                console.error(err); 
              } finally {
                setIsGeneratingReply(false);
              }
            }} className="flex gap-2 shrink-0">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} className="input-wood flex-1" placeholder="メッセージを入力..." disabled={isGeneratingReply} />
              <button type="submit" className="btn-primary" disabled={!chatInput.trim() || isGeneratingReply}>📨 {isGeneratingReply ? "送信中..." : "送信"}</button>
            </form>
          </div>
        </div>
      )}

      {/* S1: APIキー設定画面 */}
      {currentScreen === "apiKeySetup" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 mt-4 pb-8">
          {/* 説明パネル */}
          <div className="panel-paper p-5 shadow-sm flex flex-col gap-2">
            <h2 className="font-bold text-lg flex items-center gap-1">
              🗝️ 初回設定: APIキーの安全な保管
            </h2>
            <p className="text-sm leading-relaxed text-[var(--color-text-sub)]">
              AIカンパニーでは、ユーザーのプライバシーとセキュリティを守るため、APIキーをデータベースではなく、お使いのPCのシステム（Windows: 資格情報マネージャー、Mac: キーチェーン）の<strong>セキュアな金庫</strong>へ直接保管します。平文でディスクに書き込まれることはありません。
            </p>
            <p className="text-xs text-[var(--color-text-sub)] italic mt-1">
              ※AI社員の稼働には、少なくとも1つのAPIキー（OpenAI / Anthropic / Gemini）の登録が必要です。<br/>
              ※Web検索（情報収集）には Tavily / Brave キーが利用可能ですが、未登録の場合は既存の OpenAI / Gemini の組み込み検索で自動的に代替されます。
            </p>
          </div>

          {/* 成功フィードバック */}
          {successMsg && (
            <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 px-4 py-3 rounded-lg text-sm font-semibold shadow-sm animate-fade-in flex items-center gap-2">
              <span>🌱</span> {successMsg}
            </div>
          )}

          {/* 各プロバイダー設定カード */}
          <div className="grid grid-cols-1 gap-6">
            {(Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => {
              const provider = PROVIDERS[key];
              const isSaved = apiKeysStatus[provider];
              const error = saveErrors[provider];
              const inputVal = inputKeys[provider];

              let placeholder = "";
              let title = "";


              if (provider === PROVIDERS.OPENAI) {
                title = "OpenAI API (gpt-4o, etc.)";
                placeholder = "sk-proj-...";

              } else if (provider === PROVIDERS.ANTHROPIC) {
                title = "Anthropic Claude API (claude-3-5-sonnet, etc.)";
                placeholder = "sk-ant-api03-...";

              } else if (provider === PROVIDERS.GEMINI) {
                title = "Google Gemini API (gemini-1.5-pro, etc.)";
                placeholder = "AIzaSy...";

              } else if (provider === PROVIDERS.TAVILY) {
                title = "Tavily Search API (Web検索用)";
                placeholder = "tvly-...";

              } else if (provider === PROVIDERS.BRAVE) {
                title = "Brave Search API (Web検索用)";
                placeholder = "BSA...";

              }

              return (
                <div
                  key={provider}
                  className="panel-paper bg-white shadow-sm overflow-hidden flex flex-col"
                >
                  {/* カードヘッダー */}
                  <div className="bg-[var(--color-panel)] px-4 py-3 border-b-2 border-[var(--color-border-inner)] flex justify-between items-center">
                    <span className="font-bold text-sm tracking-wide">{title}</span>
                    {isSaved ? (
                      <span className="bg-emerald-600 text-white text-xxs px-2.5 py-0.5 rounded-full font-bold shadow-sm flex items-center gap-1 animate-pulse">
                        ● 金庫に保管中
                      </span>
                    ) : (
                      <span className="bg-gray-400 text-white text-xxs px-2.5 py-0.5 rounded-full font-bold">
                        未設定
                      </span>
                    )}
                  </div>

                  {/* カードボディ */}
                  <div className="p-4 flex flex-col gap-4">
                    {isSaved ? (
                      <div className="flex justify-between items-center bg-gray-50 border border-gray-200 p-3 rounded-lg">
                        <span className="text-xs text-gray-500 font-mono">
                          キーは暗号化されて安全に保管されています (••••••••••••••••)
                        </span>
                        <button
                          onClick={() => handleDeleteKey(provider)}
                          className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded text-xs font-bold transition-all"
                        >
                          金庫から削除
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder={placeholder}
                            value={inputVal}
                            onChange={(e) =>
                              setInputKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                            }
                            className="flex-1 px-3 py-2 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-sm shadow-inner bg-[var(--color-bg)] text-[var(--color-text)]"
                          />
                          <button
                            onClick={() => handleSaveKey(provider)}
                            className="btn-primary text-sm flex items-center gap-1 shrink-0"
                          >
                            📥 保存する
                          </button>
                        </div>
                        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 次へ進むアクション */}
          <div className="mt-4 flex justify-center">
            {Object.values(apiKeysStatus).some((v) => v) ? (
              <button
                onClick={() => setCurrentScreen("home")}
                className="btn-primary py-3 px-8 text-lg tracking-wider transition-all animate-bounce text-sm"
              >
                ✨ APIキー設定完了！ホームへ進む
              </button>
            ) : (
              <p className="text-xs text-[var(--color-text-sub)] italic panel-paper px-4 py-2">
                ※アプリを動かすには、最低1つ以上のAPIキーを金庫に保存してください。
              </p>
            )}
          </div>
        </div>
        </div>
      )}

      {/* S9: 設定画面 */}
      {currentScreen === "settings" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-4 pb-8">
          
          {/* 左ペイン：APIキーの安全な管理（S1の改良・流用） */}
          <div className="flex flex-col gap-6">
            <div className="panel-paper p-5 shadow-sm">
              <h2 className="font-bold text-lg flex items-center gap-1.5">
                🔑 APIキーの管理 (セキュア金庫)
              </h2>
              <p className="text-xs leading-relaxed text-[var(--color-text-sub)] mt-1">
                OS標準のセキュア金庫（DPAPI/Keychain）にAPIキーを保管しています。
              </p>
            </div>

            {successMsg && (
              <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2">
                <span>🌱</span> {successMsg}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {(Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => {
                const provider = PROVIDERS[key];
                const isSaved = apiKeysStatus[provider];
                const error = saveErrors[provider];
                const inputVal = inputKeys[provider];

                let title = "";
                let placeholder = "";
                if (provider === PROVIDERS.OPENAI) {
                  title = "OpenAI API (gpt-4o, etc.)";
                  placeholder = "sk-proj-...";
                } else if (provider === PROVIDERS.ANTHROPIC) {
                  title = "Anthropic Claude API (claude-3-5-sonnet, etc.)";
                  placeholder = "sk-ant-api03-...";
                } else if (provider === PROVIDERS.GEMINI) {
                  title = "Google Gemini API (gemini-1.5-pro, etc.)";
                  placeholder = "AIzaSy...";
                } else if (provider === PROVIDERS.TAVILY) {
                  title = "Tavily Search API (Web検索用)";
                  placeholder = "tvly-...";
                } else if (provider === PROVIDERS.BRAVE) {
                  title = "Brave Search API (Web検索用)";
                  placeholder = "BSA...";
                }

                return (
                  <div key={provider} className="panel-paper bg-white shadow-sm overflow-hidden flex flex-col text-xs">
                    <div className="bg-[var(--color-panel)] px-3 py-2 border-b-2 border-[var(--color-border-inner)] flex justify-between items-center">
                      <span className="font-bold">{title}</span>
                      {isSaved ? (
                        <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                          保管中
                        </span>
                      ) : (
                        <span className="bg-gray-400 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                          未設定
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      {isSaved ? (
                        <div className="flex justify-between items-center bg-gray-50 border border-gray-100 p-2 rounded">
                          <span className="text-gray-400 font-mono text-[10px]">Saved (••••••••••••)</span>
                          <button
                            onClick={() => handleDeleteKey(provider)}
                            className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded text-[10px] font-bold"
                          >
                            削除
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <input
                              type="password"
                              placeholder={placeholder}
                              value={inputVal}
                              onChange={(e) => setInputKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                              className="flex-1 px-2.5 py-1.5 border-2 border-[var(--color-border-inner)] rounded focus:outline-none focus:border-[#f59e0b] font-mono text-xs bg-[var(--color-bg)]"
                            />
                            <button
                              onClick={() => handleSaveKey(provider)}
                              className="btn-primary text-xs"
                            >
                              保存
                            </button>
                          </div>
                          {error && <p className="text-[10px] text-red-600 font-semibold">{error}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* モデルの管理 */}
            <div className="panel-paper p-5 shadow-sm mt-6 flex flex-col gap-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="font-bold text-lg flex items-center gap-1.5">
                  🤖 利用可能モデルの管理
                </h2>
                {modelSyncStatus && (
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                    🔄 {modelSyncStatus}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-text-sub)]">
                AI社員に割り当て可能なモデルの一覧です。APIキーが登録されているプロバイダーは、起動時およびキー保存時に最新モデルを自動同期します。手動での追加も可能です。
              </p>

              {/* モデル追加フォーム */}
              <div className="bg-white p-3 rounded-lg border border-[var(--color-border-inner)] flex flex-col gap-3">
                <p className="font-bold text-xs">新規モデルの追加</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block">プロバイダー</label>
                    <select
                      value={newModelProvider}
                      onChange={(e) => setNewModelProvider(e.target.value)}
                      className="w-full p-1.5 border border-[var(--color-border-inner)] rounded text-xs bg-[var(--color-bg)] text-[var(--color-text)]"
                    >
                      <option value="OpenAI">OpenAI</option>
                      <option value="Anthropic">Anthropic</option>
                      <option value="Gemini">Gemini</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block">モデルID (API値)</label>
                    <input
                      type="text"
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                      placeholder="gpt-4o, claude-..."
                      className="w-full p-1 border border-[var(--color-border-inner)] rounded text-xs bg-[var(--color-bg)] text-[var(--color-text)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block">表示名</label>
                    <input
                      type="text"
                      value={newModelDisplayName}
                      onChange={(e) => setNewModelDisplayName(e.target.value)}
                      placeholder="GPT-4o, Claude..."
                      className="w-full p-1 border border-[var(--color-border-inner)] rounded text-xs bg-[var(--color-bg)] text-[var(--color-text)]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newModelId.trim() || !newModelDisplayName.trim()) {
                      alert("モデルIDと表示名を入力してください。");
                      return;
                    }
                    try {
                      await dbInstance?.execute(
                        "INSERT INTO ai_models (provider, model_id, display_name, created_at) VALUES (?, ?, ?, ?)",
                        [newModelProvider, newModelId.trim(), newModelDisplayName.trim(), new Date().toISOString()]
                      );
                      setNewModelId("");
                      setNewModelDisplayName("");
                      await fetchModels();
                    } catch (err) {
                      alert("モデルの追加に失敗しました。モデルIDが重複している可能性があります。");
                    }
                  }}
                  className="btn-primary py-1.5 text-xs justify-center"
                >
                  ＋ モデルを追加
                </button>
              </div>

              {/* モデル一覧リスト (プロバイダー別3カラムグループ表示) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 shrink-0">
                {["OpenAI", "Anthropic", "Gemini"].map((prov) => {
                  const provModels = availableModels.filter(m => m.provider === prov);
                  return (
                    <div key={prov} className="bg-white/40 border border-[var(--color-border-inner)] rounded-lg p-2.5 flex flex-col gap-2 shadow-inner min-h-[220px]" style={{ maxHeight: '280px' }}>
                      <div className="flex justify-between items-center border-b border-gray-200 pb-1 shrink-0 bg-[var(--color-panel)] px-1 rounded">
                        <span className="font-bold text-xs flex items-center gap-1">
                          {prov === "OpenAI" ? "🟢" : prov === "Gemini" ? "🔵" : "🟠"} {prov}
                        </span>
                        <span className="text-[10px] bg-white/70 text-gray-700 px-1.5 py-0.2 rounded-full font-bold">
                          {provModels.length}件
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 min-h-0">
                        {provModels.length === 0 ? (
                          <p className="text-[10px] text-gray-400 italic text-center my-auto">モデルはありません</p>
                        ) : (
                          provModels.map((model) => (
                            <div key={model.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-xs shadow-sm hover:border-gray-300">
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="font-bold text-[10px] text-[var(--color-text)] truncate" title={model.display_name}>
                                  {model.display_name}
                                </p>
                                <p className="text-[9px] text-gray-400 font-mono truncate" title={model.model_id}>
                                  {model.model_id}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`モデル「${model.display_name}」を削除してよろしいですか？`)) {
                                    try {
                                      await dbInstance?.execute("DELETE FROM ai_models WHERE id = ?", [model.id]);
                                      await fetchModels();
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 font-bold px-1 py-0.5 text-[9px] shrink-0"
                              >
                                削除
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右ペイン：ユーザーコアプロフィール編集（S9の独自機能） */}
          <div className="flex flex-col gap-6">
            <div className="panel-paper p-5 shadow-sm flex flex-col gap-2">
              <h2 className="font-bold text-lg flex items-center gap-1.5">
                👤 ユーザー・コアプロフィール (第1層)
              </h2>
              <p className="text-xs leading-relaxed text-[var(--color-text-sub)]">
                全AI社員のシステムプロンプトの最上層（ベース）にマージされる、あなたの価値観、目標、現在の状況などの定義です。
              </p>
            </div>

            {profileSaveSuccess && (
              <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2">
                <span>🌱</span> {profileSaveSuccess}
              </div>
            )}
            {profileSaveError && (
              <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2">
                <span>⚠️</span> {profileSaveError}
              </div>
            )}

            <div className="panel-paper p-4 shadow-sm bg-white flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">
                  AI社員が考慮すべきユーザープロフィール（自由記述）:
                </label>
                <textarea
                  value={editCoreProfile}
                  onChange={(e) => setEditCoreProfile(e.target.value)}
                  rows={10}
                  className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[var(--color-bg)] text-[var(--color-text)] resize-y"
                  placeholder="【ユーザー像】〜&#10;【コアバリュー】〜"
                />
              </div>

              <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                <span className="text-[10px] text-gray-400 italic">
                  ※マージ結果に自動的に反映されます。
                </span>
                <button
                  onClick={handleSaveProfile}
                  className="btn-primary text-xs"
                >
                  💾 プロフィールを保存
                </button>
              </div>
            </div>
          </div>

        </div>
        </div>
      )}

      {/* S3: 新規プロジェクト作成画面 */}
      {currentScreen === "createProject" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 mt-4 pb-8">
          <div className="panel-paper p-5 shadow-sm flex flex-col gap-2">
            <h2 className="font-bold text-lg flex items-center gap-1.5">
              🌱 新しいプロジェクトの作成 (S3)
            </h2>
            <p className="text-sm leading-relaxed text-[var(--color-text-sub)]">
              新しいプロジェクトの目的と価値観を定義し、初期部署（メンバー）を編成します。
            </p>
          </div>

          {createProjectError && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2">
              <span>⚠️</span> {createProjectError}
            </div>
          )}

          <div className="panel-paper p-6 bg-white flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                プロジェクト名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="例: NPO-Trust-Platform"
                className="input-wood text-sm w-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                プロジェクトの目的
              </label>
              <textarea
                value={newProjectPurpose}
                onChange={(e) => setNewProjectPurpose(e.target.value)}
                placeholder="例: 非営利団体の活動実績と資金使途を透明化し、寄付者への信頼性を最大化するプラットフォーム"
                rows={3}
                className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[var(--color-bg)] text-[var(--color-text)] resize-y"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                判断軸・価値観 (第2層)
              </label>
              <textarea
                value={newProjectValues}
                onChange={(e) => setNewProjectValues(e.target.value)}
                placeholder="例: 透明性と実現可能性を最優先し、持続可能かつ堅牢なシステムを構築すること。"
                rows={3}
                className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[var(--color-bg)] text-[var(--color-text)] resize-y"
              />
            </div>

            {/* 初期部署・メンバー選択 */}
            <div className="flex flex-col gap-3 mt-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                初期編成する部署とメンバー（チェックボックスで選択）:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DEPT_PRESETS.map((dept) => {
                  const isChecked = selectedDepts.includes(dept.key);
                  return (
                    <div 
                      key={dept.key} 
                      onClick={() => {
                        setSelectedDepts(prev => 
                          prev.includes(dept.key) 
                            ? prev.filter(k => k !== dept.key) 
                            : [...prev, dept.key]
                        );
                      }}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col gap-1.5 ${
                        isChecked 
                          ? "bg-[var(--color-panel)] border-[var(--color-border-outer)] shadow-sm" 
                          : "bg-white border-[var(--color-border-inner)] hover:bg-gray-50 opacity-80"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // 親divのonClickで制御
                          className="rounded border-[var(--color-border-inner)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                        />
                        <span className="font-bold text-sm">{dept.name}</span>
                      </div>
                      <p className="text-xxs text-[var(--color-text-sub)] leading-relaxed truncate">
                        {dept.prompt}
                      </p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {dept.members.map(m => (
                          <span key={m.name} className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded border border-[var(--color-border-inner)]">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 mt-2">
              <button
                onClick={() => {
                  setNewProjectName("");
                  setNewProjectPurpose("");
                  setNewProjectValues("");
                  setSelectedDepts(["strategy", "engineering", "legal", "marketing", "thinking_style"]);
                  setCurrentScreen("home");
                }}
                className="btn-secondary"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateProject}
                className="btn-primary"
              >
                🛠️ プロジェクトを作成
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* S2 / ノードB検証テスト画面 */}
      {currentScreen === "promptTest" && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6">
          {/* テスト切り替えエリア */}
          <div className="panel-paper p-4 shadow-sm flex flex-col gap-4">
            <h2 className="font-bold text-lg flex items-center gap-1">
              💡 テストケースの切り替え
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => setSelectedMemberId(1)}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-bold transition-all flex flex-col items-center gap-1 ${
                  selectedMemberId === 1
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent-shadow)] shadow-md"
                    : "bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50"
                }`}
              >
                <span>【ケース1】通常の部署メンバー（法務部・鈴木）</span>
                <span className="text-xxs font-normal opacity-85">
                  → ユーザー + プロジェクト + 部署 + 個人の4層すべてをマージ
                </span>
              </button>
              <button
                onClick={() => setSelectedMemberId(2)}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-bold transition-all flex flex-col items-center gap-1 ${
                  selectedMemberId === 2
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent-shadow)] shadow-md"
                    : "bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50"
                }`}
              >
                <span>【ケース2】思考スタイル（悪魔の代弁者）</span>
                <span className="text-xxs font-normal opacity-85">
                  → 部署性質はマージせず除外（ユーザー + プロジェクト + 個人）
                </span>
              </button>
            </div>
          </div>

          {generateError && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg flex flex-col gap-1 shadow-sm">
              <p className="font-bold text-sm">⚠️ プロンプト生成エラー</p>
              <p className="text-xs font-mono">{generateError}</p>
            </div>
          )}

          {/* 出力結果表示エリア */}
          <div className="flex-1 flex flex-col gap-2 min-h-[450px]">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base flex items-center gap-1 text-[var(--color-text-sub)]">
                📝 マージ出力結果（最終システムプロンプト）:
              </h3>
              <span className="text-xs bg-[#c8a96e] text-white px-3 py-1 rounded font-bold shadow-sm">
                {selectedMemberId === 1 ? "法務部 鈴木のプロンプト" : "悪魔の代弁者のプロンプト"}
              </span>
            </div>
            <textarea
              readOnly
              value={mergedPrompt}
              className="w-full flex-1 p-4 bg-white border-2 border-[var(--color-border-inner)] rounded-lg font-mono text-xs leading-relaxed focus:outline-none resize-none shadow-inner text-[var(--color-text)] h-[450px]"
              placeholder="プロンプトがここに生成されます..."
            />
          </div>
        </div>
      )}

      {/* プロジェクトコンテキスト編集モーダル */}
      {isEditingProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="panel-paper p-6 bg-white w-full max-w-2xl flex flex-col gap-4 shadow-xl border-4 border-[var(--color-border-outer)]">
            <h3 className="font-bold text-lg border-b-2 border-[var(--color-border-inner)] pb-2 flex items-center gap-1.5">
              📝 プロジェクトのコンテキスト編集
            </h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                🎯 プロジェクトの目的:
              </label>
              <textarea
                value={editProjectPurpose}
                onChange={(e) => setEditProjectPurpose(e.target.value)}
                rows={3}
                className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[var(--color-bg)] text-[var(--color-text)] resize-y"
                placeholder="プロジェクトの目的を入力..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--color-text-sub)]">
                💎 判断軸・価値観 (第2層):
              </label>
              <textarea
                value={editProjectValues}
                onChange={(e) => setEditProjectValues(e.target.value)}
                rows={6}
                className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[var(--color-bg)] text-[var(--color-text)] resize-y"
                placeholder="意思決定の軸や、前提となるコンテキスト、価値観を入力。議論が進むごとに追記・修正します。"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 mt-2">
              <button
                onClick={() => setIsEditingProject(false)}
                className="btn-secondary"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveProjectSettings}
                className="btn-primary"
              >
                💾 変更を保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* S5: メンバーエディタ（モーダル） */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="panel-paper p-6 bg-white w-full max-w-lg flex flex-col gap-4 shadow-xl border-4 border-[var(--color-border-outer)]" style={{ backgroundColor: 'var(--color-bg)', maxHeight: '90vh' }}>
            <div className="flex justify-between items-center border-b-2 border-[var(--color-border-inner)] pb-2 shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-1.5">
                ✏️ メンバープロフィールの編集 (S5)
              </h3>
              <button 
                onClick={() => setEditingMember(null)}
                className="text-gray-500 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            {/* スクロール領域 */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 min-h-0">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">名前</label>
                <input 
                  type="text" 
                  value={editMemberName} 
                  onChange={e => setEditMemberName(e.target.value)} 
                  className="input-wood text-sm w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">専門領域・役割</label>
                <input 
                  type="text" 
                  value={editMemberRole} 
                  onChange={e => setEditMemberRole(e.target.value)} 
                  className="input-wood text-sm w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">使用AIモデル</label>
                <select
                  value={editMemberModel}
                  onChange={e => setEditMemberModel(e.target.value)}
                  className="w-full p-2 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] text-sm bg-white text-[var(--color-text)]"
                >
                  <option value="">選択してください...</option>
                  {["OpenAI", "Anthropic", "Gemini"].map(prov => {
                    const provModels = availableModels.filter(m => m.provider === prov);
                    if (provModels.length === 0) return null;
                    return (
                      <optgroup key={prov} label={prov}>
                        {provModels.map(model => (
                          <option key={model.id} value={model.model_id}>
                            {model.display_name} ({model.model_id})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">個人人格プロンプト (最内層)</label>
                <textarea 
                  value={editMemberPersonality} 
                  onChange={e => setEditMemberPersonality(e.target.value)} 
                  rows={6}
                  className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-white text-[var(--color-text)] resize-y"
                  placeholder="冷静沈着で丁寧な敬語。曖昧な表現に対して極めて敏感..."
                />
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex justify-end gap-2 border-t-2 border-[var(--color-border-inner)] pt-3 shrink-0">
              <button 
                onClick={() => setEditingMember(null)}
                className="btn-secondary"
              >
                キャンセル
              </button>
              <button 
                onClick={async () => {
                  if (!editMemberName.trim()) {
                    alert("名前を入力してください。");
                    return;
                  }
                  try {
                    const nowStr = new Date().toISOString();
                    await dbInstance?.execute(
                      "UPDATE members SET name = ?, role = ?, personality_prompt = ?, ai_model = ?, updated_at = ? WHERE id = ?",
                      [editMemberName, editMemberRole, editMemberPersonality, editMemberModel, nowStr, editingMember.id]
                    );
                    setEditingMember(null);
                    await fetchMembers(); // メンバー一覧をリロード
                  } catch (err) {
                    console.error("Failed to update member", err);
                    alert("更新に失敗しました。");
                  }
                }}
                className="btn-primary"
              >
                💾 保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
