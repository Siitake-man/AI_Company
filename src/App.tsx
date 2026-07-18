import { useState, useEffect, useCallback } from "react";
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
import { ChatScreen } from "./components/ChatScreen";
import { TeamManageScreen } from "./components/TeamManageScreen";
import { MemberEditorModal } from "./components/MemberEditorModal";
import { HomeScreen } from "./components/HomeScreen";
import { MeetingModeModal, MeetingMode } from "./components/MeetingModeModal";
import { MeetingScreen } from "./components/MeetingScreen";
import { PromptTestScreen } from "./components/PromptTestScreen";
import { CreateProjectScreen } from "./components/CreateProjectScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { ApiKeySetupScreen } from "./components/ApiKeySetupScreen";
import { SummaryScreen } from "./components/SummaryScreen";



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
  const [memberStats, setMemberStats] = useState<{prompt_tokens: number, completion_tokens: number, total_cost: number}>({prompt_tokens: 0, completion_tokens: 0, total_cost: 0});
  const [teamStats, setTeamStats] = useState<{[id: number]: number}>({});
  const [initError, setInitError] = useState<string>("");
  const [generateError, setGenerateError] = useState<string>("");

  // 画面遷移・APIキー関連の状態
  const [currentScreen, setCurrentScreen] = useState<"home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting" | "summary">("apiKeySetup");
  const [chatMemberId, setChatMemberId] = useState<number | null>(null);
  const [isMeetingModeModalOpen, setIsMeetingModeModalOpen] = useState<boolean>(false);
  const [selectedMeetingMode, setSelectedMeetingMode] = useState<MeetingMode | null>(null);
  const [meetingAgenda, setMeetingAgenda] = useState<string>("");
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<{id: number, role: "user" | "assistant", content: string, created_at: string}[]>([]);
  // S8: 会議サマリー画面用の状態
  const [meetingSummaryText, setMeetingSummaryText] = useState<string>("");
  // S8: 会議で発生したコスト・トークンの状態
  const [meetingCostStats, setMeetingCostStats] = useState<{
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
  }>({ promptTokens: 0, completionTokens: 0, totalCost: 0 });
  // S8: サマリー生成用モデルの設定状態
  const [summaryModel, setSummaryModel] = useState<string>("gemini-2.5-flash");



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

  const [inputKeys, setInputKeys] = useState<{ [key in ProviderType]?: string }>({
    [PROVIDERS.OPENAI]: "",
    [PROVIDERS.ANTHROPIC]: "",
    [PROVIDERS.GEMINI]: "",
    [PROVIDERS.TAVILY]: "",
    [PROVIDERS.BRAVE]: ""
  });

  const [saveErrors, setSaveErrors] = useState<{ [key in ProviderType]?: string }>({
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



  // モデル管理用の状態
  const [availableModels, setAvailableModels] = useState<{ id: number; provider: string; model_id: string; display_name: string }[]>([]);
  const [newModelProvider, setNewModelProvider] = useState<string>("OpenAI");
  const [newModelId, setNewModelId] = useState<string>("");
  const [newModelDisplayName, setNewModelDisplayName] = useState<string>("");
  const [modelSyncStatus, setModelSyncStatus] = useState<string>("");

  // メンバー編集モーダル用の状態（S5）
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [editMemberName, setEditMemberName] = useState<string>("");
  const [editMemberRole, setEditMemberRole] = useState<string>("");
  const [editMemberPersonality, setEditMemberPersonality] = useState<string>("");
  const [editMemberModel, setEditMemberModel] = useState<string>("");
  const [memberLearnings, setMemberLearnings] = useState<any[]>([]); // S5: 成長日誌（学習履歴）
  const [showInheritedProject, setShowInheritedProject] = useState<boolean>(false);
  const [showInheritedDept, setShowInheritedDept] = useState<boolean>(false);

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
      const result = await dbInstance!.select<{ id: number; provider: string; model_id: string; display_name: string }[]>(
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

        // member_learnings テーブルの作成 (成長日誌)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS member_learnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            meeting_id INTEGER,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        // api_usage_logs テーブルの作成 (API利用料金・トークン量のトラッキング)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS api_usage_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              member_id INTEGER NOT NULL,
              session_id INTEGER,       -- 1on1チャット用セッションID (NULL可)
              meeting_id INTEGER,       -- 会議用ID (NULL可)
              provider TEXT NOT NULL,   -- 'OpenAI' | 'Anthropic' | 'Gemini'
              model_id TEXT NOT NULL,
              prompt_tokens INTEGER NOT NULL,
              completion_tokens INTEGER NOT NULL,
              cost_usd REAL NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        // chat_sessions テーブルの作成 (1on1チャット用)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            started_at TEXT NOT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
          );
        `);

        // chat_messages テーブルの作成 (session_idを持つ最新構造へ自動移行)
        try {
          // session_id カラムがあるかチェック
          await db.select("SELECT session_id FROM chat_messages LIMIT 1");
        } catch (e) {
          // カラムがないかテーブル自体がない場合、ドロップして新スキーマで作り直す
          console.log("Migrating chat_messages table to session-based schema...");
          await db.execute("DROP TABLE IF EXISTS chat_messages");
        }

        await db.execute(`
          CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
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

        // summary_model カラムを users テーブルに追加 (もし無ければ)
        try {
          await db.execute("ALTER TABLE users ADD COLUMN summary_model TEXT DEFAULT 'gemini-2.5-flash'");
        } catch (e) {
          // すでにカラムがあればエラーになるので無視
        }

        // 1.5. ユーザーコアプロフィールの読み込み
        const userResult = await db.select<{ core_profile: string, summary_model: string }[]>(
          "SELECT core_profile, summary_model FROM users WHERE id = 1"
        );
        if (userResult && userResult.length > 0) {
          const profile = userResult[0].core_profile || "";
          setCoreProfile(profile);
          setEditCoreProfile(profile);
          setSummaryModel(userResult[0].summary_model || "gemini-2.5-flash");
        }

        // 2. セキュリティ金庫（APIキー）の登録状態を確認
        await refreshApiKeysStatus();
        if (currentScreen === "apiKeySetup") {
          setCurrentScreen("home");
        }

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

    // 初期起動時は apiKeySetup を表示しても良いが、今回は強制スキップしてホームにする
    // ユーザーからの報告「ホーム画面が消えた」に対応するため、ホームをデフォルトにする
    if (currentScreen === "apiKeySetup") {
      setCurrentScreen("home");
    }
  }


  // プロジェクト一覧の取得
  const fetchProjects = async () => {
    if (!dbInstance) return;
    try {
      const result = await dbInstance!.select<{id: number, name: string, purpose: string}[]>(
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
      const result = await dbInstance!.select<{id: number, name: string, role: string, avatar_id: string, dept_name: string, personality_prompt: string, ai_model: string, department_prompt: string}[]>(
        `SELECT m.id, m.name, m.role, m.avatar_id, m.personality_prompt, m.ai_model, d.name as dept_name, d.department_prompt
         FROM members m
         JOIN departments d ON m.department_id = d.id
         WHERE d.project_id = ?
         ORDER BY d.display_order, m.id`,
         [selectedProjectId]
      );
      setProjectMembers(result);

      // Fetch team stats
      const stats = await dbInstance.select<{member_id: number, cost: number}[]>(
          "SELECT member_id, SUM(cost_usd) as cost FROM api_usage_logs WHERE member_id IN (SELECT id FROM members WHERE department_id IN (SELECT id FROM departments WHERE project_id = ?)) GROUP BY member_id",
          [selectedProjectId]
      );
      const statsMap: {[id: number]: number} = {};
      stats.forEach(s => { statsMap[s.member_id] = s.cost; });
      setTeamStats(statsMap);
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
      const projResult = await dbInstance!.execute(
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
          const deptResult = await dbInstance!.execute(
            "INSERT INTO departments (project_id, name, department_prompt, display_order, is_thinking_style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [projectId, preset.name, preset.prompt, deptOrder++, isThinking, nowStr, nowStr]
          );

          const departmentId = deptResult.lastInsertId;

          for (const member of preset.members) {
            await dbInstance!.execute(
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



  // APIキーの個別保存処理
  async function handleSaveKey(provider: ProviderType): Promise<boolean> {
    try {
      setSaveErrors((prev) => ({ ...prev, [provider]: "" }));
      setSuccessMsg("");
      const keyVal = inputKeys[provider];

      if (!keyVal || !keyVal.trim()) {
        setSaveErrors((prev) => ({ ...prev, [provider]: "APIキーを入力してください" }));
        return false;
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
      return true;
    } catch (err) {
      console.error(err);
      setSaveErrors((prev) => ({ ...prev, [provider]: `保存失敗: ${String(err)}` }));
      return false;
    }
  }

  // APIキーの個別削除処理
  async function handleDeleteKey(provider: ProviderType): Promise<boolean | void> {
    try {
      setSuccessMsg("");
      await deleteApiKey(provider);
      setSuccessMsg(`${provider.toUpperCase()} のAPIキーを金庫から削除しました。`);
      await refreshApiKeysStatus();
      if (dbInstance) {
        await fetchModels();
      }
      return true;
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
      await dbInstance!.execute(
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
          onClick={() => setCurrentScreen("home")}
          className="cursor-pointer hover:opacity-80 transition-opacity"
          title="ホーム画面に戻る"
        >
          <h1 className="font-title text-4xl text-[var(--color-border-outer)] flex items-center gap-2">🪵 AIカンパニー</h1><span className="ml-4 text-sm text-[var(--color-text-sub)] font-sans">Build the perfect AI team for your mission. 🌸</span>
        </div>
        <div className="flex gap-2">
          {currentScreen !== "home" && (
            <button
              onClick={() => setCurrentScreen("home")}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50 btn-secondary"
            >
              🏠 ホーム
            </button>
          )}
          <button onClick={() => setCurrentScreen("settings")} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold" title="設定画面を開く">⚙ 設定</button>
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
        <HomeScreen
          dbInstance={dbInstance}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          projectMembers={projectMembers}
          getAvatarPath={getAvatarPath}
          getEmojiForRole={getEmojiForRole}
          getRoleColor={getRoleColor}
          setChatMemberId={setChatMemberId}
          setCurrentScreen={setCurrentScreen as (s: string) => void}
          setCreateProjectError={setCreateProjectError}
          fetchProjects={fetchProjects}
          onStartMeetingClick={() => {
            setIsMeetingModeModalOpen(true);
          }}
          onViewPastSummary={(summaryText: string, agenda: string, mode: any) => {
            setMeetingSummaryText(summaryText);
            setMeetingCostStats(undefined as any); // 過去ログ表示時はコスト統計をリセット
            setMeetingAgenda(agenda);
            setSelectedMeetingMode(mode);
            setCurrentScreen("summary");
          }}
        />
      )}


      {/* S4: チーム管理画面 */}
      <TeamManageScreen
        currentScreen={currentScreen}
        projects={projects}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        setCreateProjectError={setCreateProjectError}
        setCurrentScreen={setCurrentScreen as (s: string) => void}
        projectMembers={projectMembers}
        getAvatarPath={getAvatarPath}
        getEmojiForRole={getEmojiForRole}
        getRoleColor={getRoleColor}
        setChatMemberId={setChatMemberId}
        setEditingMember={setEditingMember}
        setEditMemberName={setEditMemberName}
        setEditMemberRole={setEditMemberRole}
        setEditMemberPersonality={setEditMemberPersonality}
        setEditMemberModel={setEditMemberModel}
        dbInstance={dbInstance}
        setMemberLearnings={setMemberLearnings}
        teamStats={teamStats}
      />

      {/* S6: 1on1チャット画面 */}
      {currentScreen === "chat" && (
        <ChatScreen
          dbInstance={dbInstance}
          chatMemberId={chatMemberId}
          chatSessionId={chatSessionId}
          setChatSessionId={setChatSessionId}
          currentScreen={currentScreen}
          setCurrentScreen={setCurrentScreen as (s: string) => void}
          projectMembers={projectMembers}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          getAvatarPath={getAvatarPath}
          getEmojiForRole={getEmojiForRole}
          getRoleColor={getRoleColor}
          chatMessages={chatMessages}
          setChatMessages={setChatMessages}
        />
      )}

      {/* F7: 会議モード画面 (議論進行中) */}
      {currentScreen === "meeting" && (
        <MeetingScreen
          dbInstance={dbInstance}
          projectMembers={projectMembers}
          selectedProjectId={selectedProjectId}
          projects={projects}
          meetingMode={selectedMeetingMode}
          meetingAgenda={meetingAgenda}
          setCurrentScreen={setCurrentScreen as (screen: any) => void}
          getAvatarPath={getAvatarPath}
          getEmojiForRole={getEmojiForRole}
          getRoleColor={getRoleColor}
          onSummaryGenerated={(text: string, promptTokens: number, completionTokens: number, totalCost: number) => {
            setMeetingSummaryText(text);
            setMeetingCostStats({ promptTokens, completionTokens, totalCost });
            setCurrentScreen("summary");
          }}
          summaryModel={summaryModel}
        />
      )}

      {/* S8: 議事録サマリー画面 */}
      {currentScreen === "summary" && (
        <SummaryScreen
          summaryText={meetingSummaryText}
          meetingAgenda={meetingAgenda}
          meetingMode={selectedMeetingMode}
          setCurrentScreen={setCurrentScreen as (screen: any) => void}
          costStats={meetingCostStats}
        />
      )}

      {/* S1: APIキー設定画面 */}
      {currentScreen === "apiKeySetup" && (
        <ApiKeySetupScreen
          apiKeysStatus={apiKeysStatus}
          successMsg={successMsg}
          saveErrors={saveErrors}
          inputKeys={inputKeys}
          setInputKeys={setInputKeys}
          handleSaveKey={handleSaveKey}
          handleDeleteKey={handleDeleteKey}
          setCurrentScreen={setCurrentScreen as (s: string) => void}
        />
      )}

      {/* ノードB検証テスト画面 */}
      {currentScreen === "promptTest" && (
        <PromptTestScreen
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          generateError={generateError}
          mergedPrompt={mergedPrompt}
        />
      )}

      {/* S9: 設定画面 */}
      {currentScreen === "settings" && (
        <SettingsScreen
          apiKeysStatus={apiKeysStatus}
          successMsg={successMsg}
          setSuccessMsg={setSuccessMsg}
          saveErrors={saveErrors}
          setSaveErrors={setSaveErrors}
          inputKeys={inputKeys}
          setInputKeys={setInputKeys}
          handleSaveKey={handleSaveKey}
          handleDeleteKey={handleDeleteKey}
          modelSyncStatus={modelSyncStatus}
          availableModels={availableModels}
          newModelProvider={newModelProvider}
          setNewModelProvider={setNewModelProvider}
          newModelId={newModelId}
          setNewModelId={setNewModelId}
          newModelDisplayName={newModelDisplayName}
          setNewModelDisplayName={setNewModelDisplayName}
          fetchModels={fetchModels}
          fetchMembers={fetchMembers}
          dbInstance={dbInstance}
          editCoreProfile={editCoreProfile}
          setEditCoreProfile={setEditCoreProfile}
          profileSaveSuccess={profileSaveSuccess}
          profileSaveError={profileSaveError}
          handleSaveProfile={handleSaveProfile}
          setCurrentScreen={setCurrentScreen as (s: string) => void}
          summaryModel={summaryModel}
          setSummaryModel={setSummaryModel}
        />
      )}

      {/* S3: 新規プロジェクト作成画面 */}
      {currentScreen === "createProject" && (
        <CreateProjectScreen
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          newProjectPurpose={newProjectPurpose}
          setNewProjectPurpose={setNewProjectPurpose}
          newProjectValues={newProjectValues}
          setNewProjectValues={setNewProjectValues}
          selectedDepts={selectedDepts}
          setSelectedDepts={setSelectedDepts}
          createProjectError={createProjectError}
          handleCreateProject={handleCreateProject}
          setCurrentScreen={setCurrentScreen as (s: string) => void}
        />
      )}

      {/* S5: メンバーエディタ（モーダル） */}
      <MemberEditorModal
        editingMember={editingMember}
        setEditingMember={setEditingMember}
        editMemberName={editMemberName}
        setEditMemberName={setEditMemberName}
        editMemberRole={editMemberRole}
        setEditMemberRole={setEditMemberRole}
        editMemberPersonality={editMemberPersonality}
        setEditMemberPersonality={setEditMemberPersonality}
        editMemberModel={editMemberModel}
        setEditMemberModel={setEditMemberModel}
        availableModels={availableModels}
        showInheritedDept={showInheritedDept}
        setShowInheritedDept={setShowInheritedDept}
        showInheritedProject={showInheritedProject}
        setShowInheritedProject={setShowInheritedProject}
        memberLearnings={memberLearnings}
        dbInstance={dbInstance}
        fetchMembers={fetchMembers}
        memberStats={memberStats}
        setMemberStats={setMemberStats}
      />

      {/* F7A: 会議モード選択モーダル */}
      <MeetingModeModal
        isOpen={isMeetingModeModalOpen}
        onClose={() => setIsMeetingModeModalOpen(false)}
        onConfirm={(mode, agenda) => {
          setIsMeetingModeModalOpen(false);
          setSelectedMeetingMode(mode);
          setMeetingAgenda(agenda);
          setCurrentScreen("meeting");
        }}
      />

    </main>
  );
}

export default App;
