import React, { useState, useMemo } from "react";
import { ProviderType, PROVIDERS } from "../lib/apiKeyStore";
import { message } from "@tauri-apps/plugin-dialog";

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
  summaryModel: string;
  setSummaryModel: (val: string) => void;
};

export const SettingsScreen = React.memo(({
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
  setCurrentScreen,
  summaryModel,
  setSummaryModel
}: SettingsScreenProps) => {

  const [selectedBulkModel, setSelectedBulkModel] = useState<string>("");
  const [bulkUpdateSuccess, setBulkUpdateSuccess] = useState<string>("");

  // モック用のアプリトグル状態
  const [notifToggle, setNotifToggle] = useState<boolean>(true);
  const [autoSaveToggle, setAutoSaveToggle] = useState<boolean>(true);
  const [darkModeToggle, setDarkModeToggle] = useState<boolean>(false);

  // APIキーの個別入力モード状態 (未設定または変更するを押したプロバイダーを管理)
  const [editingProvider, setEditingProvider] = useState<{ [key in ProviderType]?: boolean }>({});

  // 設定画面の左ペイン用タブ状態
  const [activeTab, setActiveTab] = useState<"ai-api" | "profile" | "app" | "data">("ai-api");

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

  // サマリー用モデルのDB保存処理
  const handleSaveSummaryModel = async (modelId: string) => {
    if (!dbInstance) return;
    try {
      await dbInstance.execute(
        "UPDATE users SET summary_model = ?, updated_at = ? WHERE id = 1",
        [modelId, new Date().toISOString()]
      );
      setSummaryModel(modelId);
    } catch (e) {
      console.error("Failed to update summary model", e);
      alert(`サマリー用モデルの更新に失敗しました: ${String(e)}`);
    }
  };

  // テスト接続シミュレーション
  const handleTestConnection = async (provider: string) => {
    alert(`⚡ 【${provider}】へ接続テストを実行しました: 接続成功！`);
  };


  const providerList = useMemo(() => {
    return (Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => {
      const provider = PROVIDERS[key];
      const pName = provider.toUpperCase();
      const isSaved = apiKeysStatus[provider];
      const isEditing = editingProvider[provider];
      const error = saveErrors[provider];
      const inputValue = inputKeys[provider] || "";
      return (
        <tr key={provider}>
          <td className="font-bold text-[#7a5c3a]">{pName}</td>
          <td>
            {isSaved ? <span className="mock-badge-saved">設定済み</span> : <span className="mock-badge-unsaved">未設定</span>}
          </td>
          <td>
            {isEditing ? (
              <div className="flex flex-col gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <input type="password" placeholder={`${pName}のAPIキー`} value={inputValue} onChange={(e) => setInputKeys(prev => ({ ...prev, [provider]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-mono shadow-inner" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: false }))} className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-200 transition-colors">キャンセル</button>
                  <button onClick={async () => { await handleSaveKey(provider); if (apiKeysStatus[provider]) setEditingProvider(prev => ({ ...prev, [provider]: false })); }} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold shadow-sm transition-colors">保存</button>
                </div>
                {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              </div>
            ) : (
              <div className="flex gap-3 justify-center">
                {isSaved ? (
                  <>
                    <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">変更する</button>
                    <button onClick={() => handleTestConnection(pName)} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">テスト接続</button>
                    <button onClick={() => handleDeleteKey(provider)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md text-xs font-bold transition-colors" title="削除">✕</button>
                  </>
                ) : (
                  <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold transition-colors shadow-sm">設定する</button>
                )}
              </div>
            )}
          </td>
        </tr>
      );
    });
  }, [apiKeysStatus, editingProvider, saveErrors, inputKeys, handleSaveKey, handleDeleteKey, setInputKeys]);
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ヘッダー */}
      <div className="panel-paper p-8 flex justify-between items-center bg-[var(--color-panel)] shrink-0 shadow-sm mb-6 mx-6 mt-4 border-2 border-[var(--color-border-inner)]">
        <h2 className="font-title text-3xl font-bold text-[#3d2b1f] flex items-center gap-3">
          <span>⚙️</span> 設定
        </h2>
        <button className="btn-secondary text-sm px-6 py-2" onClick={() => setCurrentScreen("home")}>
          🏠 ホームに戻る
        </button>
      </div>

      {/* 2ペインレイアウト本体 */}
      <div className="flex flex-1 min-h-0 mx-6 mb-6 gap-6">
        
        {/* 左ペイン: メニュー */}
        <div className="w-64 shrink-0 flex flex-col gap-3">
          <button onClick={() => setActiveTab("ai-api")} className={`text-left px-5 py-4 rounded-xl font-bold text-sm transition-colors border-2 ${activeTab === "ai-api" ? "bg-[var(--color-panel)] border-[#c8a96e] shadow-sm text-[#3d2b1f]" : "bg-white/50 border-transparent hover:bg-white text-gray-600"}`}>
            🤖 AI・API設定
          </button>
          <button onClick={() => setActiveTab("profile")} className={`text-left px-5 py-4 rounded-xl font-bold text-sm transition-colors border-2 ${activeTab === "profile" ? "bg-[var(--color-panel)] border-[#c8a96e] shadow-sm text-[#3d2b1f]" : "bg-white/50 border-transparent hover:bg-white text-gray-600"}`}>
            👤 コアプロフィール
          </button>
          <button onClick={() => setActiveTab("app")} className={`text-left px-5 py-4 rounded-xl font-bold text-sm transition-colors border-2 ${activeTab === "app" ? "bg-[var(--color-panel)] border-[#c8a96e] shadow-sm text-[#3d2b1f]" : "bg-white/50 border-transparent hover:bg-white text-gray-600"}`}>
            🔔 アプリ設定
          </button>
          <button onClick={() => setActiveTab("data")} className={`text-left px-5 py-4 rounded-xl font-bold text-sm transition-colors border-2 ${activeTab === "data" ? "bg-[var(--color-panel)] border-[#c8a96e] shadow-sm text-[#3d2b1f]" : "bg-white/50 border-transparent hover:bg-white text-gray-600"}`}>
            🧹 データ管理
          </button>
          <div className="mt-auto text-center text-xs text-[#7a5c3a] font-bold select-none py-4 opacity-70">
            AI Team Builder v1.0.0 💖
          </div>
        </div>

        {/* 右ペイン: コンテンツ */}
        <div className="flex-1 panel-paper p-8 bg-white flex flex-col min-h-0 overflow-y-auto border-2 border-[var(--color-border-inner)] shadow-sm">
          {successMsg && (
            <div className="mb-6 bg-emerald-50 border border-emerald-300 text-emerald-900 px-5 py-3 rounded-lg text-sm font-bold shrink-0">
              🌱 {successMsg}
            </div>
          )}

          {activeTab === "ai-api" && (
            <div className="flex flex-col gap-10 h-full">
              {/* APIキー管理セクション */}
              <section>
                <h3 className="font-bold text-xl text-[#3d2b1f] border-b-2 border-gray-100 pb-3 mb-4">🔑 APIキー管理</h3>
                <p className="text-sm text-gray-600 mb-4">各プロバイダーのAPIキーを設定してください。このキーはローカルのセキュアな領域に保存されます。</p>
                <div className="overflow-x-auto bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                  <table className="mock-table text-sm w-full">
                    <thead>
                      <tr>
                        <th style={{ width: "30%" }}>プロバイダー</th>
                        <th style={{ width: "20%" }}>ステータス</th>
                        <th style={{ width: "50%" }}>操作</th>
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


  const providerList = useMemo(() => {
    return (Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => {
      const provider = PROVIDERS[key];
      const pName = provider.toUpperCase();
      const isSaved = apiKeysStatus[provider];
      const isEditing = editingProvider[provider];
      const error = saveErrors[provider];
      const inputValue = inputKeys[provider] || "";
      return (
        <tr key={provider}>
          <td className="font-bold text-[#7a5c3a]">{pName}</td>
          <td>
            {isSaved ? <span className="mock-badge-saved">設定済み</span> : <span className="mock-badge-unsaved">未設定</span>}
          </td>
          <td>
            {isEditing ? (
              <div className="flex flex-col gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <input type="password" placeholder={`${pName}のAPIキー`} value={inputValue} onChange={(e) => setInputKeys(prev => ({ ...prev, [provider]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-mono shadow-inner" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: false }))} className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-200 transition-colors">キャンセル</button>
                  <button onClick={async () => { await handleSaveKey(provider); if (apiKeysStatus[provider]) setEditingProvider(prev => ({ ...prev, [provider]: false })); }} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold shadow-sm transition-colors">保存</button>
                </div>
                {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
              </div>
            ) : (
              <div className="flex gap-3 justify-center">
                {isSaved ? (
                  <>
                    <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">変更する</button>
                    <button onClick={() => handleTestConnection(pName)} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">テスト接続</button>
                    <button onClick={() => handleDeleteKey(provider)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md text-xs font-bold transition-colors" title="削除">✕</button>
                  </>
                ) : (
                  <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold transition-colors shadow-sm">設定する</button>
                )}
              </div>
            )}
          </td>
        </tr>
      );
    });
  }, [apiKeysStatus, editingProvider, saveErrors, inputKeys, handleSaveKey, handleDeleteKey, setInputKeys]);
  return (
                          <tr key={provider}>
                            <td className="font-bold text-[#3d2b1f] align-middle">{pName}</td>
                            <td className="text-center align-middle">
                              {isSaved ? <span className="mock-badge-saved">設定済み</span> : <span className="mock-badge-unsaved">未設定</span>}
                            </td>
                            <td className="align-middle">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                                  <input type="password" placeholder="キーを入力" value={inputVal} onChange={(e) => setInputKeys((prev) => ({ ...prev, [provider]: e.target.value }))} className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white font-mono shadow-inner" />
                                  <div className="flex gap-2 justify-end">
                                    <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: false }))} className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-200 transition-colors">キャンセル</button>
                                    <button onClick={async () => { await handleSaveKey(provider); if (apiKeysStatus[provider]) setEditingProvider(prev => ({ ...prev, [provider]: false })); }} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold shadow-sm transition-colors">保存</button>
                                  </div>
                                  {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
                                </div>
                              ) : (
                                <div className="flex gap-3 justify-center">
                                  {isSaved ? (
                                    <>
                                      <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">変更する</button>
                                      <button onClick={() => handleTestConnection(pName)} className="px-4 py-2 bg-[var(--color-bg)] hover:bg-[var(--color-panel)] border border-gray-400 rounded-md text-xs font-bold transition-colors shadow-sm">テスト接続</button>
                                      <button onClick={() => handleDeleteKey(provider)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md text-xs font-bold transition-colors" title="削除">✕</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setEditingProvider(prev => ({ ...prev, [provider]: true }))} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold transition-colors shadow-sm">設定する</button>
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
              </section>

              <div className="grid grid-cols-2 gap-8">
                {/* AIモデル一括適用セクション */}
                <section className="bg-gray-50/50 p-8 rounded-xl border border-gray-100">
                  <h3 className="font-bold text-lg text-[#3d2b1f] border-b-2 border-gray-200 pb-2 mb-3">🤖 AIモデル一括適用</h3>
                  <p className="text-xs text-gray-600 mb-4 leading-relaxed">全AI社員が会議や1on1で使用するLLMモデルを一括で変更します。</p>
                  
                  <div className="mt-2">
                    <label className="text-xs font-bold text-[var(--color-text-sub)] mb-2 block">適用するモデル</label>
                    <select value={selectedBulkModel} onChange={(e) => setSelectedBulkModel(e.target.value)} className="w-full p-3 border-2 border-[var(--color-border-outer)] rounded-lg bg-[#FDF6E3] text-[#3d2b1f] font-bold text-sm focus:outline-none focus:border-[#f59e0b] shadow-sm mb-4">
                      <option value="">モデルを選択してください...</option>
                      {availableModels.map(model => (
                        <option key={model.id} value={model.model_id}>[{model.provider}] {model.display_name}</option>
                      ))}
                    </select>
                    <button onClick={handleBulkModelUpdate} disabled={!selectedBulkModel} className="btn-primary text-sm py-3 w-full justify-center disabled:opacity-50 transition-all">
                      全員に一括適用
                    </button>
                  </div>

                  {bulkUpdateSuccess && (
                    <div className="mt-4 bg-emerald-50 border border-emerald-300 text-emerald-950 px-4 py-3 rounded-lg text-xs font-semibold">
                      🌱 {bulkUpdateSuccess}
                    </div>
                  )}
                </section>

                {/* サマリーモデルセクション */}
                <section className="bg-gray-50/50 p-8 rounded-xl border border-gray-100">
                  <h3 className="font-bold text-lg text-[#3d2b1f] border-b-2 border-gray-200 pb-2 mb-3">📝 サマリーモデル</h3>
                  <p className="text-xs text-gray-600 mb-4 leading-relaxed">会議全体の議事録サマリーを生成する際に優先して利用するモデルを選択します。コンテキストウィンドウが大きく、要約に長けたモデルをおすすめします。</p>
                  
                  <div className="mt-2">
                    <label className="text-xs font-bold text-[var(--color-text-sub)] mb-2 block">利用するモデル</label>
                    <select value={summaryModel} onChange={(e) => handleSaveSummaryModel(e.target.value)} className="w-full p-3 border-2 border-[var(--color-border-outer)] rounded-lg bg-[#FDF6E3] text-[#3d2b1f] font-bold text-sm focus:outline-none focus:border-[#f59e0b] shadow-sm">
                      {availableModels.map(model => (
                        <option key={model.id} value={model.model_id}>[{model.provider}] {model.display_name}</option>
                      ))}
                    </select>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="flex flex-col gap-6 h-full">
              <h3 className="font-bold text-lg text-[#3d2b1f] border-b-2 border-gray-100 pb-2">👤 ユーザー・コアプロフィール (第1層)</h3>
              <p className="text-xs text-gray-600 mb-2">このプロフィールは全AI社員のシステムプロンプトの最上層にマージされます。あなたの価値観、目標、制約条件などを記述してください。</p>
              
              {profileSaveSuccess && <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-1.5 rounded text-xs font-semibold max-w-2xl">🌱 {profileSaveSuccess}</div>}
              {profileSaveError && <div className="bg-red-50 border border-red-300 text-red-950 px-3 py-1.5 rounded text-xs font-semibold max-w-2xl">⚠️ {profileSaveError}</div>}

              <textarea value={editCoreProfile} onChange={(e) => setEditCoreProfile(e.target.value)} rows={15} className="w-full max-w-2xl flex-1 p-4 border-2 border-[var(--color-border-inner)] rounded-lg focus:outline-none focus:border-[#f59e0b] font-mono text-sm leading-relaxed bg-[#FDF9F0] text-[var(--color-text)] resize-none" placeholder="【ユーザー像】〜&#10;【コアバリュー】〜" />
              
              <div className="max-w-2xl flex justify-end mt-2 shrink-0">
                <button onClick={handleSaveProfile} className="btn-primary px-6 py-2 shadow-sm">💾 保存する</button>
              </div>
            </div>
          )}

          {activeTab === "app" && (
            <div className="flex flex-col gap-6 h-full">
              <h3 className="font-bold text-lg text-[#3d2b1f] border-b-2 border-gray-100 pb-2">🔔 アプリ設定</h3>
              <div className="flex flex-col gap-4 max-w-md mt-2">
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="font-bold text-sm text-[#3d2b1f] flex items-center gap-2"><span>🔔</span> デスクトップ通知</span>
                  <label className="mock-toggle"><input type="checkbox" checked={notifToggle} onChange={(e) => setNotifToggle(e.target.checked)} /><span className="mock-slider"><span className="mock-slider-label-on">ON</span><span className="mock-slider-label-off">OFF</span></span></label>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="font-bold text-sm text-[#3d2b1f] flex items-center gap-2"><span>💾</span> 会議ログの自動保存</span>
                  <label className="mock-toggle"><input type="checkbox" checked={autoSaveToggle} onChange={(e) => setAutoSaveToggle(e.target.checked)} /><span className="mock-slider"><span className="mock-slider-label-on">ON</span><span className="mock-slider-label-off">OFF</span></span></label>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="font-bold text-sm text-[#3d2b1f] flex items-center gap-2"><span>🌙</span> ダークモード（準備中）</span>
                  <label className="mock-toggle opacity-70"><input type="checkbox" disabled checked={darkModeToggle} onChange={(e) => setDarkModeToggle(e.target.checked)} /><span className="mock-slider"><span className="mock-slider-label-on">ON</span><span className="mock-slider-label-off">OFF</span></span></label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="flex flex-col gap-6 h-full">
              <h3 className="font-bold text-lg text-[#3d2b1f] border-b-2 border-gray-100 pb-2">🧹 データ管理</h3>
              <div className="flex flex-col gap-3 max-w-md mt-2">
                <button onClick={() => alert("全データベース情報をJSONとしてエクスポートします...")} className="btn-secondary justify-center py-3 font-bold"><span>📤</span> 全データをエクスポート (JSON)</button>
                <button onClick={() => alert("モデル一覧およびキャッシュ情報をリセットしました。")} className="btn-secondary justify-center py-3 font-bold"><span>🧹</span> キャッシュをクリア</button>
                <div className="mt-6 pt-4 border-t border-dashed border-gray-300 text-center bg-red-50 p-4 rounded-lg">
                  <span className="text-xs text-red-600 font-bold block mb-3">⚠️ 危険な操作ゾーン</span>
                  <button onClick={() => { if (confirm("本当にデータベースをリセットしますか？この操作は取り消せません。")) alert("データを初期化しました（シミュレーション）"); }} className="btn-danger w-full justify-center text-sm py-3 shadow font-bold"><span>🗑️</span> 全データを削除</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
