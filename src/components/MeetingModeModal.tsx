import { useState } from "react";

export type MeetingMode = "exploration" | "convergence";

type MeetingModeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: MeetingMode, agenda: string) => void;
};

export const MeetingModeModal = ({
  isOpen,
  onClose,
  onConfirm
}: MeetingModeModalProps) => {
  const [selectedMode, setSelectedMode] = useState<MeetingMode>("exploration");
  const [agenda, setAgenda] = useState<string>("プロジェクトの現在の目標と具体的なアクションプランについてブレインストーミングを行う");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div 
        className="panel-paper p-6 bg-white w-full max-w-xl flex flex-col gap-5 shadow-2xl border-4 border-[var(--color-border-outer)]" 
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        {/* ヘッダー */}
        <div className="flex justify-between items-center border-b-2 border-[var(--color-border-inner)] pb-2 shrink-0">
          <h3 className="font-title text-2xl font-bold flex items-center gap-2 text-[var(--color-border-outer)]">
            <span>🎙️</span> 会議を開始する
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 font-bold text-xl"
          >
            ✕
          </button>
        </div>

        {/* 議題（アジェンダ）入力フォーム */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <label className="text-xs font-bold text-[var(--color-text-sub)]">
            📚 今回の会議の議題（アジェンダ）:
          </label>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            rows={3}
            placeholder="会議で話し合う具体的な議題を入力してください..."
            className="w-full p-2.5 border-2 border-[var(--color-border-inner)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[#f59e0b] resize-none font-sans leading-relaxed"
          />
        </div>

        {/* 説明文 */}
        <p className="text-xs text-[var(--color-text-sub)] leading-relaxed">
          進行モードを選択してください。選んだモードに基づいてAIメンバーの対話ルールや最終的な議事録サマリーの構成が変化します。
        </p>

        {/* モード選択カード領域 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 探索モード */}
          <div
            onClick={() => setSelectedMode("exploration")}
            className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col gap-2 ${
              selectedMode === "exploration"
                ? "border-[var(--color-accent)] bg-[#FEF3C7]/40 shadow-md"
                : "border-[var(--color-border-inner)] hover:border-gray-400 bg-white"
            }`}
            style={{ 
              boxShadow: selectedMode === "exploration" ? "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)" : "" 
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-1.5 text-[#3d2b1f]">
                <span>💡</span> 探索モード
              </span>
              <input
                type="radio"
                checked={selectedMode === "exploration"}
                onChange={() => setSelectedMode("exploration")}
                className="accent-[var(--color-accent)]"
              />
            </div>
            <p className="text-[10px] text-[var(--color-text-sub)] leading-relaxed">
              メンバーが自由にアイデアを出し合い、ブレインストーミングを行うことで視野を広げます。発想を促す発散の対話を行います。
            </p>
            <span className="text-[9px] self-start bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
              アイデア発散・ブレスト
            </span>
          </div>

          {/* 収束モード */}
          <div
            onClick={() => setSelectedMode("convergence")}
            className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col gap-2 ${
              selectedMode === "convergence"
                ? "border-[var(--color-accent)] bg-[#FEF3C7]/40 shadow-md"
                : "border-[var(--color-border-inner)] hover:border-gray-400 bg-white"
            }`}
            style={{ 
              boxShadow: selectedMode === "convergence" ? "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)" : "" 
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-1.5 text-[#3d2b1f]">
                <span>🎯</span> 収束モード
              </span>
              <input
                type="radio"
                checked={selectedMode === "convergence"}
                onChange={() => setSelectedMode("convergence")}
                className="accent-[var(--color-accent)]"
              />
            </div>
            <p className="text-[10px] text-[var(--color-text-sub)] leading-relaxed">
              具体的なアクションプランの作成や意思決定、懸念点の解決にフォーカスし、合意形成に向けた現実的な対話を行います。
            </p>
            <span className="text-[9px] self-start bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">
              決定事項整理・ToDo化
            </span>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-end gap-3 border-t-2 border-[var(--color-border-inner)] pt-4 shrink-0">
          <button 
            onClick={onClose}
            className="btn-secondary px-5 py-2 rounded-lg text-sm"
          >
            キャンセル
          </button>
          <button 
            onClick={() => onConfirm(selectedMode, agenda.trim())}
            disabled={!agenda.trim()}
            className="btn-primary px-6 py-2 rounded-lg text-sm shadow-md font-bold disabled:opacity-50"
          >
            🏁 会議を開始する
          </button>
        </div>
      </div>
    </div>
  );
};
