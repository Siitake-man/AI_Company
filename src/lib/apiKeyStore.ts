import { invoke } from "@tauri-apps/api/core";

export const PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
} as const;

export type ProviderType = typeof PROVIDERS[keyof typeof PROVIDERS];

/**
 * OSのセキュアストレージにAPIキーを保存します
 */
export async function saveApiKey(provider: ProviderType, apiKey: string): Promise<void> {
  if (!apiKey.trim()) {
    throw new Error("APIキーを入力してください");
  }
  await invoke("save_api_key", { provider, apiKey: apiKey.trim() });
}

/**
 * OSのセキュアストレージからAPIキーを取得します。
 * キーが存在しない、あるいは取得エラーの場合はnullを返します。
 */
export async function getApiKey(provider: ProviderType): Promise<string | null> {
  try {
    const key = await invoke<string>("get_api_key", { provider });
    return key || null;
  } catch (err) {
    // 登録されていない場合もエラーが返るため、安全にnullを返す
    console.log(`APIキー未検出 (${provider}):`, err);
    return null;
  }
}

/**
 * OSのセキュアストレージからAPIキーを削除します
 */
export async function deleteApiKey(provider: ProviderType): Promise<void> {
  try {
    await invoke("delete_api_key", { provider });
  } catch (err) {
    console.error(`APIキー削除エラー (${provider}):`, err);
    throw err;
  }
}

/**
 * いずれかのAPIキーが保存されているかチェックします
 */
export async function hasAnyApiKey(): Promise<boolean> {
  const providers = Object.values(PROVIDERS);
  for (const provider of providers) {
    const key = await getApiKey(provider);
    if (key) return true;
  }
  return false;
}
