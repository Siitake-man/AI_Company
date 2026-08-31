import { useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import Database from "@tauri-apps/plugin-sql";
import { renderMarkdown } from "../lib/markdownRenderer";
import { finalizeMeetingViaRust, FinalizeMeetingPayload, MeetingMessageDraft } from "../lib/meetingPersistence";
import { MeetingReviewDraft } from "../lib/meetingSummary";

type SummaryScreenProps = {
  dbInstance: Database | null;
  draft: MeetingReviewDraft | null;
  participantMemberIds: number[];
  messages: MeetingMessageDraft[];
  summaryText?: string;
  meetingAgenda: string;
  meetingMode: "exploration" | "convergence" | null;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting" | "summary") => void;
  costStats?: { promptTokens: number; completionTokens: number; totalCost: number };
};

function toSummaryMarkdown(draft: MeetingReviewDraft): string {
  const { summary } = draft;
  const proCon = summary.proConTable.map((row) => `- ${row.member}: ${row.stance} / PRO: ${row.pro} / CON: ${row.con}`).join("\n");
  const agreements = summary.memberAgreementLevels.map((row) => `- ${row.member}: ${row.level}${row.note ? ` (${row.note})` : ""}`).join("\n");
  const actions = summary.nextActions.map((row) => `- ${row.action}${row.owner ? `（担当: ${row.owner}）` : ""}${row.due ? `（期限: ${row.due}）` : ""}`).join("\n");
  return [
    "## 論点・主な対立軸", summary.issues.map((item) => `- ${item}`).join("\n"),
    "## メンバーごとの立場", proCon || "- 記録なし",
    "## 確認できた事実", summary.facts.map((item) => `- ${item}`).join("\n"),
    "## 未解決の懸念", summary.openConcerns.map((item) => `- ${item}`).join("\n"),
    "## AI提言（参考）", summary.aiRecommendation ?? "探索モードのため、AI提言はありません。",
    "## メンバー合意度", agreements || "- 記録なし",
    "## 次のアクション候補", actions || "- 記録なし",
  ].join("\n\n");
}

export const SummaryScreen = ({ dbInstance, draft, participantMemberIds, messages, summaryText, meetingAgenda, meetingMode, setCurrentScreen, costStats }: SummaryScreenProps) => {
  const [decisions, setDecisions] = useState<string[]>([""]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveResult, setSaveResult] = useState<{ summaryId: number; learningCount: number } | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setDecisions([""]);
    setIsSaving(false);
    setSaveError("");
    setSaveResult(null);
  }, [draft?.meetingId]);

  useEffect(() => {
    if (saveError) errorRef.current?.focus();
  }, [saveError]);

  const renderedSummary = useMemo(() => draft ? toSummaryMarkdown(draft) : (summaryText ?? ""), [draft, summaryText]);

  const handleSaveDecisions = async () => {
    if (!draft || !dbInstance || isSaving) return;
    setIsSaving(true);
    setSaveError("");
    setSaveResult(null);
    const confirmedDecisions = decisions.map((item) => item.trim()).filter(Boolean);
    const payload: FinalizeMeetingPayload = {
      meetingId: draft.meetingId,
      mode: draft.mode,
      participantMemberIds,
      messages,
      structuredSummary: { ...draft.summary, decisions: confirmedDecisions },
      generatedAt: draft.generatedAt,
    };
    try {
      const result = await finalizeMeetingViaRust(payload);
      setSaveResult(result);
    } catch (err) {
      setSaveError(`確定保存に失敗しました。入力内容は保持されています。${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const filePath = await save({ title: "議事録を保存", defaultPath: `meeting_summary_${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!filePath) return;
      const content = `# 会議議事録サマリー\n\n**議題**: ${meetingAgenda}\n**進行モード**: ${meetingMode === "exploration" ? "探索モード（アイデア発散）" : "収束モード（決定事項整理）"}\n**作成日時**: ${new Date().toLocaleString("ja-JP")}\n\n---\n\n${renderedSummary}\n\n## ユーザーが確定した決定事項\n${decisions.filter(Boolean).map((item) => `- ${item}`).join("\n") || "- 未入力"}\n`;
      await writeTextFile(filePath, content);
      alert(`✅ 議事録をMarkdownファイルとして保存しました！\n保存先: ${filePath}`);
    } catch (err) {
      alert(`❌ エクスポートに失敗しました: ${String(err)}`);
    }
  };

  return (
    <div className="frame-wood flex flex-col h-full w-full p-6 box-border overflow-hidden">
      <div className="panel-paper p-4 mb-4 shrink-0 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="font-title text-2xl font-bold text-[var(--color-text)]">📝 議事録サマリー</h2>
          <span className="px-2.5 py-1 rounded text-xs font-bold bg-[var(--color-panel)] text-[var(--color-text)] border border-[var(--color-border-inner)]" role="status">
            {saveResult ? `確定保存済み（学習 ${saveResult.learningCount}件）` : draft ? "ユーザー決定待ち" : "アーカイブ表示"}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-sub)] items-center">
          <span>📌 議題: {meetingAgenda}</span>
          <span>{meetingMode === "exploration" ? "💡 探索モード" : "🎯 収束モード"}</span>
          <span>🗓️ {new Date().toLocaleDateString("ja-JP")}</span>
          {costStats && <span className="ml-auto font-bold text-[var(--color-text)]">💰 会議コスト: ${costStats.totalCost.toFixed(5)} ({costStats.promptTokens + costStats.completionTokens} tokens)</span>}
        </div>
      </div>

      <div className="panel-paper flex-1 p-6 mb-4 bg-[var(--color-surface)] overflow-y-auto" style={{ lineHeight: "28px" }}>
        <div className="h-full pl-6 border-l-[3px] border-[var(--color-interrupt)]">
          <div className="py-2">{renderMarkdown(renderedSummary)}</div>
        </div>

        {draft && (
          <section className="mt-6 border-t-2 border-[var(--color-border-inner)] pt-4" aria-labelledby="decision-heading">
            <h3 id="decision-heading" className="font-title text-xl font-bold">ユーザー決定事項</h3>
            <p className="text-xs text-[var(--color-text-sub)] mb-3">AI提言とは分離されています。入力内容を確定して保存した時だけ会議と学習履歴に保存されます。</p>
            <div className="flex flex-col gap-2">
              {decisions.map((decision, index) => (
                <div className="flex gap-2" key={`decision-${index}`}>
                  <input className="input-paper flex-1 min-h-[44px]" value={decision} aria-label={`決定事項 ${index + 1}`} onChange={(event) => setDecisions((prev) => prev.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} disabled={isSaving || !!saveResult} />
                  <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setDecisions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disabled={isSaving || !!saveResult || decisions.length <= 1} aria-label={`決定事項 ${index + 1}を削除`}>削除</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setDecisions((prev) => [...prev, ""])} disabled={isSaving || !!saveResult}>＋決定事項を追加</button>
              <button type="button" className="btn-primary min-h-[44px]" onClick={handleSaveDecisions} disabled={isSaving || !!saveResult}>{isSaving ? "保存中..." : "入力内容を確定して保存"}</button>
            </div>
            {saveError && <p ref={errorRef} tabIndex={-1} className="mt-3 text-sm text-[var(--color-interrupt)]" role="alert">{saveError}</p>}
          </section>
        )}
      </div>

      <div className="flex justify-between items-center pt-4 shrink-0 border-t-2 border-[var(--color-border-inner)]">
        <button className="btn-secondary min-h-[44px]" onClick={() => setCurrentScreen("home")}>🏠 ホームに戻る</button>
        <button className="btn-primary min-h-[44px]" onClick={handleExport}>📄 Markdownで保存</button>
      </div>
    </div>
  );
};
