export type MeetingDatabase = {
  execute: (query: string, bindValues?: unknown[]) => Promise<{ lastInsertId?: number | bigint }>;
};

export type MeetingModeValue = "exploration" | "convergence" | "探索" | "収束";

/**
 * Create the parent meeting row before any child row is written.
 * SQLite V3 requires every usage/message/summary row to reference this id.
 */
export async function createMeeting(
  db: MeetingDatabase,
  projectId: number,
  mode: MeetingModeValue,
  startedAt: string
): Promise<number> {
  const result = await db.execute(
    "INSERT INTO meetings (project_id, mode, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)",
    [projectId, mode, "進行中", startedAt, null]
  );
  const meetingId = Number(result.lastInsertId ?? 0);
  if (!meetingId) {
    throw new Error("会議IDを取得できませんでした");
  }
  return meetingId;
}

export async function closeMeeting(
  db: MeetingDatabase,
  meetingId: number,
  endedAt: string
): Promise<void> {
  await db.execute(
    "UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?",
    ["終了", endedAt, meetingId]
  );
}

export async function insertMeetingUsageLog(
  db: MeetingDatabase,
  params: {
    memberId: number;
    meetingId: number;
    provider: string | null;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    createdAt: string;
  }
): Promise<void> {
  await db.execute(
    "INSERT INTO api_usage_logs (member_id, meeting_id, provider, model_id, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      params.memberId,
      params.meetingId,
      params.provider,
      params.modelId,
      params.promptTokens,
      params.completionTokens,
      params.costUsd,
      params.createdAt,
    ]
  );
}
