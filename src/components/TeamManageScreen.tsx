type TeamManageScreenProps = {
  currentScreen: string;
  projects: any[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number) => void;
  setCreateProjectError: (err: string) => void;
  setCurrentScreen: (s: string) => void;
  projectMembers: any[];
  getAvatarPath: (id: string) => string;
  getEmojiForRole: (dept: string, role: string) => string;
  getRoleColor: (role: string, dept: string) => string;
  setChatMemberId: (id: number) => void;
  setEditingMember: (member: any) => void;
  setEditMemberName: (name: string) => void;
  setEditMemberRole: (role: string) => void;
  setEditMemberPersonality: (personality: string) => void;
  setEditMemberModel: (model: string) => void;
  dbInstance: any;
  setMemberLearnings: (learnings: any[]) => void;
  teamStats: {[id: number]: number};
};

export const TeamManageScreen = ({
  currentScreen,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  setCreateProjectError,
  setCurrentScreen,
  projectMembers,
  getAvatarPath,
  getEmojiForRole,
  getRoleColor,
  setChatMemberId,
  setEditingMember,
  setEditMemberName,
  setEditMemberRole,
  setEditMemberPersonality,
  setEditMemberModel,
  dbInstance,
  setMemberLearnings,
  teamStats
}: TeamManageScreenProps) => {

  if (currentScreen !== "teamManage" || !projects.find((p: any) => p.id === selectedProjectId)) return null;

  return (
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
                    {teamStats && teamStats[member.id] !== undefined && (
                        <p className="text-[10px] text-[var(--color-text-sub)] mt-1 font-bold">
                            💰 \${teamStats[member.id].toFixed(3)}
                        </p>
                    )}
                  </div>

                  {/* アクションボタン */}
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary text-green-700 py-1.5" onClick={() => { setChatMemberId(member.id); setCurrentScreen("chat"); }}>💬 話す</button>
                    <button
                      className="btn-secondary text-purple-700 py-1.5"
                      onClick={async () => {
                        setEditingMember(member);
                        setEditMemberName(member.name);
                        setEditMemberRole(member.role || "");
                        setEditMemberPersonality(member.personality_prompt || "");
                        setEditMemberModel(member.ai_model || "");

                        // 成長日誌（学習履歴）のロード
                        if (dbInstance) {
                          try {
                            const res = await dbInstance.select(
                              "SELECT * FROM member_learnings WHERE member_id = ? ORDER BY created_at DESC",
                              [member.id]
                            );
                            setMemberLearnings(res);
                          } catch (e) {
                            console.error("Failed to load learnings", e);
                          }
                        }
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
  );
}
