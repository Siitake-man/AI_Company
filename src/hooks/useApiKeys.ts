import { useState, useCallback } from "react";
import { getApiKey, saveApiKey, deleteApiKey, PROVIDERS, ProviderType } from "../lib/apiKeyStore";

export function useApiKeys(onKeyUpdated: () => Promise<void>) {
  const [apiKeysStatus, setApiKeysStatus] = useState<{ [key in ProviderType]?: boolean }>({
    [PROVIDERS.OPENAI]: false,
    [PROVIDERS.ANTHROPIC]: false,
    [PROVIDERS.GEMINI]: false,
    [PROVIDERS.TAVILY]: false,
    [PROVIDERS.BRAVE]: false
  });
  const [successMsg, setSuccessMsg] = useState("");
  const [saveErrors, setSaveErrors] = useState<{ [key in ProviderType]?: string }>({
    [PROVIDERS.OPENAI]: "",
    [PROVIDERS.ANTHROPIC]: "",
    [PROVIDERS.GEMINI]: "",
    [PROVIDERS.TAVILY]: "",
    [PROVIDERS.BRAVE]: ""
  });
  const [inputKeys, setInputKeys] = useState<{ [key in ProviderType]?: string }>({
    [PROVIDERS.OPENAI]: "",
    [PROVIDERS.ANTHROPIC]: "",
    [PROVIDERS.GEMINI]: "",
    [PROVIDERS.TAVILY]: "",
    [PROVIDERS.BRAVE]: ""
  });

  const refreshApiKeysStatus = useCallback(async () => {
    const openaiKey = await getApiKey(PROVIDERS.OPENAI);
    const anthropicKey = await getApiKey(PROVIDERS.ANTHROPIC);
    const geminiKey = await getApiKey(PROVIDERS.GEMINI);
    const tavilyKey = await getApiKey(PROVIDERS.TAVILY);
    const braveKey = await getApiKey(PROVIDERS.BRAVE);

    setApiKeysStatus({
      [PROVIDERS.OPENAI]: !!openaiKey,
      [PROVIDERS.ANTHROPIC]: !!anthropicKey,
      [PROVIDERS.GEMINI]: !!geminiKey,
      [PROVIDERS.TAVILY]: !!tavilyKey,
      [PROVIDERS.BRAVE]: !!braveKey,
    });

    return !!(openaiKey || anthropicKey || geminiKey);
  }, []);

  const handleSaveKey = useCallback(async (provider: ProviderType) => {
    try {
      setSaveErrors((prev) => ({ ...prev, [provider]: "" }));
      setSuccessMsg("");
      const keyVal = inputKeys[provider];

      if (!keyVal || !keyVal.trim()) {
        setSaveErrors((prev) => ({ ...prev, [provider]: "APIキーを入力してください" }));
        return;
      }

      await saveApiKey(provider, keyVal);
      setInputKeys((prev) => ({ ...prev, [provider]: "" }));
      setSuccessMsg(`${provider.toUpperCase()} のAPIキーをセキュアストレージに安全に保管しました！`);

      await refreshApiKeysStatus();
      await onKeyUpdated();
    } catch (err) {
      console.error(err);
      setSaveErrors((prev) => ({ ...prev, [provider]: `保存失敗: ${String(err)}` }));
    }
  }, [inputKeys, refreshApiKeysStatus, onKeyUpdated]);

  const handleDeleteKey = useCallback(async (provider: ProviderType) => {
    try {
      setSuccessMsg("");
      await deleteApiKey(provider);
      setSuccessMsg(`${provider.toUpperCase()} のAPIキーを金庫から削除しました。`);
      await refreshApiKeysStatus();
      await onKeyUpdated();
    } catch (err) {
      console.error(err);
      alert(`削除に失敗しました: ${String(err)}`);
    }
  }, [refreshApiKeysStatus, onKeyUpdated]);

  return {
    apiKeysStatus,
    setApiKeysStatus,
    successMsg,
    setSuccessMsg,
    saveErrors,
    setSaveErrors,
    inputKeys,
    setInputKeys,
    refreshApiKeysStatus,
    handleSaveKey,
    handleDeleteKey
  };
}
