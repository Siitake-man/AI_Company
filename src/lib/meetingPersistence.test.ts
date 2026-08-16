import { describe, expect, it } from "vitest";
import {
  createMeeting,
  finalizeMeeting,
  insertMeetingUsageLog,
  type FinalizeMeetingPayload,
  type MeetingDatabase,
  type MeetingMessageDraft,
} from "./meetingPersistence";

function lastCall(calls: ExecCall[]): ExecCall {
  return calls[calls.length - 1];
}

type ExecCall = {
  query: string;
  values?: unknown[];
};

type ExecResult = { lastInsertId?: number | bigint; rowsAffected?: number };

type SelectImpl = (query: string, values?: unknown[]) => Promise<unknown>;

function createExecRecordingDb(
  executeImpl: (query: string, values?: unknown[]) => Promise<ExecResult>,
  selectImpl: SelectImpl = async () => []
) {
  const calls: ExecCall[] = [];
  const db: MeetingDatabase = {
    execute: async (query, values) => {
      calls.push({ query, values });
      return executeImpl(query, values);
    },
    select: async <T>(query: string, values?: unknown[]) => {
      calls.push({ query, values });
      return (await selectImpl(query, values)) as T;
    },
  };
  return { db, calls };
}

function payloadFor(
  overrides: Partial<FinalizeMeetingPayload> = {}
): FinalizeMeetingPayload {
  return {
    meetingId: 42,
    mode: "収束",
    participantMemberIds: [3, 5],
    messages: [
      {
        roundNumber: 1,
        memberId: 3,
        messageType: "通常発言",
        content: "最初の発言",
        interruptChainCount: 0,
        createdAt: "2026-08-16T01:00:00.000Z",
      },
    ],
    structuredSummary: {
      issues: ["契約更新の可否"],
      proConTable: [
        {
          issue: "契約更新の可否",
          member: "契約レビュー担当",
          stance: "条件付き賛成",
          pro: "撤退条項があれば許容可能",
          con: "文言の最終確認が必要",
        },
      ],
      facts: ["現行契約は12月末まで"],
      openConcerns: ["解約時の移行期間が未確定"],
      aiRecommendation: "撤退条項を追加した更新案を推奨",
      memberAgreementLevels: [{ member: "契約レビュー担当", level: 4 }],
      decisions: ["契約更新は撤退条項付きで承認", "次回会議で印鑑手続きを確認"],
      nextActions: [{ action: "契約書ドラフト作成", owner: "契約レビュー担当" }],
    },
    generatedAt: "2026-08-16T02:00:00.000Z",
    ...overrides,
  };
}

function successExec() {
  let summaryIdCounter = 0;
  return async (_query: string, _values?: unknown[]) => {
    if (_query.startsWith("INSERT INTO meeting_summaries")) {
      summaryIdCounter += 1;
      return { lastInsertId: 100 + summaryIdCounter };
    }
    return { lastInsertId: undefined };
  };
}

function findCallsByPattern(calls: ExecCall[], pattern: RegExp): ExecCall[] {
  return calls.filter((call) => pattern.test(call.query));
}

describe("meeting persistence contract", () => {
  it("creates the parent row before writing usage logs with the real id", async () => {
    const calls: Array<{ query: string; values?: unknown[] }> = [];
    const db: MeetingDatabase = {
      execute: async (query, values) => {
        calls.push({ query, values });
        return { lastInsertId: calls.length === 1 ? 42 : undefined };
      },
      select: async <T>() => [] as T,
    };

    const meetingId = await createMeeting(db, 7, "exploration", "2026-08-11T12:00:00.000Z");
    await insertMeetingUsageLog(db, {
      memberId: 3,
      meetingId,
      provider: "openai",
      modelId: "gpt-4o",
      promptTokens: 10,
      completionTokens: 20,
      costUsd: 0.01,
      createdAt: "2026-08-11T12:00:01.000Z",
    });

    expect(meetingId).toBe(42);
    expect(calls[0].query).toContain("INSERT INTO meetings");
    expect(calls[0].values?.[1]).toBe("探索");
    expect(calls[1].query).toContain("INSERT INTO api_usage_logs");
    expect(calls[1].values?.[1]).toBe(42);
    expect(calls[1].values?.[1]).not.toBe(999);
  });

  it("normalizes UI and existing Japanese meeting modes at both persistence boundaries", async () => {
    const modeCases = [
      ["exploration", "探索"],
      ["convergence", "収束"],
      ["探索", "探索"],
      ["収束", "収束"],
    ] as const;

    for (const [inputMode, expectedDbMode] of modeCases) {
      const createResult = createExecRecordingDb(async () => ({ lastInsertId: 42 }));
      await createMeeting(
        createResult.db,
        7,
        inputMode,
        "2026-08-11T12:00:00.000Z"
      );
      expect(createResult.calls[0].values?.[1]).toBe(expectedDbMode);

      const finalizeResult = createExecRecordingDb(successExec());
      await finalizeMeeting(finalizeResult.db, payloadFor({ mode: inputMode }));
      const summaryInsert = findCallsByPattern(
        finalizeResult.calls,
        /INSERT INTO meeting_summaries/
      );
      expect(summaryInsert).toHaveLength(1);
      expect(summaryInsert[0].values?.[1]).toBe(expectedDbMode);
    }
  });

  it("stops when SQLite does not return a meeting id", async () => {
    const db: MeetingDatabase = {
      execute: async () => ({ lastInsertId: 0 }),
      select: async <T>() => [] as T,
    };

    await expect(createMeeting(db, 7, "収束", "2026-08-11T12:00:00.000Z"))
      .rejects.toThrow("会議IDを取得できませんでした");
  });

  it("finalizes participants, messages, summary, learnings and meeting status atomically", async () => {
    const { db, calls } = createExecRecordingDb(successExec());

    const result = await finalizeMeeting(db, payloadFor());

    expect(result).toEqual({ summaryId: 101, learningCount: 4 });
    expect(calls[0].query).toBe(
      "SELECT id FROM meeting_summaries WHERE meeting_id = ? LIMIT 1"
    );
    expect(calls[1].query).toBe("BEGIN");
    expect(lastCall(calls).query).toBe("COMMIT");
    expect(calls[calls.length - 2].query).toBe(
      "UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?"
    );

    const participantInserts = findCallsByPattern(calls, /INSERT INTO meeting_participants/);
    expect(participantInserts).toHaveLength(2);
    expect(participantInserts[0].values).toEqual([42, 3]);
    expect(participantInserts[1].values).toEqual([42, 5]);

    const messageInserts = findCallsByPattern(calls, /INSERT INTO meeting_messages/);
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0].values?.[0]).toBe(42);
    expect(messageInserts[0].values?.[4]).toBe("最初の発言");

    const summaryInsert = findCallsByPattern(calls, /INSERT INTO meeting_summaries/);
    expect(summaryInsert).toHaveLength(1);
    expect(summaryInsert[0].values?.[0]).toBe(42);
    expect(JSON.parse(String(summaryInsert[0].values?.[8]))).toEqual([
      "契約更新は撤退条項付きで承認",
      "次回会議で印鑑手続きを確認",
    ]);

    const learningInserts = findCallsByPattern(calls, /INSERT INTO member_learnings/);
    expect(learningInserts).toHaveLength(4);
    expect(learningInserts[0].values).toEqual([
      3,
      42,
      "契約更新は撤退条項付きで承認",
      "2026-08-16T02:00:00.000Z",
    ]);
    expect(learningInserts[3].values).toEqual([
      5,
      42,
      "次回会議で印鑑手続きを確認",
      "2026-08-16T02:00:00.000Z",
    ]);

    const statusUpdate = findCallsByPattern(calls, /UPDATE meetings SET status/);
    expect(statusUpdate).toHaveLength(1);
    expect(statusUpdate[0].values).toEqual(["終了", "2026-08-16T02:00:00.000Z", 42]);
  });

  it("saves an empty decisions list as zero learnings", async () => {
    const payload = payloadFor({
      structuredSummary: {
        ...payloadFor().structuredSummary,
        decisions: [],
      },
    });
    const { db, calls } = createExecRecordingDb(successExec());

    const result = await finalizeMeeting(db, payload);

    expect(result.learningCount).toBe(0);
    expect(findCallsByPattern(calls, /INSERT INTO member_learnings/)).toHaveLength(0);
    expect(lastCall(calls).query).toBe("COMMIT");
  });

  it("writes learning rows once per confirmed decision per participant on multiple decisions", async () => {
    const payload = payloadFor({
      participantMemberIds: [1, 2, 3],
      structuredSummary: {
        ...payloadFor().structuredSummary,
        decisions: ["決定A", "決定B", "決定C"],
      },
    });
    const { db, calls } = createExecRecordingDb(successExec());

    const result = await finalizeMeeting(db, payload);

    expect(result.learningCount).toBe(9);
    expect(findCallsByPattern(calls, /INSERT INTO member_learnings/)).toHaveLength(9);
  });

  it("rejects a second finalize for the same meeting", async () => {
    const { db, calls } = createExecRecordingDb(async (query) => {
      return { lastInsertId: undefined };
    }, async (query) => {
      if (query.startsWith("SELECT id FROM meeting_summaries")) {
        return [{ id: 901 }];
      }
      return [];
    });

    await expect(finalizeMeeting(db, payloadFor())).rejects.toThrow(
      "会議ID 42 は既に確定済みです"
    );
    expect(calls[0].query).toBe(
      "SELECT id FROM meeting_summaries WHERE meeting_id = ? LIMIT 1"
    );
    expect(calls).toHaveLength(1);
    expect(calls.map((call) => call.query)).not.toContain("BEGIN");
    expect(calls.map((call) => call.query)).not.toContain("ROLLBACK");
    expect(calls.map((call) => call.query)).not.toContain("COMMIT");
  });

  it.each([
    ["participants", /INSERT INTO meeting_participants/],
    ["messages", /INSERT INTO meeting_messages/],
    ["summary", /INSERT INTO meeting_summaries/],
    ["learnings", /INSERT INTO member_learnings/],
    ["meeting status", /UPDATE meetings SET status/],
  ])("rolls back after a %s write failure", async (_label, failurePattern) => {
    const { db, calls } = createExecRecordingDb(async (query) => {
      if (failurePattern.test(query)) {
        throw new Error(`write failed: ${query}`);
      }
      if (query.startsWith("INSERT INTO meeting_summaries")) {
        return { lastInsertId: 100 };
      }
      return { lastInsertId: undefined };
    });

    await expect(finalizeMeeting(db, payloadFor())).rejects.toThrow(
      /write failed/
    );

    expect(calls[0].query).toBe(
      "SELECT id FROM meeting_summaries WHERE meeting_id = ? LIMIT 1"
    );
    expect(calls[1].query).toBe("BEGIN");
    expect(calls.map((call) => call.query)).toContain("ROLLBACK");
    expect(calls.map((call) => call.query)).not.toContain("COMMIT");
  });
});
