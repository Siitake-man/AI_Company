import { describe, expect, it, vi } from "vitest";
import { embedKnowledgeDocuments, OpenAIEmbeddingProvider } from "./embeddings";
import type { EmbeddingProvider } from "./embeddings";
import type { KnowledgeDocument } from "./types";

const documents: KnowledgeDocument[] = [
  {
    id: "meeting_summary:1:0",
    project_id: 7,
    source_type: "meeting_summary",
    content: "決定事項",
    metadata: {
      created_at: "2026-08-11T00:00:00Z",
      source_id: 1,
      chunk_index: 0,
      chunk_count: 1,
    },
  },
];

describe("OpenAIEmbeddingProvider", () => {
  it("posts inputs and restores response order", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0.2, 0.3] },
        { index: 0, embedding: [0.1, 0.4] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAIEmbeddingProvider({ apiKey: "runtime-key", fetchImpl });

    await expect(provider.embed(["first", "second"])).resolves.toEqual([
      [0.1, 0.4],
      [0.2, 0.3],
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer runtime-key" }),
        body: JSON.stringify({ model: "text-embedding-3-small", input: ["first", "second"] }),
      }),
    );
  });

  it("fails before making a request for blank input", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new OpenAIEmbeddingProvider({ apiKey: "runtime-key", fetchImpl });

    await expect(provider.embed(["  "])).rejects.toThrow(/blank text/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose the API key in an HTTP error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "invalid_api_key" },
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAIEmbeddingProvider({ apiKey: "secret-runtime-key", fetchImpl });

    await expect(provider.embed(["text"])).rejects.toThrow("invalid_api_key");
    await expect(provider.embed(["text"])).rejects.not.toThrow("secret-runtime-key");
  });
});

describe("embedKnowledgeDocuments", () => {
  it("returns copied documents with vectors and preserves the input", async () => {
    const provider: EmbeddingProvider = {
      model: "test-model",
      embed: vi.fn().mockResolvedValue([[0.5, 0.5]]),
    };

    const result = await embedKnowledgeDocuments(documents, provider);

    expect(result).toEqual([{ ...documents[0], vector: [0.5, 0.5] }]);
    expect(documents[0].vector).toBeUndefined();
  });

  it("rejects a provider response with a different count", async () => {
    const provider: EmbeddingProvider = {
      model: "test-model",
      embed: vi.fn().mockResolvedValue([]),
    };

    await expect(embedKnowledgeDocuments(documents, provider)).rejects.toThrow(/returned 0 vectors/);
  });
});
