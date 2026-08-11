import type { KnowledgeDocument, KnowledgeSourceType } from "./types";

export interface VectorSearchOptions {
  topK?: number;
  minScore?: number;
}

export interface VectorSearchResult {
  document: KnowledgeDocument;
  score: number;
}

/** Storage boundary shared by the in-memory test store and a future LanceDB adapter. */
export interface KnowledgeVectorStore {
  upsert(documents: readonly KnowledgeDocument[]): Promise<void>;
  deleteBySource(
    projectId: number,
    sourceType: KnowledgeSourceType,
    sourceId: number,
  ): Promise<void>;
  search(
    projectId: number,
    queryVector: readonly number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]>;
}

/**
 * Small deterministic vector store used by tests and offline development.
 * LanceDB can implement the same interface without changing retrieval callers.
 */
export class InMemoryKnowledgeVectorStore implements KnowledgeVectorStore {
  private readonly documents = new Map<string, KnowledgeDocument>();

  async upsert(documents: readonly KnowledgeDocument[]): Promise<void> {
    for (const document of documents) {
      const vector = validateVector(document.vector, `document ${document.id}`);
      this.documents.set(document.id, {
        ...document,
        vector,
        metadata: { ...document.metadata },
      });
    }
  }

  async deleteBySource(
    projectId: number,
    sourceType: KnowledgeSourceType,
    sourceId: number,
  ): Promise<void> {
    for (const [id, document] of this.documents) {
      if (
        document.project_id === projectId &&
        document.source_type === sourceType &&
        document.metadata.source_id === sourceId
      ) {
        this.documents.delete(id);
      }
    }
  }

  async search(
    projectId: number,
    queryVector: readonly number[],
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const query = validateVector(queryVector, "queryVector");
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? -1;
    if (!Number.isInteger(topK) || topK < 1) {
      throw new Error("topK must be a positive integer");
    }
    if (!Number.isFinite(minScore)) {
      throw new Error("minScore must be finite");
    }

    return [...this.documents.values()]
      .filter((document) => document.project_id === projectId)
      .map((document) => {
        const vector = validateVector(document.vector, `document ${document.id}`);
        if (vector.length !== query.length) {
          throw new Error(`Vector dimension mismatch for document ${document.id}`);
        }
        return { document: cloneDocument(document), score: cosineSimilarity(query, vector) };
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
      .slice(0, topK);
  }
}

function cloneDocument(document: KnowledgeDocument): KnowledgeDocument {
  return {
    ...document,
    metadata: { ...document.metadata },
    vector: document.vector ? [...document.vector] : undefined,
  };
}

function validateVector(value: unknown, label: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((component) => typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw new Error(`${label} must contain a finite, non-empty vector`);
  }
  return [...value];
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}
