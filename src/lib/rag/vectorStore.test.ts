import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeVectorStore } from "./vectorStore";
import type { KnowledgeDocument } from "./types";

function document(
  id: string,
  projectId: number,
  sourceId: number,
  vector: number[],
): KnowledgeDocument {
  return {
    id,
    project_id: projectId,
    source_type: "meeting_summary",
    content: id,
    vector,
    metadata: {
      created_at: "2026-08-11T00:00:00Z",
      source_id: sourceId,
      chunk_index: 0,
      chunk_count: 1,
    },
  };
}

describe("InMemoryKnowledgeVectorStore", () => {
  it("filters by project and returns cosine-ranked results", async () => {
    const store = new InMemoryKnowledgeVectorStore();
    await store.upsert([
      document("near", 7, 1, [1, 0]),
      document("far", 7, 2, [0, 1]),
      document("other-project", 8, 3, [1, 0]),
    ]);

    const results = await store.search(7, [1, 0], { topK: 10 });

    expect(results.map((result) => result.document.id)).toEqual(["near", "far"]);
    expect(results[0].score).toBeCloseTo(1);
  });

  it("removes all stale chunks for one source", async () => {
    const store = new InMemoryKnowledgeVectorStore();
    await store.upsert([
      document("meeting_summary:1:0", 7, 1, [1, 0]),
      document("meeting_summary:1:1", 7, 1, [0.9, 0.1]),
      document("meeting_summary:2:0", 7, 2, [0, 1]),
    ]);

    await store.deleteBySource(7, "meeting_summary", 1);

    const results = await store.search(7, [1, 0], { topK: 10 });
    expect(results.map((result) => result.document.id)).toEqual(["meeting_summary:2:0"]);
  });

  it("applies role and department retrieval lenses within a project", async () => {
    const store = new InMemoryKnowledgeVectorStore();
    await store.upsert([
      {
        ...document("strategy", 7, 1, [1, 0]),
        metadata: { ...document("strategy", 7, 1, [1, 0]).metadata, role_category: "strategy", department_id: 10 },
      },
      {
        ...document("legal", 7, 2, [0.99, 0.01]),
        metadata: { ...document("legal", 7, 2, [0.99, 0.01]).metadata, role_category: "legal", department_id: 20 },
      },
      {
        ...document("other-department", 7, 3, [0.98, 0.02]),
        metadata: { ...document("other-department", 7, 3, [0.98, 0.02]).metadata, role_category: "strategy", department_id: 30 },
      },
    ]);

    const results = await store.search(7, [1, 0], {
      topK: 10,
      roleCategory: "strategy",
      departmentId: 10,
    });

    expect(results.map((result) => result.document.id)).toEqual(["strategy"]);
  });

  it("rejects missing vectors and dimension mismatches", async () => {
    const store = new InMemoryKnowledgeVectorStore();
    await expect(store.upsert([{ ...document("missing", 7, 1, [1]), vector: undefined }]))
      .rejects.toThrow(/finite, non-empty vector/);
    await store.upsert([document("valid", 7, 1, [1, 0])]);
    await expect(store.search(7, [1])).rejects.toThrow(/dimension mismatch/);
  });
});
