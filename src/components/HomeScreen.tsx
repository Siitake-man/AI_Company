import React, { useState, useEffect, useMemo } from "react";

type HomeScreenProps = {
  dbInstance: any;
  projects: any[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number) => void;
  projectMembers: any[];
  getAvatarPath: (id: string) => string;
  getEmojiForRole: (dept: string, role: string) => string;
  getRoleColor: (role: string, dept: string) => string;
  setChatMemberId: (id: number) => void;
  setCurrentScreen: (s: string) => void;
  setCreateProjectError: (err: string) => void;
  fetchProjects: () => Promise<void>;
  onStartMeetingClick: () => void;
  onViewPastSummary: (summaryText: string, agenda: string, mode: any) => void;
};

export const HomeScreen = React.memo(({
  dbInstance,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  projectMembers,
  getAvatarPath,
  getEmojiForRole,
  getRoleColor,
  setChatMemberId,
  setCurrentScreen,
  setCreateProjectError,
  fetchProjects,
  onStartMeetingClick,
  onViewPastSummary,
}: HomeScreenProps) => {
  // プロジェクト編集用のローカル状態
  const [isEditingProject, setIsEditingProject] = useState<boolean>(false);
  const [editProjectPurpose, setEditProjectPurpose] = useState<string>("");
  const [editProjectValues, setEditProjectValues] = useState<string>("");

  // 会議統計情報と過去の会議履歴のローカル状態
  const [meetingStats, setMeetingStats] = useState<{ count: number; lastDate: string }>({ count: 0, lastDate: "なし" });
  const [pastMeetings, setPastMeetings] = useState<any[]>([]);

  const project = projects.find((p) => p.id === selectedProjectId);

  // 会議統計情報および過去の会議履歴の取得
  useEffect(() => {
    const fetchMeetingData = async () => {
      if (!dbInstance || !selectedProjectId) return;
      try {
        // 会議統計の取得
        const result = await dbInstance.select(
          "SELECT COUNT(*) as count FROM meetings WHERE project_id = ?",
          [selectedProjectId]
        );
        const lastMeeting = await dbInstance.select(
          "SELECT started_at FROM meetings WHERE project_id = ? ORDER BY id DESC LIMIT 1",
          [selectedProjectId]
        );

        let lastDateStr = "なし";
        if (lastMeeting && lastMeeting.length > 0) {
          const mDate = new Date(lastMeeting[0].started_at);
          lastDateStr = mDate.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
        }

        setMeetingStats({
          count: result[0]?.count || 0,
          lastDate: lastDateStr
        });

        // 過去の会議履歴（サマリー付き）を取得
        const past = await dbInstance.select(
          `SELECT m.id, m.mode, m.started_at, s.decisions as summary_text
           FROM meetings m
           JOIN meeting_summaries s ON m.id = s.meeting_id
           WHERE m.project_id = ? AND m.status = '終了'
           ORDER BY m.id DESC`,
          [selectedProjectId]
        );
        setPastMeetings(past || []);
      } catch (e) {
        console.error("Failed to fetch meeting data", e);
      }
    };
    fetchMeetingData();
  }, [dbInstance, selectedProjectId, projectMembers]);

  // 編集モードに入る際の初期化
  const startEditing = () => {
    if (project) {
      setEditProjectPurpose(project.purpose || "");
      setEditProjectValues(project.values || "");
      setIsEditingProject(true);
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

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '20px', overflow: 'hidden' }}>
      
      {/* 1. 左サイドバー (モック木目調デザイン) */}
      <div className="w-64 shrink-0 sidebar-wood rounded-xl flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <div className="panel-paper p-3 text-center mb-1 shrink-0 bg-[#F5E6C8]">
          <h2 className="font-title text-xl font-bold text-[#3d2b1f] tracking-wide flex items-center justify-center gap-1">
            <span>🍃</span> Projects <span>🍃</span>
          </h2>
        </div>

        {/* プロジェクト一覧 */}
        <div className="flex-1 flex flex-col gap-3.5" style={{ overflowY: 'auto', minHeight: 0, paddingRight: '2px' }}>
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => setSelectedProjectId(proj.id)}
              className={selectedProjectId === proj.id ? "sidebar-item-active" : "sidebar-item"}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🌱</span>
                <span className="truncate">{proj.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 新しいプロジェクト追加 */}
        <button 
          onClick={() => {
            setCreateProjectError("");
            setCurrentScreen("createProject");
          }}
          className="btn-secondary w-full justify-center shrink-0 py-3.5 font-bold"
        >
          ＋ 新しいプロジェクト
        </button>
      </div>

      {/* 2. 右メインエリア */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
        {selectedProjectId ? (
          <div className="flex-1 flex flex-col gap-5 min-h-0 relative">
            
            {/* スクロールコンテンツ */}
            <div style={{ flex: '1 1 0%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '6px', minHeight: 0, paddingBottom: '80px' }}>
              
              {/* [ヘッダー] プロジェクト名とエンブレムロゴ (S2モック準拠) */}
              <div className="panel-paper p-5 bg-white shadow-sm shrink-0">
                <div className="flex items-start gap-5">
                  {/* 若葉エンブレム (モックの盾マーク再現) */}
                  <div className="p-3 bg-[#F0E2CA] border-4 border-[var(--color-border-outer)] rounded-2xl flex items-center justify-center shrink-0 w-20 h-20 shadow-sm">
                    <span className="text-4xl select-none">🌱</span>
                  </div>

                  {/* プロジェクト詳細情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-3xl font-bold text-[#3d2b1f] tracking-tight truncate">
                        {project?.name}
                      </h2>
                      <div className="flex gap-2">
                        <button 
                          className="btn-secondary text-[10px] py-1 px-2.5 whitespace-nowrap"
                          onClick={startEditing}
                        >
                          📝 コンテキスト編集
                        </button>
                        <button 
                          className="btn-secondary text-[10px] py-1 px-2.5 whitespace-nowrap" 
                          onClick={() => setCurrentScreen("teamManage")}
                        >
                          👥 チーム管理
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text-sub)] leading-relaxed font-bold">
                      {project?.purpose || "目的が未設定です。"}
                    </p>
                  </div>
                </div>
              </div>

              {/* [中央] 統計指標カード (モック準拠) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="panel-paper p-3.5 flex items-center justify-center gap-2.5 border-2 border-[var(--color-border-outer)] bg-[#F5E6C8] font-bold text-xs shadow-sm">
                  <span className="text-lg">👥</span> 
                  <span>{projectMembers.length} メンバー</span>
                </div>
                <div className="panel-paper p-3.5 flex items-center justify-center gap-2.5 border-2 border-[var(--color-border-outer)] bg-[#F5E6C8] font-bold text-xs shadow-sm">
                  <span className="text-lg">📅</span> 
                  <span>最終会議: {meetingStats.lastDate}</span>
                </div>
                <div className="panel-paper p-3.5 flex items-center justify-center gap-2.5 border-2 border-[var(--color-border-outer)] bg-[#F5E6C8] font-bold text-xs shadow-sm">
                  <span className="text-lg">🎙️</span> 
                  <span>会議回数: {meetingStats.count}回</span>
                </div>
              </div>

              {/* 📋 過去の議事録（サマリー）履歴一覧 */}
              <div className="panel-paper p-4 bg-white/90 border-2 border-[var(--color-border-inner)] flex flex-col gap-3 shadow-sm shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-sub)] flex items-center gap-1.5 border-b border-dashed border-[var(--color-border-inner)] pb-1.5">
                  <span>📖</span> 過去の議事録サマリー履歴 ({pastMeetings.length}件)
                </span>
                {pastMeetings.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">過去の会議サマリーはまだありません。</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {pastMeetings.map((meet) => {
                      const mDate = new Date(meet.started_at).toLocaleString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      });
                      return (
                        <div
                          key={meet.id}
                          onClick={() => onViewPastSummary(meet.summary_text, "過去の会議", meet.mode)}
                          className="border border-[var(--color-border-inner)] rounded-lg p-2.5 bg-amber-50/10 hover:bg-amber-100/50 cursor-pointer flex justify-between items-center transition-all shadow-xs"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-xs font-bold text-[#3d2b1f] truncate">
                              {meet.mode === "exploration" ? "💡 探索会議" : "🎯 収束会議"} (会議 ID: {meet.id})
                            </span>
                            <span className="text-[10px] text-gray-400">{mDate}</span>
                          </div>
                          <span className="text-[10px] bg-amber-100 text-[#8B5A2B] border border-amber-200 px-3 py-1 rounded-md font-bold shrink-0 hover:bg-amber-200 transition-colors shadow-xs">
                            サマリーを見る 🔍
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* [下部] メンバータロットカード (横スライド型) */}
              <div className="mt-1 flex-1 flex flex-col min-h-0">
                <h3 className="font-bold text-md mb-3 flex items-center gap-1.5 text-[#3d2b1f]">
                  <span>👥</span> チームメンバー
                </h3>

                {/* 横スクロール対応のコンテナ */}
                <div 
                  className="flex gap-5 pb-4 overflow-x-auto min-h-0 w-full"
                  style={{
                    scrollbarWidth: 'thin',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {projectMembers.map((member) => {
                    const cardBg = getRoleColor(member.role, member.dept_name);
                    
                    // 役割カテゴリごとの太字カラー（モック準拠）
                    let roleTextColor = "text-[#3d2b1f]";
                    if (member.dept_name === "戦略" || member.dept_name === "経営" || member.dept_name === "PM") {
                      roleTextColor = "text-[#c2410c]"; // PM系: オレンジ
                    } else if (member.dept_name === "UI/UX" || member.dept_name === "デザイン") {
                      roleTextColor = "text-[#15803d]"; // デザイン系: グリーン
                    } else {
                      roleTextColor = "text-[#6d28d9]"; // 技術・エンジニア系: ラベンダー
                    }

                    return (
                      <div
                        key={member.id}
                        className="panel-paper flex flex-col items-center p-5 text-center transition-all border-2 border-[var(--color-border-outer)] rounded-2xl shadow-md min-w-[210px] max-w-[220px] shrink-0 hover:-translate-y-1 hover:shadow-lg"
                        style={{ backgroundColor: cardBg }}
                      >
                        {/* アバター画像枠 */}
                        <div 
                          className="bg-white/70 rounded-2xl flex items-center justify-center border-2 border-[var(--color-border-outer)] avatar-pixel shadow-inner overflow-hidden mb-4 shrink-0"
                          style={{ width: '110px', height: '110px' }}
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
                            <span className="text-5xl">{getEmojiForRole(member.dept_name, member.role)}</span>
                          )}
                        </div>

                        {/* 役割ラベル */}
                        <span className="text-[9px] font-bold text-[var(--color-text-sub)] border border-[var(--color-border-inner)] px-2 py-0.5 rounded-md bg-white/40 mb-1.5 shrink-0">
                          {member.dept_name}
                        </span>

                        {/* メンバー名 */}
                        <h4 className="font-bold text-sm text-[#3d2b1f] mb-1 truncate w-full shrink-0">
                          {member.name}
                        </h4>

                        {/* 役割肩書き (モック準拠カラー) */}
                        <div className={`font-bold text-[11px] mb-2 shrink-0 ${roleTextColor} truncate w-full`}>
                          {member.role}
                        </div>

                        {/* 人格・一言説明 */}
                        <p className="text-[10px] text-[var(--color-text-sub)] leading-relaxed h-12 overflow-y-auto w-full select-none mb-4">
                          {member.personality || "このメンバーのプロフィールは現在準備中です。"}
                        </p>

                        {/* 1on1で話すボタン */}
                        <button
                          onClick={() => {
                            setChatMemberId(member.id);
                            setCurrentScreen("chat");
                          }}
                          className="btn-secondary w-full justify-center py-1.5 text-xs mt-auto font-bold"
                        >
                          💬 1on1で話す
                        </button>
                      </div>
                    );
                  })}

                  {/* メンバー追加プレースホルダー */}
                  <div 
                    onClick={() => setCurrentScreen("teamManage")}
                    className="panel-paper flex flex-col items-center justify-center p-5 text-center cursor-pointer hover:bg-[#EDD9B0] transition-all border-dashed border-4 border-[var(--color-border-outer)] opacity-70 hover:opacity-90 min-w-[210px] max-w-[220px] rounded-2xl shrink-0"
                    style={{ minHeight: '340px' }}
                  >
                    <span className="text-4xl text-[var(--color-text-sub)] mb-2 select-none">＋</span>
                    <span className="font-bold text-xs text-[var(--color-text-sub)]">メンバーを追加</span>
                  </div>
                </div>
              </div>

              {/* 会議を始めるボタンをコンテンツの最下部に移動し、レイアウト整合性を改善 */}
              <div className="flex justify-center mt-6 mb-8 shrink-0">
                <button
                  onClick={onStartMeetingClick}
                  className="btn-primary text-md py-3.5 px-10 rounded-xl shadow-md hover:scale-[1.02] transition-transform flex items-center gap-2.5 font-bold"
                >
                  <span className="text-xl">🎙️</span>
                  <span>このプロジェクトの会議を始める</span>
                </button>
              </div>

            </div>
          </div>
        ) : (
          <div className="panel-paper p-10 flex flex-col items-center justify-center h-full gap-4 text-[var(--color-text-sub)] bg-[#F5E6C8]">
            <span className="text-5xl select-none">🌱</span>
            <div className="flex flex-col items-center justify-center">
              <div className="text-7xl mb-4 select-none">🏡</div>
              <p className="font-title text-3xl text-center leading-relaxed">
                あなたのミッションのために、<br/>最高のAIチームをつくりましょう。🌸
              </p>
            </div>
          </div>
        )}
      </div>

      {/* プロジェクト・コンテキスト編集モーダル */}
      {isEditingProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="panel-paper p-6 bg-white w-full max-w-lg flex flex-col gap-4 shadow-xl border-4 border-[var(--color-border-outer)]" style={{ backgroundColor: 'var(--color-bg)', maxHeight: '90vh' }}>
            <div className="flex justify-between items-center border-b-2 border-[var(--color-border-inner)] pb-2 shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-1.5 text-[#3d2b1f]">
                📝 プロジェクトコンテキストの編集
              </h3>
              <button 
                onClick={() => setIsEditingProject(false)}
                className="text-gray-500 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 min-h-0">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">🎯 プロジェクトの目的</label>
                <input 
                  type="text" 
                  value={editProjectPurpose} 
                  onChange={e => setEditProjectPurpose(e.target.value)} 
                  className="input-wood text-sm w-full"
                  placeholder="例: 社内NWトラブルシューティング用AIアシスタントの構築"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-sub)]">💎 価値観・判断基準（コンテキスト）</label>
                <textarea 
                  value={editProjectValues} 
                  onChange={e => setEditProjectValues(e.target.value)} 
                  rows={8}
                  className="w-full p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[#FDF9F0] text-[var(--color-text)] resize-y"
                  placeholder="例: &#10;- コスト効率よりも安全性を最優先する&#10;- 技術的な専門用語は初心者にも分かりやすく説明する"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t-2 border-[var(--color-border-inner)] pt-3 shrink-0">
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
                💾 保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
