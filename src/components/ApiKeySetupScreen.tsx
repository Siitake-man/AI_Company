import { ProviderType, PROVIDERS } from "../lib/apiKeyStore";

type ApiKeySetupScreenProps = {
  apiKeysStatus: { [key in ProviderType]?: boolean };
  successMsg: string;
  saveErrors: { [key in ProviderType]?: string };
  inputKeys: { [key in ProviderType]?: string };
  setInputKeys: React.Dispatch<React.SetStateAction<{ [key in ProviderType]?: string }>>;
  handleSaveKey: (provider: ProviderType) => Promise<void>;
  handleDeleteKey: (provider: ProviderType) => Promise<void>;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting") => void;
};

export const ApiKeySetupScreen = ({
  apiKeysStatus,
  successMsg,
  saveErrors,
  inputKeys,
  setInputKeys,
  handleSaveKey,
  handleDeleteKey,
  setCurrentScreen
}: ApiKeySetupScreenProps) => {

  const hasAnyKey = Object.values(apiKeysStatus).some((v) => v === true);

  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 mt-4">
      {/* 説明パネル */}
      <div className="bg-[#f5e6c8] border-2 border-[#c8a96e] p-5 rounded-lg shadow-sm flex flex-col gap-2">
        <h2 className="font-bold text-lg flex items-center gap-1 text-[#3d2b1f]">
          🗝️ 初回設定: APIキーの安全な保管
        </h2>
        <p className="text-sm leading-relaxed text-[#5c4636]">
          AIカンパニーでは、ユーザーのプライバシーとセキュリティを守るため、APIキーをデータベースではなく、お使いのPCのシステム（Windows: 資格情報マネージャー、Mac: キーチェーン）の<strong>セキュアな金庫</strong>へ直接保管します。平文でディスクに書き込まれることはありません。
        </p>
        <p className="text-xs text-[#8f6d53] italic mt-1">
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
          // Tavily, Brave などの検索プロバイダーは初回セットアップでは非表示、または表示してもよい。
          // 初回セットアップでは主要3社 (OpenAI, Anthropic, Gemini) に限定する設計を引き継ぎます。
          const provider = PROVIDERS[key] as ProviderType;
          if (provider === PROVIDERS.TAVILY || provider === PROVIDERS.BRAVE) return null;

          const isSaved = apiKeysStatus[provider];
          const error = saveErrors[provider];
          const inputVal = inputKeys[provider] || "";

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
              className="bg-white border-2 border-[#c8a96e] rounded-lg shadow-sm overflow-hidden flex flex-col"
            >
              {/* カードヘッダー */}
              <div className="bg-[#f5e6c8] px-4 py-3 border-b-2 border-[#c8a96e] flex justify-between items-center">
                <span className="font-bold text-sm tracking-wide text-[#3d2b1f]">{title}</span>
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
                        className="flex-1 px-3 py-2 border-2 border-[#c8a96e] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-sm shadow-inner bg-[#fdf6e3] text-[#3d2b1f]"
                      />
                      <button
                        onClick={() => handleSaveKey(provider)}
                        className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-white rounded-lg font-bold text-sm transition-all border border-[#d97706] shadow-sm flex items-center gap-1 shrink-0"
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
        {hasAnyKey ? (
          <button
            onClick={() => setCurrentScreen("promptTest")}
            className="px-8 py-3 bg-[#f59e0b] hover:bg-[#d97706] text-white font-extrabold rounded-lg shadow-md border-2 border-[#d97706] tracking-wider transition-all animate-bounce text-sm"
          >
            ✨ APIキー設定完了！マージ検証に進む
          </button>
        ) : (
          <p className="text-xs text-[#8f6d53] italic bg-[#f5e6c8] px-4 py-2 border border-[#c8a96e] rounded-lg">
            ※アプリを動かすには、最低1つ以上のAPIキーを金庫に保存してください。
          </p>
        )}
      </div>
    </div>
  );
};
