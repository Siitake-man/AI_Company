import { useState } from "react";
import { ProviderType, PROVIDERS } from "../lib/apiKeyStore";

type SettingsScreenProps = {
  apiKeysStatus: { [key in ProviderType]?: boolean };
  successMsg: string;
  setSuccessMsg: (msg: string) => void;
  saveErrors: { [key in ProviderType]?: string };
  setSaveErrors: React.Dispatch<React.SetStateAction<{ [key in ProviderType]?: string }>>;
  inputKeys: { [key in ProviderType]?: string };
  setInputKeys: React.Dispatch<React.SetStateAction<{ [key in ProviderType]?: string }>>;
  handleSaveKey: (provider: ProviderType) => Promise<void>;
  handleDeleteKey: (provider: ProviderType) => Promise<void>;
  modelSyncStatus: string;
  availableModels: any[];
  newModelProvider: string;
  setNewModelProvider: (val: string) => void;
  newModelId: string;
  setNewModelId: (val: string) => void;
  newModelDisplayName: string;
  setNewModelDisplayName: (val: string) => void;
  fetchModels: () => Promise<void>;
  fetchMembers: () => Promise<void>;
  dbInstance: any;
  editCoreProfile: string;
  setEditCoreProfile: (val: string) => void;
  profileSaveSuccess: string;
  profileSaveError: string;
  handleSaveProfile: () => Promise<void>;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting" | "summary") => void;
};

export const SettingsScreen = ({
  apiKeysStatus,
  successMsg,
  setSuccessMsg,
  saveErrors,
  setSaveErrors,
  inputKeys,
  setInputKeys,
  handleSaveKey,
  handleDeleteKey,
  modelSyncStatus,
  availableModels,
  newModelProvider,
  setNewModelProvider,
  newModelId,
  setNewModelId,
  newModelDisplayName,
  setNewModelDisplayName,
  fetchModels,
  fetchMembers,
  dbInstance,
  editCoreProfile,
  setEditCoreProfile,
  profileSaveSuccess,
  profileSaveError,
  handleSaveProfile,
  setCurrentScreen
}: SettingsScreenProps) => {

  const [selectedBulkModel, setSelectedBulkModel] = useState<string>("");
  const [bulkUpdateSuccess, setBulkUpdateSuccess] = useState<string>("");

  // モック用のアプリトグル状態
  const [notifToggle, setNotifToggle] = useState<boolean>(true);
  const [autoSaveToggle, setAutoSaveToggle] = useState<boolean>(true);
  const [darkModeToggle, setDarkModeToggle] = useState<boolean>(false);

  // APIキーの個別入力モード状態 (未設定または変更するを押したプロバイダーを管理)
  const [editingProvider, setEditingProvider] = useState<{ [key in ProviderType]?: boolean }>({});

  // ユーザー・コアプロフィール編集用モーダルの開閉状態
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // モデルの一括統括処理
  const handleBulkModelUpdate = async () => {
    if (!dbInstance) return;
    if (!selectedBulkModel) {
      alert("適用するモデルを選択してください。");
      return;
    }

    const modelName = availableModels.find(m => m.model_id === selectedBulkModel)?.display_name || selectedBulkModel;
    if (!confirm(`すべてのAI社員の利用モデルを「${modelName}」へ一括で変更します。よろしいですか？`)) {
      return;
    }

    try {
      setBulkUpdateSuccess("");
      await dbInstance.execute(
        "UPDATE members SET ai_model = ?",
        [selectedBulkModel]
      );
      setBulkUpdateSuccess(`すべてのAI社員のモデルを「${modelName}」に一括適用しました！`);
      await fetchMembers(); // App.tsx側のメンバー一覧をリロード
    } catch (e) {
      console.error("Failed to update models in bulk", e);
      alert(`一括適用の反映に失敗しました: ${String(e)}`);
    }
  };

  // テスト接続シミュレーション
  const handleTestConnection = (provider: string) => {
    alert(`⚡ 【${provider}】へ接続テストを実行しました: 接続成功！`);
  };

  // 全要素を860px幅制限・左右自動マージンで完全に中央制御（モックの表示幅を再現）
  const containerStyle: React.CSSProperties = {
    maxWidth: "860px",
    width: "100%",
    marginLeft: "auto",
    marginRight: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    padding: "0 12px"
  };

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto pr-2 pb-12">
      
      <div style={containerStyle}>
        
        {/* ヘッダー (モック風のシンプルデザイン) */}
        <div className="panel-paper p-4 flex justify-between items-center bg-[var(--color-panel)] shrink-0 shadow-sm">
          <h2 className="font-bold text-lg text-[#3d2b1f] flex items-center gap-2">
            <span>⚙️</span> 設定
          </h2>
          <button
            className="btn-secondary text-xs"
            onClick={() => setCurrentScreen("home")}
          >
            ← ホームに戻る
          </button>
        </div>

        {/* 2x2 グリッドレイアウトコンテナ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-h-0">
          
          {/* 1. 🔑 APIキー管理 (左上) */}
          <div className="panel-paper p-4 shadow-sm bg-white flex flex-col gap-3 min-h-[300px]">
            <h3 className="font-bold text-sm text-[#3d2b1f] flex items-center gap-1">
              <span>🍃</span> APIキー管理 <span>🍃</span>
            </h3>
            
            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-1 rounded text-[10px] font-bold">
                🌱 {successMsg}
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="mock-table text-xs">
                <thead>
                  <tr>
                    <th style={{ width: "35%" }}>プロバイダー</th>
                    <th style={{ width: "25%" }}>ステータス</th>
                    <th style={{ width: "40%" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => {
                    const provider = PROVIDERS[key] as ProviderType;
                    const isSaved = apiKeysStatus[provider];
                    const isEditing = editingProvider[provider];
                    const inputVal = inputKeys[provider] || "";
                    const error = saveErrors[provider];

                    let pName = "";
                    if (provider === PROVIDERS.OPENAI) pName = "OpenAI";
                    else if (provider === PROVIDERS.ANTHROPIC) pName = "Anthropic";
                    else if (provider === PROVIDERS.GEMINI) pName = "Gemini";
                    else if (provider === PROVIDERS.TAVILY) pName = "Tavily Search";
                    else if (provider === PROVIDERS.BRAVE) pName = "Brave Search";

                    return (
                      <tr key={provider}>
                        <td className="font-bold text-[#3d2b1f] align-middle">{pName}</td>
                        <td className="text-center align-middle">
                          {isSaved ? (
                            <span className="mock-badge-saved">設定済み</span>
                          ) : (
                            <span className="mock-badge-unsaved">未設定</span>
                          )}
                        </td>
                        <td className="align-middle">
                          {isEditing ? (
                            <div className="flex flex-col gap-1 p-1 bg-amber-50 rounded border border-amber-200">
                              <input
                                type="password"
                                placeholder="キーを入力"
                                value={inputVal}
                                onChange={(e) => setInputKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                                className="w-full p-1 border border-gray-300 rounded text-[10px] bg-white font-mono"
                              />
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: false }))}
                                  className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 text-gray-700 rounded text-[9px]"
                                >
                                  キャンセル
                                </button>
                                <button
                                  onClick={async () => {
                                    await handleSaveKey(provider);
                                    if (apiKeysStatus[provider]) {
                                      setEditingProvider(prev => ({ ...prev, [provider]: false }));
                                    }
                                  }}
                                  className="px-2 py-0.5 bg-amber-500 text-white rounded text-[9px] font-bold"
                                >
                                  保存
                                </button>
                              </div>
                              {error && <p className="text-[8px] text-red-600 font-semibold">{error}</p>}
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              {isSaved ? (
                                <>
                                  <button
                                    onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))}
                                    className="px-2 py-1 bg-[#F6EDDC] hover:bg-[#EDD9B0] border border-gray-400 rounded text-[9px] font-bold"
                                  >
                                    変更する
                                  </button>
                                  <button
                                    onClick={() => handleTestConnection(pName)}
                                    className="px-2 py-1 bg-[#F6EDDC] hover:bg-[#EDD9B0] border border-gray-400 rounded text-[9px] font-bold"
                                  >
                                    テスト接続
                                  </button>
                                  <button
                                    onClick={() => handleDeleteKey(provider)}
                                    className="px-1 py-1 text-red-600 hover:text-red-800 text-[9px] font-bold"
                                    title="削除"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))}
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[9px] font-bold"
                                >
                                  設定する
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. 🎨 デフォルトモデル/一括統括 (右上) */}
          <div className="panel-paper p-4 shadow-sm bg-white flex flex-col gap-3 min-h-[300px]">
            <h3 className="font-bold text-sm text-[#3d2b1f] flex items-center gap-1">
              <span>🍃</span> デフォルトモデル <span>🍃</span>
            </h3>
            
            <div className="flex-1 flex flex-col justify-center gap-4 px-2">
              <div>
                <p className="text-xs text-[var(--color-text-sub)] font-bold mb-2">
                  AI社員のデフォルトモデルを選択してください
                </p>
                <select
                  value={selectedBulkModel}
                  onChange={(e) => setSelectedBulkModel(e.target.value)}
                  className="w-full p-2.5 border-2 border-[var(--color-border-outer)] rounded-lg bg-[#FDF6E3] text-[#3d2b1f] font-bold text-xs focus:outline-none focus:border-[#f59e0b] shadow-sm"
                >
                  <option value="">モデルを選択してください...</option>
                  {availableModels.map(model => (
                    <option key={model.id} value={model.model_id}>
                      [{model.provider}] {model.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {bulkUpdateSuccess && (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-1.5 rounded text-[10px] font-semibold">
                  🌱 {bulkUpdateSuccess}
                </div>
              )}

              <button
                onClick={handleBulkModelUpdate}
                disabled={!selectedBulkModel}
                className="btn-primary text-xs py-2.5 justify-center disabled:opacity-50"
              >
                全員に一括適用
              </button>
            </div>
          </div>

          {/* 3. 🔔 アプリ設定 (左下 - プロフィール編集モーダルへの導線を統合) */}
          <div className="panel-paper p-4 shadow-sm bg-white flex flex-col gap-3 min-h-[300px]">
            <h3 className="font-bold text-sm text-[#3d2b1f] flex items-center gap-1">
              <span>🍃</span> アプリ設定 <span>🍃</span>
            </h3>

            <div className="flex-1 flex flex-col justify-around gap-2 px-2 text-xs">
              {/* デスクトップ通知トグル */}
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="font-bold text-[#3d2b1f] flex items-center gap-2">
                  <span>🔔</span> デスクトップ通知
                </span>
                <label className="mock-toggle">
                  <input
                    type="checkbox"
                    checked={notifToggle}
                    onChange={(e) => setNotifToggle(e.target.checked)}
                  />
                  <span className="mock-slider">
                    <span className="mock-slider-label-on">ON</span>
                    <span className="mock-slider-label-off">OFF</span>
                  </span>
                </label>
              </div>

              {/* 会議ログの自動保存トグル */}
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="font-bold text-[#3d2b1f] flex items-center gap-2">
                  <span>💾</span> 会議ログの自動保存
                </span>
                <label className="mock-toggle">
                  <input
                    type="checkbox"
                    checked={autoSaveToggle}
                    onChange={(e) => setAutoSaveToggle(e.target.checked)}
                  />
                  <span className="mock-slider">
                    <span className="mock-slider-label-on">ON</span>
                    <span className="mock-slider-label-off">OFF</span>
                  </span>
                </label>
              </div>

              {/* ダークモードトグル */}
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="font-bold text-[#3d2b1f] flex items-center gap-2">
                  <span>🌙</span> ダークモード（準備中）
                </span>
                <label className="mock-toggle opacity-70">
                  <input
                    type="checkbox"
                    disabled
                    checked={darkModeToggle}
                    onChange={(e) => setDarkModeToggle(e.target.checked)}
                  />
                  <span className="mock-slider">
                    <span className="mock-slider-label-on">ON</span>
                    <span className="mock-slider-label-off">OFF</span>
                  </span>
                </label>
              </div>

              {/* ★プレミアム追加：第1層コアプロフィール編集へのかわいい導線ボタン */}
              <div className="pt-2 text-center">
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="btn-primary text-[11px] py-2 px-4 shadow-sm"
                >
                  👤 コアプロフィール (第1層) を編集する
                </button>
              </div>
            </div>
          </div>

          {/* 4. 🧹 データ管理 (右下) */}
          <div className="panel-paper p-4 shadow-sm bg-white flex flex-col gap-3 min-h-[300px]">
            <h3 className="font-bold text-sm text-[#3d2b1f] flex items-center gap-1">
              <span>🍃</span> データ管理 <span>🍃</span>
            </h3>

            <div className="flex-1 flex flex-col justify-center gap-3 px-2 text-xs">
              <button
                onClick={() => alert("全データベース情報をJSONとしてエクスポートします...")}
                className="btn-secondary justify-center py-2.5 font-bold"
              >
                <span>📤</span> 全データをエクスポート (JSON)
              </button>

              <button
                onClick={() => alert("モデル一覧およびキャッシュ情報をリセットしました。")}
                className="btn-secondary justify-center py-2.5 font-bold"
              >
                <span>🧹</span> キャッシュをクリア
              </button>

              <div className="mt-3 pt-3 border-t border-dashed border-gray-200 text-center">
                <span className="text-[10px] text-red-600 font-bold block mb-1.5">⚠️ 危険な操作ゾーン</span>
                <button
                  onClick={() => {
                    if (confirm("本当にデータベースをリセットしますか？この操作は取り消せません。")) {
                      alert("データを初期化しました（シミュレーション）");
                    }
                  }}
                  className="btn-danger w-full justify-center text-xs py-2 shadow font-bold"
                >
                  <span>🗑️</span> 全データを削除
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* コピーライト/バージョン表記 (モックと同じく下部に上品に表示) */}
        <div className="text-center text-[10px] text-[#7a5c3a] font-bold mt-2 select-none">
          AI Team Builder v1.0.0 💖
        </div>

      </div>

      {/* ユーザー・コアプロフィール編集用モーダル (デザインシステムに沿った紙調ノートモーダル) */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div 
            className="panel-paper p-6 bg-white w-full max-w-2xl flex flex-col gap-4 shadow-2xl border-4 border-[var(--color-border-outer)]"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            {/* モーダルヘッダー */}
            <div className="flex justify-between items-center border-b-2 border-[var(--color-border-inner)] pb-2">
              <h3 className="font-title text-2xl font-bold flex items-center gap-2 text-[#3d2b1f]">
                <span>👤</span> ユーザー・コアプロフィール (第1層)
              </h3>
              <button 
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setSuccessMsg("");
                }}
                className="text-gray-500 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--color-text-sub)]">
              このプロフィールは全AI社員のシステムプロンプト（最上層）にマージされます。あなたの価値観、目標、制約条件などを記述してください。
            </p>

            {profileSaveSuccess && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-1.5 rounded text-[10px] font-semibold">
                🌱 {profileSaveSuccess}
              </div>
            )}
            {profileSaveError && (
              <div className="bg-red-50 border border-red-300 text-red-950 px-3 py-1.5 rounded text-[10px] font-semibold">
                ⚠️ {profileSaveError}
              </div>
            )}

            {/* 紙調テキストエリア */}
            <div className="flex-1 flex flex-col gap-2 min-h-[300px]">
              <textarea
                value={editCoreProfile}
                onChange={(e) => setEditCoreProfile(e.target.value)}
                rows={14}
                className="w-full flex-1 p-3 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-xs leading-relaxed bg-[#FDF9F0] text-[var(--color-text)] resize-none"
                placeholder="【ユーザー像】〜&#10;【コアバリュー】〜"
              />
            </div>

            {/* 保存ボタン */}
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
              <button
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setSuccessMsg("");
                }}
                className="btn-secondary px-4 py-2"
              >
                閉じる
              </button>
              <button
                onClick={async () => {
                  await handleSaveProfile();
                }}
                className="btn-primary px-5 py-2"
              >
                💾 保存する
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
