type MemberEditorModalProps = {
  editingMember: any;
  setEditingMember: (member: any) => void;
  editMemberName: string;
  setEditMemberName: (name: string) => void;
  editMemberRole: string;
  setEditMemberRole: (role: string) => void;
  editMemberPersonality: string;
  setEditMemberPersonality: (p: string) => void;
  editMemberModel: string;
  setEditMemberModel: (m: string) => void;
  availableModels: any[];
  showInheritedDept: boolean;
  setShowInheritedDept: (show: boolean) => void;
  showInheritedProject: boolean;
  setShowInheritedProject: (show: boolean) => void;
  memberLearnings: any[];
  dbInstance: any;
  fetchMembers: () => Promise<void>;
  memberStats: {prompt_tokens: number, completion_tokens: number, total_cost: number};
  setMemberStats: (stats: any) => void;
};

export const MemberEditorModal = ({
  editingMember,
  setEditingMember,
  editMemberName,
  setEditMemberName,
  editMemberRole,
  setEditMemberRole,
  editMemberPersonality,
  setEditMemberPersonality,
  editMemberModel,
  setEditMemberModel,
  availableModels,
  showInheritedDept,
  setShowInheritedDept,
  showInheritedProject,
  setShowInheritedProject,
  memberLearnings,
  dbInstance,
  fetchMembers,
  memberStats,
  setMemberStats
}: MemberEditorModalProps) => {

  if (!editingMember) return null;

  return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8">
          <div className="panel-paper w-full max-w-5xl h-full flex flex-col shadow-2xl relative">

            {/* モーダルヘッダー */}
            <div className="flex justify-between items-center p-4 border-b-2 border-[var(--color-border-inner)] shrink-0">
              <h2 className="font-bold text-xl flex items-center gap-2">
                <span className="text-2xl">✏️</span> メンバー編集: {editingMember.name}
              </h2>
              <button className="text-[var(--color-text-sub)] hover:text-black font-bold text-xl" onClick={() => setEditingMember(null)}>✕</button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* 画面左半分：プロンプトエディタ */}
              <div className="flex-1 p-6 border-r-2 border-[var(--color-border-inner)] overflow-y-auto">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">名前</label>
                    <input type="text" value={editMemberName} onChange={e => setEditMemberName(e.target.value)} className="input-wood w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">役割（Role）</label>
                    <input type="text" value={editMemberRole} onChange={e => setEditMemberRole(e.target.value)} className="input-wood w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">個別システムプロンプト (Personality)</label>
                    <textarea value={editMemberPersonality} onChange={e => setEditMemberPersonality(e.target.value)} className="input-wood w-full h-32 resize-none leading-relaxed" placeholder="このメンバー固有の振る舞いや思考の癖を記述..." />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">使用AIモデル</label>
                    <select value={editMemberModel} onChange={e => setEditMemberModel(e.target.value)} className="input-wood w-full cursor-pointer">
                      {availableModels.map(m => (
                        <option key={m.id} value={m.model_id}>[{m.provider}] {m.display_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 継承設定のトグルスイッチ群 */}
                  <div className="mt-4 p-3 bg-white border border-[var(--color-border-inner)] rounded flex flex-col gap-3">
                    <h4 className="font-bold text-sm text-[var(--color-text)]">🧬 上位プロンプトの継承確認</h4>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="toggleInheritDept" checked={showInheritedDept} onChange={e => setShowInheritedDept(e.target.checked)} className="w-4 h-4 cursor-pointer" />
                      <label htmlFor="toggleInheritDept" className="cursor-pointer flex items-center gap-2 select-none">
                        <span className="text-xl">⚙️</span>
                        <span className="text-xs font-bold text-[var(--color-text)]">部署のルールを表示</span>
                      </label>
                    </div>
                    {showInheritedDept && (
                      <div className="text-xs text-[var(--color-text-sub)] p-2 bg-gray-50 border border-gray-200 rounded whitespace-pre-wrap leading-relaxed">
                        {editingMember.department_prompt || "（部署プロンプトは設定されていません）"}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id="toggleInheritProj" checked={showInheritedProject} onChange={e => setShowInheritedProject(e.target.checked)} className="w-4 h-4 cursor-pointer" />
                      <label htmlFor="toggleInheritProj" className="cursor-pointer flex items-center gap-2 select-none">
                        <span className="text-xl">🌱</span>
                        <span className="text-xs font-bold text-[var(--color-text)]">プロジェクト全体ルールを表示</span>
                      </label>
                    </div>

                    <div className="mt-4 p-3 bg-white border border-[var(--color-border-inner)] rounded flex flex-col gap-2">
                        <h4 className="font-bold text-sm">📊 利用統計（トークン・料金）</h4>
                        <div className="flex gap-4 text-sm">
                            <div>
                                <span className="text-[var(--color-text-sub)]">累積入力: </span>
                                <strong>{memberStats?.prompt_tokens?.toLocaleString() || 0}</strong>
                            </div>
                            <div>
                                <span className="text-[var(--color-text-sub)]">累積応答: </span>
                                <strong>{memberStats?.completion_tokens?.toLocaleString() || 0}</strong>
                            </div>
                        </div>
                        <div className="text-sm">
                            <span className="text-[var(--color-text-sub)]">合計推定利用料金: </span>
                            <strong>\${memberStats?.total_cost?.toFixed(3) || "0.000"} (約{((memberStats?.total_cost || 0) * 150).toFixed(1)}円)</strong>
                        </div>
                        <div className="flex justify-end mt-2">
                             <button className="btn-secondary text-xs text-[var(--color-danger)] border-[var(--color-danger)] px-2 py-1" onClick={async () => {
                                 if (window.confirm("このメンバーの利用統計をリセットしますか？")) {
                                     if (dbInstance && editingMember) {
                                         await dbInstance.execute("DELETE FROM api_usage_logs WHERE member_id = ?", [editingMember.id]);
                                         setMemberStats({prompt_tokens: 0, completion_tokens: 0, total_cost: 0});
                                         fetchMembers(); // Update team list badges
                                     }
                                 }
                             }}>🗑️ 統計をリセット</button>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 画面右半分：成長日誌 */}
              <div className="w-80 flex flex-col bg-[var(--color-bg)]">
                <div className="p-3 bg-[var(--color-panel)] border-b-2 border-[var(--color-border-inner)] shrink-0 flex items-center justify-center gap-2">
                   <h3 className="font-bold text-md text-[var(--color-text)]">📖 成長日誌（学習履歴）</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {memberLearnings.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-sub)] text-center mt-4">まだ学習記録はありません。</p>
                  ) : (
                    memberLearnings.map(l => (
                      <div key={l.id} className="bg-white p-3 rounded shadow-sm border border-[var(--color-border-inner)] text-xs">
                        <div className="text-gray-400 mb-1" style={{ fontSize: '10px' }}>{new Date(l.created_at).toLocaleString()}</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{l.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="p-4 border-t-2 border-[var(--color-border-inner)] flex justify-end gap-3 shrink-0">
              <button className="btn-secondary" onClick={() => setEditingMember(null)}>キャンセル</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (dbInstance && editingMember) {
                    try {
                      const nowStr = new Date().toISOString();
                      await dbInstance.execute(
                        "UPDATE members SET name = ?, role = ?, personality_prompt = ?, ai_model = ?, updated_at = ? WHERE id = ?",
                        [editMemberName, editMemberRole, editMemberPersonality, editMemberModel, nowStr, editingMember.id]
                      );
                      setEditingMember(null);
                      await fetchMembers(); // メンバー一覧をリロード
                    } catch (err) {
                      console.error("Failed to update member", err);
                      alert("更新に失敗しました。");
                    }
                  }
                }}
              >
                保存する
              </button>
            </div>
          </div>
        </div>
  );
}
