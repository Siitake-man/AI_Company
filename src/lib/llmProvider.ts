/**
 * LLMプロバイダー呼び出しの統一インターフェース
 *
 * Phase 2a: OpenAI/Gemini は LangChain.js の ChatModel に置き換え。
 * Anthropic は @langchain/anthropic が Tauri のバンドルと非互換のため自前fetch。
 *
 * 外部インターフェース（callLLMWithPrompt / callLLMWithHistory / resolveApiKey）は変更なし。
 */

import { getApiKey, PROVIDERS, ProviderType } from "./apiKeyStore";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseMessage, SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

/** LLM呼び出しの共通レスポンス型 */
export interface LLMResponse {
    content: string;
    promptTokens: number;
    completionTokens: number;
}

/** メッセージの型 */
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

/** モデルIDからプロバイダー種別を判定 */
export function detectProvider(modelId: string): ProviderType | null {
    if (modelId.includes("gpt")) return PROVIDERS.OPENAI;
    if (modelId.includes("claude")) return PROVIDERS.ANTHROPIC;
    if (modelId.includes("gemini")) return PROVIDERS.GEMINI;
    return null;
}

/** モデルに対応するAPIキーを取得 */
export async function resolveApiKey(modelId: string): Promise<{ providerType: ProviderType | null; apiKey: string }> {
    const providerType = detectProvider(modelId);
    if (!providerType) return { providerType: null, apiKey: "" };
    const apiKey = (await getApiKey(providerType)) || "";
    return { providerType, apiKey };
}

/**
 * Anthropic 用の自前fetch
 * @langchain/anthropic の内部依存（node:fs, node:crypto等）がTauriのブラウザバンドルと非互換のため。
 */
async function callAnthropicWithFetch(
    modelId: string, systemPrompt: string, messages: ChatMessage[], apiKey: string
): Promise<LLMResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: modelId,
            system: systemPrompt,
            max_tokens: 1024,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        return { content: "APIリクエストエラー", promptTokens: 0, completionTokens: 0 };
    }
    if (data.content?.[0]) {
        return {
            content: data.content[0].text,
            promptTokens: data.usage?.input_tokens || 0,
            completionTokens: data.usage?.output_tokens || 0,
        };
    }
    return { content: "API応答形式エラー", promptTokens: 0, completionTokens: 0 };
}

/** LangChain.js の ChatModel インスタンスを生成（OpenAI / Gemini のみ） */
function createChatModel(modelId: string, apiKey: string, providerType: ProviderType) {
    if (providerType === PROVIDERS.OPENAI) {
        return new ChatOpenAI({ model: modelId, apiKey });
    }
    if (providerType === PROVIDERS.GEMINI) {
        return new ChatGoogleGenerativeAI({ model: modelId, apiKey });
    }
    throw new Error("未対応のプロバイダー");
}

/** LangChain のメッセージ形式に変換 */
function toLangChainMessages(systemPrompt: string, messages: ChatMessage[]): BaseMessage[] {
    const result: BaseMessage[] = [];
    if (systemPrompt) {
        result.push(new SystemMessage(systemPrompt));
    }
    for (const msg of messages) {
        result.push(msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content));
    }
    return result;
}

/** LangChain のレスポンスからトークン使用量を抽出 */
function extractTokens(response: unknown): {
    promptTokens: number;
    completionTokens: number;
} {
    const res = response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } } | undefined;
    const usage = res?.usage_metadata;
    if (usage) {
        return {
            promptTokens: usage.input_tokens || 0,
            completionTokens: usage.output_tokens || 0,
        };
    }
    return { promptTokens: 0, completionTokens: 0 };
}

/** 単一プロンプト呼び出し（MeetingScreen用）。callLLMWithHistoryへの委譲 */
export async function callLLMWithPrompt(params: {
    modelId: string;
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
}): Promise<LLMResponse> {
    return callLLMWithHistory({
        modelId: params.modelId,
        systemPrompt: params.systemPrompt,
        messages: [{ role: "user" as const, content: params.userPrompt }],
        apiKey: params.apiKey,
    });
}

/**
 * 会話履歴付きLLM呼び出し（ChatScreen用／内部実装の統一窓口）
 * Anthropic は自前fetch、OpenAI / Gemini は LangChain.js。
 */
export async function callLLMWithHistory(params: {
    modelId: string;
    systemPrompt: string;
    messages: ChatMessage[];
    apiKey: string;
}): Promise<LLMResponse> {
    const { modelId, systemPrompt, messages, apiKey } = params;
    const providerType = detectProvider(modelId);

    if (!providerType) {
        return { content: "未対応のモデルです: " + modelId, promptTokens: 0, completionTokens: 0 };
    }
    if (!apiKey) {
        return { content: "APIキーが設定されていません。設定画面からAPIキーを登録してください。", promptTokens: 0, completionTokens: 0 };
    }

    try {
        // Anthropic だけ自前fetch
        if (providerType === PROVIDERS.ANTHROPIC) {
            return await callAnthropicWithFetch(modelId, systemPrompt, messages, apiKey);
        }

        // OpenAI / Gemini は LangChain.js
        const model = createChatModel(modelId, apiKey, providerType);
        const langChainMessages = toLangChainMessages(systemPrompt, messages);
        const response = await model.invoke(langChainMessages);

        let content = "";
        if (typeof response.content === "string") {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            // 複合コンテンツの場合、text型のブロックだけ抽出
            const textBlocks = response.content.filter(
                (c: unknown): c is { type: "text"; text: string } =>
                    typeof c === "object" && c !== null && (c as { type?: string }).type === "text"
            );
            content = textBlocks.map((c) => (c as { text: string }).text).join("\n");
        }

        const { promptTokens, completionTokens } = extractTokens(response);

        return { content: content || "（空の応答）", promptTokens, completionTokens };
    } catch (apiErr) {
        console.error("LLM API Call failed:", apiErr);
        return {
            content: "APIコールエラー: " + (apiErr instanceof Error ? apiErr.message : String(apiErr)),
            promptTokens: 0,
            completionTokens: 0,
        };
    }
}

/**
 * 複数プロバイダーによる自動フォールバック付きLLM呼び出し（サマリー生成用）
 * 指定されたモデルのプロバイダーを優先し、エラーやキー不在時に他プロバイダーへ切り替える
 */
export async function callLLMWithFallback(params: {
    preferredModelId: string;
    systemPrompt: string;
    userPrompt: string;
}): Promise<{
    response: LLMResponse;
    finalProvider: ProviderType | null;
    finalModelId: string;
    errors: string[];
}> {
    const { preferredModelId, systemPrompt, userPrompt } = params;

    let firstProvider: ProviderType = PROVIDERS.GEMINI;
    if (preferredModelId.includes("gpt") || preferredModelId.includes("o1") || preferredModelId.includes("o3")) {
        firstProvider = PROVIDERS.OPENAI;
    } else if (preferredModelId.includes("claude")) {
        firstProvider = PROVIDERS.ANTHROPIC;
    } else if (preferredModelId.includes("gemini")) {
        firstProvider = PROVIDERS.GEMINI;
    }

    const providersToTry = [
        firstProvider,
        ...[PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI].filter((p) => p !== firstProvider),
    ];

    const errors: string[] = [];

    for (const prov of providersToTry) {
        const apiKey = (await getApiKey(prov as ProviderType)) || "";
        if (!apiKey) {
            errors.push(`${prov}: APIキー未設定`);
            continue;
        }

        let modelId = "gpt-4o-mini";
        if (prov === firstProvider) {
            modelId = preferredModelId;
        } else {
            if (prov === PROVIDERS.OPENAI) modelId = "gpt-4o-mini";
            else if (prov === PROVIDERS.ANTHROPIC) modelId = "claude-3-5-sonnet-20241022";
            else if (prov === PROVIDERS.GEMINI) modelId = "gemini-2.5-flash";
        }

        const res = await callLLMWithPrompt({
            modelId,
            systemPrompt,
            userPrompt,
            apiKey,
        });

        if (res.content && !res.content.startsWith("APIリクエストエラー") && !res.content.startsWith("APIコールエラー")) {
            return {
                response: res,
                finalProvider: prov as ProviderType,
                finalModelId: modelId,
                errors,
            };
        } else {
            errors.push(`${prov} (${modelId}): ${res.content}`);
        }
    }

    return {
        response: { content: "", promptTokens: 0, completionTokens: 0 },
        finalProvider: null,
        finalModelId: "",
        errors,
    };
}