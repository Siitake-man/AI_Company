import { useState, useEffect } from "react";
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
  const [currentScreen, setCurrentScreen] = useState<"home" | "apiKeySetup" | "promptTest" | "settings" | "createProject">("apiKeySetup");

  // 新規プロジェクト作成用の状態
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [newProjectPurpose, setNewProjectPurpose] = useState<string>("");
  const [newProjectValues, setNewProjectValues] = useState<string>("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["strategy", "engineering", "legal", "marketing", "thinking_style"]);
  const [createProjectError, setCreateProjectError] = useState<string>("");
  const [apiKeysStatus, setApiKeysStatus] = useState<{
    openai: boolean;
    anthropic: boolean;
    gemini: boolean;
  }>({ openai: false, anthropic: false, gemini: false });

  const [inputKeys, setInputKeys] = useState<{
    openai: string;
    anthropic: string;
    gemini: string;
  }>({ openai: "", anthropic: "", gemini: "" });

  const [saveErrors, setSaveErrors] = useState<{
    openai: string;
    anthropic: string;
    gemini: string;
  }>({ openai: "", anthropic: "", gemini: "" });

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

  // 初期化とAPIキーの存在チェック
  useEffect(() => {
    async function initApp() {
      try {
        // 1. データベースの初期化とシードデータの確認
        const db = await Database.load("sqlite:ai_company.db");
        setDbInstance(db);

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

        setLoading(false);
      } catch (err) {
        console.error(err);
        setInitError(String(err));
        setLoading(false);
      }
    }

    initApp();
  }, []);

  // APIキーの保存状況を最新にする
  async function refreshApiKeysStatus() {
    const openaiKey = await getApiKey(PROVIDERS.OPENAI);
    const anthropicKey = await getApiKey(PROVIDERS.ANTHROPIC);
    const geminiKey = await getApiKey(PROVIDERS.GEMINI);

    const hasAny = !!(openaiKey || anthropicKey || geminiKey);
    setApiKeysStatus({
      openai: !!openaiKey,
      anthropic: !!anthropicKey,
      gemini: !!geminiKey,
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
      const result = await dbInstance.select<{id: number, name: string, role: string, avatar_id: string, dept_name: string}[]>(
        `SELECT m.id, m.name, m.role, m.avatar_id, d.name as dept_name
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
      setSelectedProjectId(projectId);
      setCurrentScreen("home");
    } catch (e) {
      console.error("Failed to create project", e);
      setCreateProjectError(`プロジェクト作成失敗: ${String(e)}`);
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
    <main className="p-8 bg-[var(--color-bg)] min-h-screen text-[var(--color-text)] flex flex-col gap-6">
      {/* 共通ヘッダー */}
      <div className="border-b-4 border-[var(--color-border-inner)] pb-4 flex justify-between items-center bg-[var(--color-panel)] p-4 rounded-lg shadow-sm">
        <div
          onClick={() => {
            if (Object.values(apiKeysStatus).some((v) => v)) {
              setCurrentScreen("home");
            }
          }}
          className={`cursor-pointer ${Object.values(apiKeysStatus).some((v) => v) ? "hover:opacity-80 transition-opacity" : ""}`}
          title={Object.values(apiKeysStatus).some((v) => v) ? "ホーム画面に戻る" : ""}
        >
          <h1 className="text-2xl font-black tracking-wider flex items-center gap-2">
            🪵 AIカンパニー <span className="text-xs bg-[var(--color-accent)] text-white px-2 py-1 rounded font-normal">Phase 1</span>
          </h1>
          <p className="text-xs mt-1 text-[var(--color-text-sub)] font-medium">
            あなただけの専門家チームを持つ、ローカル完結型デスクトップアプリ
          </p>
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
          <button
            onClick={() => setCurrentScreen("settings")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              currentScreen === "settings"
                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent-shadow)]"
                : "bg-white text-[var(--color-text)] border-[var(--color-border-inner)] hover:bg-gray-50"
            }`}
            disabled={!Object.values(apiKeysStatus).some((v) => v)}
            title={!Object.values(apiKeysStatus).some((v) => v) ? "APIキーを設定してください" : "設定画面を開く"}
          >
            ⚙️ 設定 (S9)
          </button>
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
        <div className="flex-1 flex gap-6 h-[calc(100vh-140px)]">
          {/* 左サイドバー */}
          <div className="w-64 sidebar-wood rounded-lg flex flex-col p-4 gap-4 overflow-y-auto">
            <div className="panel-paper p-3 text-center mb-2">
              <h2 className="font-title text-xl font-bold">プロジェクト一覧</h2>
            </div>

            <div className="flex-1 flex flex-col gap-2">
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
              className="btn-secondary w-full justify-center mt-auto py-3"
            >
              ＋ 新しいプロジェクト
            </button>
          </div>

          {/* 右メインエリア: flex-colで「スクロール域」と「フッターボタン」を確実に分離 */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
                      {/* ヘッダー情報 */}
                      <div className="panel-paper p-6 flex items-start gap-4">
                        <div className="text-5xl">🌱</div>
                        <div className="flex-1">
                          <h2 className="text-2xl font-bold mb-2">
                            {project?.name}
                          </h2>
                          <p className="text-sm text-[var(--color-text-sub)] leading-relaxed">
                            {project?.purpose}
                          </p>
                        </div>
                      </div>

                      {/* 統計情報 */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="panel-paper p-4 flex flex-col items-center justify-center">
                          <span className="text-[var(--color-text-sub)] text-xs font-bold mb-1">メンバー数</span>
                          <span className="text-2xl font-bold">{projectMembers.length}名</span>
                        </div>
                        <div className="panel-paper p-4 flex flex-col items-center justify-center">
                          <span className="text-[var(--color-text-sub)] text-xs font-bold mb-1">最終会議日</span>
                          <span className="text-xl font-bold">--</span>
                        </div>
                        <div className="panel-paper p-4 flex flex-col items-center justify-center">
                          <span className="text-[var(--color-text-sub)] text-xs font-bold mb-1">会議回数</span>
                          <span className="text-2xl font-bold">0回</span>
                        </div>
                      </div>

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
                                  style={{ backgroundColor: getRoleColor(member.role, member.dept_name) }}
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
                                  <p className="text-xxs text-[var(--color-text-sub)] leading-relaxed max-w-[180px] h-10 overflow-y-auto">
                                    {member.role}
                                  </p>
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
                <p className="font-bold">左のリストからプロジェクトを選択してください</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* S1: APIキー設定画面 */}
      {currentScreen === "apiKeySetup" && (
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 mt-4">
          {/* 説明パネル */}
          <div className="panel-paper p-5 shadow-sm flex flex-col gap-2">
            <h2 className="font-bold text-lg flex items-center gap-1">
              🗝️ 初回設定: APIキーの安全な保管
            </h2>
            <p className="text-sm leading-relaxed text-[var(--color-text-sub)]">
              AIカンパニーでは、ユーザーのプライバシーとセキュリティを守るため、APIキーをデータベースではなく、お使いのPCのシステム（Windows: 資格情報マネージャー、Mac: キーチェーン）の<strong>セキュアな金庫</strong>へ直接保管します。平文でディスクに書き込まれることはありません。
            </p>
            <p className="text-xs text-[var(--color-text-sub)] italic mt-1">
              ※AI社員の稼働には、少なくとも1つのAPIキー（OpenAI / Anthropic / Gemini）の登録が必要です。
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
      )}

      {/* S9: 設定画面 */}
      {currentScreen === "settings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-4">
          
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
      )}

      {/* S3: 新規プロジェクト作成画面 */}
      {currentScreen === "createProject" && (
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 mt-4">
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
      )}

      {/* S2 / ノードB検証テスト画面 */}
      {currentScreen === "promptTest" && (
        <div className="flex-1 flex flex-col gap-6">
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
    </main>
  );
}

export default App;
