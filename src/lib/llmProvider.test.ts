import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./apiKeyStore";
import { detectProvider } from "./llmProvider";

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
});
