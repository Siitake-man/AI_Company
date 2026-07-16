type CreateProjectScreenProps = {
  newProjectName: string;
  setNewProjectName: (val: string) => void;
  newProjectPurpose: string;
  setNewProjectPurpose: (val: string) => void;
  newProjectValues: string;
  setNewProjectValues: (val: string) => void;
  selectedDepts: string[];
  setSelectedDepts: (depts: string[]) => void;
  createProjectError: string;
  handleCreateProject: () => Promise<void>;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting") => void;
};

const DEPT_OPTIONS = [
  { key: "strategy", name: "🌿 戦略部 (PM/リサーチャー)", desc: "プロジェクトの目的設計と進捗管理、リサーチを行います。" },
  { key: "engineering", name: "💻 エンジニアリング部 (要件定義/アーキテクト)", desc: "システム要件の整理や、アーキテクチャの妥当性を評価します。" },
  { key: "legal", name: "📜 法務部 (リスク管理/契約審議)", desc: "コンプライアンス遵守、各種リスクの洗い出しを行います。" },
  { key: "marketing", name: "📢 マーケティング部 (広報/市場調査)", desc: "ユーザー層へのアピール、ポジショニング、競合分析を行います。" },
  { key: "thinking_style", name: "🧠 思考スタイル枠 (ドリーマー/悪魔の代弁者)", desc: "部署性質を継承しない、対極の視点から意見を出す特殊枠です。" }
];

export const CreateProjectScreen = ({
  newProjectName,
  setNewProjectName,
  newProjectPurpose,
  setNewProjectPurpose,
  newProjectValues,
  setNewProjectValues,
  selectedDepts,
  setSelectedDepts,
  createProjectError,
  handleCreateProject,
  setCurrentScreen
}: CreateProjectScreenProps) => {

  const toggleDept = (key: string) => {
    if (selectedDepts.includes(key)) {
      // 少なくとも1つは選択させる
      if (selectedDepts.length > 1) {
        setSelectedDepts(selectedDepts.filter(d => d !== key));
      }
    } else {
      setSelectedDepts([...selectedDepts, key]);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-3xl mx-auto py-4">
      {/* ヘッダー */}
      <div className="panel-paper p-4 flex justify-between items-center bg-[var(--color-panel)] shrink-0">
        <h2 className="font-bold text-xl text-[#3d2b1f] flex items-center gap-2">
          🌱 新しいプロジェクトの作成
        </h2>
        <button
          className="btn-secondary text-xs"
          onClick={() => setCurrentScreen("home")}
        >
          キャンセル
        </button>
      </div>

      {createProjectError && (
        <div className="bg-red-50 border-2 border-red-300 text-red-955 px-4 py-3 rounded-lg text-xs font-semibold shadow-sm">
          ⚠️ {createProjectError}
        </div>
      )}

      {/* フォームエリア */}
      <div className="panel-paper p-6 bg-white shadow-sm flex flex-col gap-5">
        
        {/* 1. プロジェクト名 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--color-text-sub)]">
            プロジェクト名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="例: 新規ECサービス立ち上げ, NPO-Trust支援"
            className="w-full p-2.5 border-2 border-[var(--color-border-inner)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] font-bold focus:outline-none focus:border-[#f59e0b] text-sm"
          />
        </div>

        {/* 2. 目的 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--color-text-sub)]">
            プロジェクトの目的 (第2層: 目的)
          </label>
          <textarea
            value={newProjectPurpose}
            onChange={(e) => setNewProjectPurpose(e.target.value)}
            rows={3}
            placeholder="このプロジェクトを通じて何を実現するか？ 例: NWとPMスキルを活かした独自の価値提供の形を創出する。"
            className="w-full p-2.5 border-2 border-[var(--color-border-inner)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:border-[#f59e0b] text-xs resize-none"
          />
        </div>

        {/* 3. 判断軸・価値観 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-[var(--color-text-sub)]">
            判断軸・価値観 (第2層: 判断軸)
          </label>
          <textarea
            value={newProjectValues}
            onChange={(e) => setNewProjectValues(e.target.value)}
            rows={3}
            placeholder="会議での決断で重視する軸。 例: 短期利益より長期的な信頼。隙間時間の5分で完結する高密度なアウトプット。"
            className="w-full p-2.5 border-2 border-[var(--color-border-inner)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:border-[#f59e0b] text-xs resize-none"
          />
        </div>

        {/* 4. 初期AI部署の編成 */}
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
          <label className="text-xs font-bold text-[var(--color-text-sub)]">
            初期AI部署・チームメンバーの編成
          </label>
          <p className="text-[10px] text-gray-400">
            プロジェクト起動時に自動編成される専門家チームです。作成後にメンバーの変更も可能です。
          </p>

          <div className="flex flex-col gap-2.5 mt-2">
            {DEPT_OPTIONS.map((dept) => {
              const isChecked = selectedDepts.includes(dept.key);
              return (
                <div
                  key={dept.key}
                  onClick={() => toggleDept(dept.key)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-start gap-3 shadow-sm select-none ${
                    isChecked
                      ? "bg-[#fdfbeb] border-[#f59e0b]"
                      : "bg-white border-gray-200 hover:bg-gray-50 opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // 親divのonClickで制御
                    className="mt-0.5 pointer-events-none accent-[#f59e0b]"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-[#3d2b1f]">{dept.name}</span>
                    <span className="text-[10px] text-gray-500 leading-relaxed">{dept.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. 送信ボタン */}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 mt-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCurrentScreen("home")}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary px-6"
            disabled={!newProjectName.trim()}
            onClick={handleCreateProject}
          >
            💾 プロジェクトを創出する
          </button>
        </div>

      </div>
    </div>
  );
};
