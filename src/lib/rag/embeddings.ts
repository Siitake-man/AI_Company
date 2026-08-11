import type { KnowledgeDocument } from "./types";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface EmbeddingProvider {
  /** Provider/model identifier used for observability and index compatibility. */
  readonly model: string;
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

type OpenAIEmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: unknown }>;
  error?: { message?: string };
};

/**
 * OpenAI embeddings adapter.
 *
 * The API key is accepted only at runtime and is never included in a
 * KnowledgeDocument or persisted by this module. `fetchImpl` is injectable so
 * unit tests do not need network access.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new Error("OpenAI embedding API key is required");
    }

    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_EMBEDDING_MODEL;
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/embeddings";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((text) => !text.trim())) {
      throw new Error("Embedding input must not contain blank text");
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: [...texts] }),
    });

    const payload = (await response.json()) as OpenAIEmbeddingResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message || `Embedding request failed (${response.status})`);
    }

    return normalizeEmbeddingResponse(payload, texts.length);
  }
}

/** Attach provider vectors without mutating the source documents. */
export async function embedKnowledgeDocuments(
  documents: readonly KnowledgeDocument[],
  provider: EmbeddingProvider,
): Promise<KnowledgeDocument[]> {
  if (documents.length === 0) return [];

  const vectors = await provider.embed(documents.map((document) => document.content));
  if (vectors.length !== documents.length) {
    throw new Error(
      `Embedding provider returned ${vectors.length} vectors for ${documents.length} documents`,
    );
  }

  return documents.map((document, index) => ({
    ...document,
    vector: validateVector(vectors[index], `documents[${index}]`),
  }));
}

function normalizeEmbeddingResponse(
  payload: OpenAIEmbeddingResponse,
  expectedCount: number,
): number[][] {
  if (!Array.isArray(payload.data) || payload.data.length !== expectedCount) {
    throw new Error("Embedding response did not contain one vector per input");
  }

  const ordered = [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((item, index) => validateVector(item.embedding, `response.data[${index}]`));
}

function validateVector(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((component) =>
    typeof component !== "number" || !Number.isFinite(component)
  )) {
    throw new Error(`Invalid embedding vector at ${label}`);
  }
  return [...value];
}
