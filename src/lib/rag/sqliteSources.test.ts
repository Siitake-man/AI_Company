import { describe, expect, it } from "vitest";
import {
  loadKnowledgeDocuments,
  loadKnowledgeSources,
  RagDatabase,
} from "./sqliteSources";

class FakeRagDatabase implements RagDatabase {
  async select<T>(query: string): Promise<T[]> {
    if (query.includes("FROM meeting_summaries")) {
      return [
        {
          source_id: 5,
          project_id: 9,
          mode: "収束",
          issues: "論点",
          decisions: "決定事項",
          next_actions: "次の行動",
          created_at: "2026-08-11T10:00:00Z",
        },
      ] as T[];
    }
    return [
      {
        source_id: 6,
        project_id: 9,
        member_id: 3,
        department_id: 2,
        department_name: "エンジニアリング部",
        role: "セキュリティ担当",
        content: "脅威モデルを先に確認する",
        created_at: "2026-08-11T11:00:00Z",
      },
    ] as T[];
  }
}

describe("loadKnowledgeSources", () => {
  it("loads both summaries and member learnings in newest-first order", async () => {
    const sources = await loadKnowledgeSources(new FakeRagDatabase(), 9);

    expect(sources.map((source) => source.source_type)).toEqual([
      "member_learning",
      "meeting_summary",
    ]);
    expect(sources[0].role_category).toBe("engineering");
    expect(sources[1].content).toContain("決定事項");
  });

  it("rejects invalid project ids", async () => {
    await expect(loadKnowledgeSources(new FakeRagDatabase(), 0)).rejects.toThrow(
      /projectId/,
    );
  });
});

describe("loadKnowledgeDocuments", () => {
  it("converts loaded sources into chunk documents", async () => {
    const documents = await loadKnowledgeDocuments(
      new FakeRagDatabase(),
      9,
      { maxCharacters: 10, overlapCharacters: 2 },
    );

    expect(documents.length).toBeGreaterThan(1);
    expect(documents.every((document) => document.project_id === 9)).toBe(true);
    expect(documents.some((document) => document.source_type === "member_learning")).toBe(true);
  });
});
