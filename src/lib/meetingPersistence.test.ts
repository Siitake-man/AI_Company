import { describe, expect, it } from "vitest";
import { createMeeting, insertMeetingUsageLog, type MeetingDatabase } from "./meetingPersistence";

describe("meeting persistence contract", () => {
  it("creates the parent row before writing usage logs with the real id", async () => {
    const calls: Array<{ query: string; values?: unknown[] }> = [];
    const db: MeetingDatabase = {
      execute: async (query, values) => {
        calls.push({ query, values });
        return { lastInsertId: calls.length === 1 ? 42 : undefined };
      },
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
    expect(calls[1].query).toContain("INSERT INTO api_usage_logs");
    expect(calls[1].values?.[1]).toBe(42);
    expect(calls[1].values?.[1]).not.toBe(999);
  });

  it("stops when SQLite does not return a meeting id", async () => {
    const db: MeetingDatabase = {
      execute: async () => ({ lastInsertId: 0 }),
    };

    await expect(createMeeting(db, 7, "収束", "2026-08-11T12:00:00.000Z"))
      .rejects.toThrow("会議IDを取得できませんでした");
  });
});
