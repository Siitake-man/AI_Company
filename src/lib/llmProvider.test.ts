import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./apiKeyStore";
import { callLLMWithHistory, createLLMError, detectProvider } from "./llmProvider";

describe("detectProvider", () => {
  it("OpenAIモデルをopenaiとして判定する", () => {
    expect(detectProvider("gpt-4o-mini")).toBe(PROVIDERS.OPENAI);
    expect(detectProvider("gpt-4o")).toBe(PROVIDERS.OPENAI);
  });

  it("Anthropicモデルをanthropicとして判定する", () => {
    expect(detectProvider("claude-3-5-sonnet-20241022")).toBe(PROVIDERS.ANTHROPIC);
  });

  it("Geminiモデルをgeminiとして判定する", () => {
    expect(detectProvider("gemini-2.5-flash")).toBe(PROVIDERS.GEMINI);
  });

  it("未対応モデルはnullを返す", () => {
    expect(detectProvider("unknown-model")).toBeNull();
    expect(detectProvider("")).toBeNull();
  });

  it("エラーは秘密情報を含まない構造化型で返す", async () => {
    const result = await callLLMWithHistory({
      modelId: "gpt-4o-mini",
      systemPrompt: "",
      messages: [],
      apiKey: "",
    });

    expect(result.ok).toBe(false);
    expect(result.content).toBe("");
    expect(result.error).toMatchObject({
      code: "missing_api_key",
      providerType: PROVIDERS.OPENAI,
      modelId: "gpt-4o-mini",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("sk-");
  });

  it("未対応モデルも失敗結果として扱い、ログ本文を生成しない", async () => {
    const result = await callLLMWithHistory({
      modelId: "unknown-model",
      systemPrompt: "",
      messages: [],
      apiKey: "not-used",
    });

    expect(result).toMatchObject({
      ok: false,
      content: "",
      error: {
        code: "unsupported_model",
        providerType: null,
        retryable: false,
      },
    });
  });

  it("createLLMErrorは指定された境界情報だけを保持する", () => {
    expect(createLLMError({
      code: "provider_request_failed",
      message: "接続に失敗しました。",
      providerType: PROVIDERS.GEMINI,
      modelId: "gemini-2.5-flash",
      retryable: true,
    })).toEqual({
      code: "provider_request_failed",
      message: "接続に失敗しました。",
      providerType: PROVIDERS.GEMINI,
      modelId: "gemini-2.5-flash",
      retryable: true,
    });
  });
});
