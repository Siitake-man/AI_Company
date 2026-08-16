import { describe, expect, it } from "vitest";
import {
  MeetingSummaryParseError,
  parseStructuredMeetingSummary,
  stripJsonCodeFence,
  validateStructuredMeetingSummary,
} from "./meetingSummary";

const basePayload = {
  issues: ["契約更新の可否"],
  proConTable: [
    {
      issue: "契約更新の可否",
      member: "契約レビュー担当",
      stance: "条件付き賛成",
      pro: "撤退条項があればリスクは許容範囲",
      con: "文言の最終確認が必要",
    },
  ],
  facts: ["現行契約は12月末まで"],
  openConcerns: ["解約時の移行期間が未確定"],
  aiRecommendation: "撤退条項を追加した更新案を推奨",
  memberAgreementLevels: [
    { member: "契約レビュー担当", level: 4, note: "条件付き合意" },
  ],
  nextActions: [
    { action: "契約書ドラフト作成", owner: "契約レビュー担当", due: "2026-08-31" },
  ],
};

describe("parseStructuredMeetingSummary", () => {
  it("accepts a valid JSON payload and omits decisions from the result", () => {
    const summary = parseStructuredMeetingSummary(JSON.stringify(basePayload), {
      mode: "convergence",
    });

    expect(summary.issues).toEqual(["契約更新の可否"]);
    expect(summary.proConTable[0].member).toBe("契約レビュー担当");
    expect(summary.facts).toEqual(["現行契約は12月末まで"]);
    expect(summary.openConcerns).toHaveLength(1);
    expect(summary.aiRecommendation).toBe("撤退条項を追加した更新案を推奨");
    expect(summary.memberAgreementLevels[0].level).toBe(4);
    expect(summary.nextActions[0].owner).toBe("契約レビュー担当");
    expect("decisions" in summary).toBe(false);
  });

  it("rejects aiRecommendation in exploration mode", () => {
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(basePayload), {
        mode: "exploration",
      })
    ).toThrowError(
      expect.objectContaining({ code: "TYPE_MISMATCH" })
    );
  });

  it("accepts null aiRecommendation in exploration mode", () => {
    const summary = parseStructuredMeetingSummary(
      JSON.stringify({ ...basePayload, aiRecommendation: null }),
      { mode: "探索" }
    );

    expect(summary.aiRecommendation).toBeNull();
    expect(summary.issues).toHaveLength(1);
  });

  it("accepts JSON wrapped in a json code fence", () => {
    const raw = `\`\`\`json\n${JSON.stringify(basePayload, null, 2)}\n\`\`\``;
    const summary = parseStructuredMeetingSummary(raw, { mode: "収束" });

    expect(summary.nextActions[0].action).toBe("契約書ドラフト作成");
  });

  it("accepts JSON wrapped in a plain code fence", () => {
    const raw = `\`\`\`\n${JSON.stringify(basePayload)}\n\`\`\``;
    const summary = parseStructuredMeetingSummary(raw, { mode: "convergence" });

    expect(summary.proConTable[0].con).toContain("最終確認");
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      parseStructuredMeetingSummary("{ issues: [", { mode: "exploration" })
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" })
    );
  });

  it("rejects a full Markdown response", () => {
    const markdown = `# 議事録\n\n## 論点\n- 契約更新\n\nこれはJSONではありません`;
    expect(() =>
      parseStructuredMeetingSummary(markdown, { mode: "exploration" })
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" })
    );
  });

  it("rejects prose surrounding a JSON fence", () => {
    const raw = `以下が議事録です。\n\`\`\`json\n${JSON.stringify(basePayload)}\n\`\`\``;
    expect(() =>
      parseStructuredMeetingSummary(raw, { mode: "convergence" })
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" })
    );
  });

  it("rejects a payload containing decisions", () => {
    const contaminated = { ...basePayload, decisions: ["ユーザーだけが確定できる"] };
    let caught: MeetingSummaryParseError | undefined;
    try {
      parseStructuredMeetingSummary(JSON.stringify(contaminated), {
        mode: "convergence",
      });
    } catch (err) {
      caught = err as MeetingSummaryParseError;
    }

    expect(caught?.code).toBe("UNEXPECTED_KEY");
    expect(caught?.message).toContain("decisions");
  });

  it("rejects an unknown top-level key", () => {
    const extra = { ...basePayload, title: "余計なタイトル" };
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(extra), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "UNEXPECTED_KEY" })
    );
  });

  it("rejects a missing required field", () => {
    const { issues: _dropped, ...withoutIssues } = basePayload;
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(withoutIssues), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "MISSING_FIELD" })
    );
  });

  it("rejects a type mismatch in the top level", () => {
    const mismatched = { ...basePayload, issues: "論点という文字列" };
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(mismatched), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "TYPE_MISMATCH" })
    );
  });

  it("rejects a type mismatch inside proConTable", () => {
    const mismatched = {
      ...basePayload,
      proConTable: [{ ...basePayload.proConTable[0], member: 123 }],
    };
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(mismatched), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "TYPE_MISMATCH" })
    );
  });

  it("rejects a wrong type for aiRecommendation", () => {
    const mismatched = { ...basePayload, aiRecommendation: 42 };
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(mismatched), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "TYPE_MISMATCH" })
    );
  });

  it("rejects malformed rows with unknown keys", () => {
    const malformed = {
      ...basePayload,
      nextActions: [{ ...basePayload.nextActions[0], result: "確定済み" }],
    };
    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(malformed), {
        mode: "convergence",
      })
    ).toThrowError(
      expect.objectContaining({ code: "UNEXPECTED_KEY" })
    );
  });

  it("accepts empty collections as valid unconfirmed state", () => {
    const empty = {
      issues: [],
      proConTable: [],
      facts: [],
      openConcerns: [],
      aiRecommendation: null,
      memberAgreementLevels: [],
      nextActions: [],
    };
    const summary = parseStructuredMeetingSummary(JSON.stringify(empty), {
      mode: "exploration",
    });

    expect(summary.issues).toEqual([]);
    expect(summary.nextActions).toEqual([]);
  });

  it("rejects a non-string aiRecommendation in exploration mode", () => {
    const malformed = { ...basePayload, aiRecommendation: 42 };

    expect(() =>
      parseStructuredMeetingSummary(JSON.stringify(malformed), {
        mode: "exploration",
      })
    ).toThrowError(
      expect.objectContaining({ code: "TYPE_MISMATCH" })
    );
  });
});

describe("stripJsonCodeFence", () => {
  it("strips only a complete fenced block", () => {
    expect(stripJsonCodeFence("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
    expect(stripJsonCodeFence("```\n{\"a\":1}\n```")).toBe('{"a":1}');
    expect(stripJsonCodeFence("前置き\n```json\n{\"a\":1}\n```")).toBe(
      "前置き\n```json\n{\"a\":1}\n```"
    );
  });
});

describe("validateStructuredMeetingSummary", () => {
  it("validates a parsed object as a pure function", () => {
    const summary = validateStructuredMeetingSummary(
      { ...basePayload, aiRecommendation: null },
      { mode: "収束" }
    );

    expect(summary.aiRecommendation).toBeNull();
    expect(summary.memberAgreementLevels[0].note).toBe("条件付き合意");
  });
});
