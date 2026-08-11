import { describe, expect, it } from "vitest";
import {
  buildKnowledgeDocuments,
  chunkText,
} from "./chunker";

describe("chunkText", () => {
  it("returns no chunks for blank content", () => {
    expect(chunkText("  \n ")).toEqual([]);
  });

  it("keeps short content intact", () => {
    expect(chunkText("  hello  ", { maxCharacters: 10 })).toEqual(["hello"]);
  });

  it("creates deterministic overlapping chunks", () => {
    expect(chunkText("0123456789", { maxCharacters: 6, overlapCharacters: 2 })).toEqual([
      "012345",
      "456789",
    ]);
  });

  it("rejects an overlap that would prevent progress", () => {
    expect(() =>
      chunkText("content", { maxCharacters: 4, overlapCharacters: 4 }),
    ).toThrow(/overlapCharacters/);
  });
});

describe("buildKnowledgeDocuments", () => {
  it("adds stable ids and source metadata to every chunk", () => {
    const documents = buildKnowledgeDocuments(
      {
        project_id: 7,
        source_type: "member_learning",
        source_id: 42,
        content: "abcdefghij",
        created_at: "2026-08-11T00:00:00Z",
        member_id: 3,
        department_id: 2,
        role_category: "engineering",
      },
      { maxCharacters: 6, overlapCharacters: 2 },
    );

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      id: "member_learning:42:0",
      project_id: 7,
      source_type: "member_learning",
      content: "abcdef",
      metadata: {
        source_id: 42,
        member_id: 3,
        department_id: 2,
        role_category: "engineering",
        chunk_index: 0,
        chunk_count: 2,
      },
    });
    expect(documents[1].id).toBe("member_learning:42:1");
  });
});
