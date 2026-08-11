import { describe, expect, it, vi } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "./promptMerger";

vi.mock("@tauri-apps/plugin-sql", () => ({ default: class {} }));

type QueryResultMap = {
  users?: Array<{ core_profile: string }>;
  projects?: Array<{ purpose: string; values: string }>;
  member?: Array<{
    member_name: string;
    role: string;
    personality_prompt: string;
    is_thinking_style_member: number;
    department_name: string;
    department_prompt: string;
    is_thinking_style_dept: number;
  }>;
  learnings?: Array<{ content: string }>;
};

function createMockDb(results: QueryResultMap = {}): Database {
  const select = vi.fn(async (sql: string, _params: unknown[]) => {
    if (sql.includes("FROM users")) return results.users ?? [];
    if (sql.includes("FROM projects")) return results.projects ?? [];
    if (sql.includes("FROM members")) return results.member ?? [];
    if (sql.includes("FROM member_learnings")) return results.learnings ?? [];
    return [];
  });
  return { select } as unknown as Database;
}

const standardResults: QueryResultMap = {
  users: [{ core_profile: "私は運営者です" }],
  projects: [{ purpose: "地域課題の解決", values: "透明性・持続可能性" }],
  member: [
    {
      member_name: "契約担当",
      role: "契約審査",
      personality_prompt: "慎重にリスクを評価する",
      is_thinking_style_member: 0,
      department_name: "法務部",
      department_prompt: "リスク回避的に対応する",
      is_thinking_style_dept: 0,
    },
  ],
  learnings: [
    { content: "契約は必ず二名体制でレビューする" },
    { content: "重要事項は文書化する" },
  ],
};

describe("getMergedSystemPrompt", () => {
  it("コアプロフィール→プロジェクト価値観→部署性質→個人人格→学習履歴の順で含める", async () => {
    const db = createMockDb(standardResults);
    const prompt = await getMergedSystemPrompt(db, {
      userId: 1,
      projectId: 2,
      memberId: 3,
    });

    const expectedOrder = [
      "# ユーザー（運営者）プロフィール",
      "私は運営者です",
      "# プロジェクト目標と価値観",
      "- 目的: 地域課題の解決",
      "- 判断軸・価値観: 透明性・持続可能性",
      "# 所属部署（法務部）の基本方針",
      "リスク回避的に対応する",
      "# あなたの人格と役割（法務部 / 契約担当）",
      "- 専門領域・役割: 契約審査",
      "慎重にリスクを評価する",
      "# これまでの決定事項・学習ルール",
      "1. 契約は必ず二名体制でレビューする",
      "2. 重要事項は文書化する",
    ];

    let lastIndex = -1;
    for (const fragment of expectedOrder) {
      const index = prompt.indexOf(fragment);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("思考スタイルメンバーでは部署の性質を継承しない", async () => {
    const db = createMockDb({
      ...standardResults,
      member: [
        {
          ...standardResults.member![0],
          is_thinking_style_member: 1,
          department_prompt: "部署らしさは継承しない",
        },
      ],
    });

    const prompt = await getMergedSystemPrompt(db, {
      userId: 1,
      projectId: 2,
      memberId: 3,
    });

    expect(prompt).toContain("# あなたの人格と役割（思考スタイル: 契約担当）");
    expect(prompt).not.toContain("# 所属部署（法務部）の基本方針");
    expect(prompt).not.toContain("部署らしさは継承しない");
  });

  it("思考スタイル部署に属するメンバーでも部署の性質を継承しない", async () => {
    const db = createMockDb({
      ...standardResults,
      member: [
        {
          ...standardResults.member![0],
          is_thinking_style_member: 0,
          is_thinking_style_dept: 1,
        },
      ],
    });

    const prompt = await getMergedSystemPrompt(db, {
      userId: 1,
      projectId: 2,
      memberId: 3,
    });

    expect(prompt).not.toContain("# 所属部署（法務部）の基本方針");
    expect(prompt).toContain("慎重にリスクを評価する");
  });

  it("学習履歴が空の場合は学習セクションを生成しない", async () => {
    const db = createMockDb({ ...standardResults, learnings: [] });
    const prompt = await getMergedSystemPrompt(db, {
      userId: 1,
      projectId: 2,
      memberId: 3,
    });

    expect(prompt).not.toContain("# これまでの決定事項・学習ルール");
    expect(prompt).toContain("慎重にリスクを評価する");
  });

  it("存在しないメンバーはエラーを投げる", async () => {
    const db = createMockDb({ ...standardResults, member: [] });

    await expect(
      getMergedSystemPrompt(db, { userId: 1, projectId: 2, memberId: 999 })
    ).rejects.toThrow("Member with ID 999 not found.");
  });
});
