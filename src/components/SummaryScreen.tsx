import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { renderMarkdown } from "../lib/markdownRenderer";

type SummaryScreenProps = {
  summaryText: string;
  meetingAgenda: string;
  meetingMode: "exploration" | "convergence" | null;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting" | "summary") => void;
  costStats?: { promptTokens: number; completionTokens: number; totalCost: number };
};

export const SummaryScreen = ({
  summaryText,
  meetingAgenda,
  meetingMode,
  setCurrentScreen,
  costStats,
}: SummaryScreenProps) => {

  const handleExport = async () => {
    try {
      const filePath = await save({
        title: "議事録を保存",
        defaultPath: `meeting_summary_${new Date().toISOString().slice(0, 10)}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });

      if (!filePath) return;

      const content = `# 会議議事録サマリー

**議題**: ${meetingAgenda}  
**進行モード**: ${meetingMode === "exploration" ? "探索モード（アイデア発散）" : "収束モード（決定事項整理）"}  
**作成日時**: ${new Date().toLocaleString("ja-JP")}

---

${summaryText}
`;
      
      await writeTextFile(filePath, content);
      alert(`✅ 議事録をMarkdownファイルとして保存しました！\n保存先: ${filePath}`);
    } catch (err) {
      alert(`❌ エクスポートに失敗しました: ${String(err)}`);
    }
  };

  return (
    <div className="frame-wood flex flex-col h-full w-full p-6 box-border overflow-hidden">
      {/* ヘッダーパネル */}
      <div className="panel-paper p-4 mb-4 shrink-0 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="font-title text-2xl font-bold text-[var(--color-text)]">📝 議事録サマリー</h2>
          <span className="mock-badge-saved">作成完了</span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-sub)] items-center">
          <span>📌 議題: {meetingAgenda}</span>
          <span>{meetingMode === "exploration" ? "💡 探索モード" : "🎯 収束モード"}</span>
          <span>🗓️ {new Date().toLocaleDateString('ja-JP')}</span>
          {costStats ? (
            <span className="ml-auto font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
              💰 会議コスト: ${costStats.totalCost.toFixed(5)} ({costStats.promptTokens + costStats.completionTokens} tokens)
            </span>
          ) : (
            <span className="ml-auto font-bold text-gray-500 bg-gray-50 px-2.5 py-1 rounded border border-gray-200 text-[10px]">
              📊 過去のアーカイブ議事録
            </span>
          )}
        </div>
      </div>

      {/* ルーズリーフ風本文エリア */}
      <div 
        className="panel-paper flex-1 p-6 mb-4 bg-white overflow-y-auto"
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 27px, #e2e8f0 27px, #e2e8f0 28px)",
          lineHeight: "28px",
          backgroundAttachment: "local"
        }}
      >
        <div 
          className="h-full pl-6"
          style={{
            borderLeft: "3px solid #fca5a5",
          }}
        >
          <div className="py-2">
            {renderMarkdown(summaryText)}
          </div>
        </div>
      </div>

      {/* フッターボタン */}
      <div className="flex justify-between items-center pt-4 shrink-0 border-t-2 border-[var(--color-border-inner)]">
        <button
          className="btn-secondary"
          onClick={() => setCurrentScreen("home")}
        >
          🏠 ホームに戻る
        </button>
        <button
          className="btn-primary"
          onClick={handleExport}
        >
          📄 Markdownで保存
        </button>
      </div>
    </div>
  );
};
