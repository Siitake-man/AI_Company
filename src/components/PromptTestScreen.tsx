type PromptTestScreenProps = {
  selectedMemberId: number;
  setSelectedMemberId: (id: number) => void;
  generateError: string;
  mergedPrompt: string;
};

export const PromptTestScreen = ({
  selectedMemberId,
  setSelectedMemberId,
  generateError,
  mergedPrompt
}: PromptTestScreenProps) => {
  return (
    <div className="flex-1 flex flex-col gap-6">
      {/* テスト切り替えエリア */}
      <div className="bg-[var(--color-panel)] border-2 border-[var(--color-border-inner)] p-4 rounded-lg shadow-sm flex flex-col gap-4">
        <h2 className="font-bold text-lg flex items-center gap-1 text-[var(--color-text)]">
          💡 テストケースの切り替え
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => setSelectedMemberId(1)}
            className={`flex-1 py-3 px-4 rounded-lg border-2 font-bold transition-all flex flex-col items-center gap-1 ${
              selectedMemberId === 1
                ? "bg-[var(--color-interrupt)] text-white border-[#d97706] shadow-md"
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
                ? "bg-[var(--color-interrupt)] text-white border-[#d97706] shadow-md"
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
          <h3 className="font-bold text-base flex items-center gap-1 text-[#5c4636]">
            📝 マージ出力結果（最終システムプロンプト）:
          </h3>
          <span className="text-xs bg-[var(--color-border-inner)] text-white px-3 py-1 rounded font-bold shadow-sm">
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
  );
};
