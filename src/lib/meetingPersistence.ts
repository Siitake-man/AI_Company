export type MeetingDatabase = {
  execute: (
    query: string,
    bindValues?: unknown[]
  ) => Promise<{ lastInsertId?: number | bigint; rowsAffected?: number }>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T>;
};

export type MeetingModeUiValue = "exploration" | "convergence";
export type MeetingModeDbValue = "探索" | "収束";
/** Values accepted at the persistence boundary from either UI or existing DB-facing callers. */
export type MeetingModeValue = MeetingModeUiValue | MeetingModeDbValue;

/** Convert UI/legacy values to the canonical Japanese values used by SQLite. */
export function normalizeMeetingMode(mode: MeetingModeValue): MeetingModeDbValue {
  switch (mode) {
    case "exploration":
    case "探索":
      return "探索";
    case "convergence":
    case "収束":
      return "収束";
    default: {
      // Keep the runtime boundary fail-closed for untyped JavaScript callers.
      throw new Error(`未対応の会議モードです: ${String(mode)}`);
    }
  }
}

export type MeetingMessageDraft = {
  roundNumber?: number | null;
  memberId?: number | null;
  messageType: string;
  content: string;
  interruptChainCount?: number;
  createdAt: string;
};

export type FinalizeMeetingPayload = {
  meetingId: number;
  mode: MeetingModeValue;
  participantMemberIds: number[];
  messages: MeetingMessageDraft[];
  structuredSummary: {
    issues: string[];
    proConTable: unknown[];
    facts: string[];
    openConcerns: string[];
    aiRecommendation: string | null;
    memberAgreementLevels: unknown[];
    decisions: string[];
    nextActions: unknown[];
  };
  generatedAt: string;
};

type RustFinalizeMeetingResponse = {
  summaryId: number;
  learningCount: number;
};

type RustCreateMeetingResponse = { meetingId: number };

export async function createMeetingViaRust(
  projectId: number,
  mode: MeetingModeValue,
  startedAt: string,
): Promise<number> {
  const result = await invoke<RustCreateMeetingResponse>("create_meeting", {
    request: { projectId, mode, startedAt },
  });
  if (!Number.isInteger(result.meetingId) || result.meetingId <= 0) {
    throw new Error("会議IDを取得できませんでした");
  }
  return result.meetingId;
}

export async function closeMeetingViaRust(meetingId: number, endedAt: string): Promise<void> {
  await invoke("close_meeting", { request: { meetingId, endedAt } });
}

export async function insertMeetingUsageLogViaRust(params: {
  memberId: number;
  meetingId: number;
  provider: string | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  createdAt: string;
}): Promise<void> {
  await invoke("insert_meeting_usage_log", {
    request: {
      memberId: params.memberId,
      meetingId: params.meetingId,
      provider: params.provider,
      modelId: params.modelId,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costUsd: params.costUsd,
      createdAt: params.createdAt,
    },
  });
}

export async function updateProjectViaRust(params: {
  projectId: number;
  purpose: string;
  values: string;
  updatedAt: string;
}): Promise<void> {
  await invoke("update_project", { request: params });
}

export async function updateSummaryModelViaRust(modelId: string, updatedAt: string): Promise<void> {
  await invoke("update_summary_model", { request: { modelId, updatedAt } });
}

export async function bulkUpdateMemberModelsViaRust(modelId: string): Promise<number> {
  return invoke<number>("bulk_update_member_models", { request: { modelId } });
}

export async function updateMemberViaRust(params: {
  memberId: number;
  name: string;
  role: string;
  personalityPrompt: string;
  aiModel: string;
  updatedAt: string;
}): Promise<void> {
  await invoke("update_member", { request: params });
}

export async function resetMemberUsageViaRust(memberId: number): Promise<number> {
  return invoke<number>("reset_member_usage", { request: { memberId } });
}

/**
 * S8の本番経路。任意SQLをfrontendから渡さず、Rustの固定SQLコマンドへ委譲する。
 * 既存の `finalizeMeeting` はDB契約テストと移行期間の互換用に残す。
 */
export async function finalizeMeetingViaRust(
  payload: FinalizeMeetingPayload,
): Promise<{ summaryId: number; learningCount: number }> {
  const result = await invoke<RustFinalizeMeetingResponse>("finalize_meeting", {
    request: payload,
  });
  if (!Number.isInteger(result.summaryId) || result.summaryId <= 0 || !Number.isInteger(result.learningCount) || result.learningCount < 0) {
    throw new Error("確定保存の応答形式が不正です");
  }
  return result;
}

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
  const dbMode = normalizeMeetingMode(mode);
  const result = await db.execute(
    "INSERT INTO meetings (project_id, mode, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)",
    [projectId, dbMode, "進行中", startedAt, null]
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

function assertMeetingIdOrThrow(meetingId: number | bigint | null | undefined): number {
  const id = Number(meetingId ?? 0);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("meeting_summaries への保存に必要な会議IDを取得できませんでした");
  }
  return id;
}

/**
 * ユーザー確認済みの会議データだけを単一トランザクションで保存する。
 * いずれかの段階が失敗した場合はROLLBACKし、部分保存を残さない。
 */
export async function finalizeMeeting(
  db: MeetingDatabase,
  payload: FinalizeMeetingPayload
): Promise<{ summaryId: number; learningCount: number }> {
  const { meetingId, mode, participantMemberIds, messages, structuredSummary, generatedAt } = payload;
  const dbMode = normalizeMeetingMode(mode);

  const existingRows = await db.select<Array<{ id: number }>>(
    "SELECT id FROM meeting_summaries WHERE meeting_id = ? LIMIT 1",
    [meetingId]
  );
  if (existingRows.length > 0) {
    throw new Error(`会議ID ${meetingId} は既に確定済みです`);
  }

  await db.execute("BEGIN");
  try {
    for (const memberId of participantMemberIds) {
      await db.execute(
        "INSERT INTO meeting_participants (meeting_id, member_id) VALUES (?, ?)",
        [meetingId, memberId]
      );
    }

    for (const message of messages) {
      await db.execute(
        "INSERT INTO meeting_messages (meeting_id, round_number, member_id, message_type, content, interrupt_chain_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          meetingId,
          message.roundNumber ?? null,
          message.memberId ?? null,
          message.messageType,
          message.content,
          message.interruptChainCount ?? 0,
          message.createdAt,
        ]
      );
    }

    const summaryResult = await db.execute(
      "INSERT INTO meeting_summaries (meeting_id, mode, issues, pro_con_table, facts, open_concerns, ai_recommendation, member_agreement_levels, decisions, next_actions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        meetingId,
        dbMode,
        JSON.stringify(structuredSummary.issues),
        JSON.stringify(structuredSummary.proConTable),
        JSON.stringify(structuredSummary.facts),
        JSON.stringify(structuredSummary.openConcerns),
        structuredSummary.aiRecommendation,
        JSON.stringify(structuredSummary.memberAgreementLevels),
        JSON.stringify(structuredSummary.decisions),
        JSON.stringify(structuredSummary.nextActions),
        generatedAt,
        generatedAt,
      ]
    );
    const summaryId = assertMeetingIdOrThrow(summaryResult.lastInsertId);

    let learningCount = 0;
    for (const decision of structuredSummary.decisions) {
      for (const memberId of participantMemberIds) {
        await db.execute(
          "INSERT INTO member_learnings (member_id, meeting_id, content, created_at) VALUES (?, ?, ?, ?)",
          [memberId, meetingId, decision, generatedAt]
        );
        learningCount += 1;
      }
    }

    await db.execute(
      "UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?",
      ["終了", generatedAt, meetingId]
    );
    await db.execute("COMMIT");

    return { summaryId, learningCount };
  } catch (error) {
    try {
      await db.execute("ROLLBACK");
    } catch {
      // 元の失敗を優先して伝播する。
    }
    throw error;
  }
}
import { invoke } from "@tauri-apps/api/core";
