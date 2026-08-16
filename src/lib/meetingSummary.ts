/**
 * 構造化議事録の契約と検証
 *
 * LLM出力は issues / proConTable / facts / openConcerns / aiRecommendation /
 * memberAgreementLevels / nextActions の7キーのみを受理する。
 * decisions は型にもLLM出力にも含めず、原則4（結論はユーザーが出す）を保証する。
 */

export type MeetingSummaryMode = "exploration" | "convergence" | "探索" | "収束";

export interface ProConRow {
  issue?: string;
  member: string;
  stance: string;
  pro: string;
  con: string;
}

export interface MemberAgreementLevel {
  member: string;
  level: number;
  note?: string;
}

export interface NextAction {
  action: string;
  owner?: string;
  due?: string;
}

export interface StructuredMeetingSummary {
  issues: string[];
  proConTable: ProConRow[];
  facts: string[];
  openConcerns: string[];
  aiRecommendation: string | null;
  memberAgreementLevels: MemberAgreementLevel[];
  nextActions: NextAction[];
}

export interface MeetingReviewDraft {
  meetingId: number;
  mode: MeetingSummaryMode;
  summary: StructuredMeetingSummary;
  generatedAt: string;
}

export type SummaryValidationErrorCode =
  | "INVALID_JSON"
  | "NOT_OBJECT"
  | "UNEXPECTED_KEY"
  | "MISSING_FIELD"
  | "TYPE_MISMATCH";

export class MeetingSummaryParseError extends Error {
  readonly code: SummaryValidationErrorCode;

  constructor(code: SummaryValidationErrorCode, message: string) {
    super(message);
    this.name = "MeetingSummaryParseError";
    this.code = code;
  }
}

const REQUIRED_LLM_KEYS = [
  "issues",
  "proConTable",
  "facts",
  "openConcerns",
  "aiRecommendation",
  "memberAgreementLevels",
  "nextActions",
] as const;

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isExplorationMode(mode?: string): boolean {
  return mode === "exploration" || mode === "探索";
}

/**
 * ```json フェンス（``` のみも可）を安全に除去する。
 * フェンスの外に本文や注釈がある場合は除去せず、後段のJSONパースで失敗させる。
 */
export function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : trimmed;
}

function requireStringField(
  row: Record<string, unknown>,
  fieldName: string,
  path: string
): string {
  const value = row[fieldName];
  if (typeof value !== "string") {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      `${path}.${fieldName} は文字列である必要があります`
    );
  }
  return value;
}

function validateStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      `${path} は文字列の配列である必要があります`
    );
  }
  return value as string[];
}

function validateProConTable(value: unknown): ProConRow[] {
  if (!Array.isArray(value)) {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      "proConTable は配列である必要があります"
    );
  }
  return value.map((row, index) => {
    const path = `proConTable[${index}]`;
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new MeetingSummaryParseError(
        "TYPE_MISMATCH",
        `${path} はオブジェクトである必要があります`
      );
    }
    const record = row as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) => !["issue", "member", "stance", "pro", "con"].includes(key)
    );
    if (unknownKeys.length > 0) {
      throw new MeetingSummaryParseError(
        "UNEXPECTED_KEY",
        `${path} に許可外のキーが含まれています: ${unknownKeys.join(", ")}`
      );
    }
    const result: ProConRow = {
      member: requireStringField(record, "member", path),
      stance: requireStringField(record, "stance", path),
      pro: requireStringField(record, "pro", path),
      con: requireStringField(record, "con", path),
    };
    if (hasOwn(record, "issue")) {
      result.issue = requireStringField(record, "issue", path);
    }
    return result;
  });
}

function validateAgreementLevels(value: unknown): MemberAgreementLevel[] {
  if (!Array.isArray(value)) {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      "memberAgreementLevels は配列である必要があります"
    );
  }
  return value.map((row, index) => {
    const path = `memberAgreementLevels[${index}]`;
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new MeetingSummaryParseError(
        "TYPE_MISMATCH",
        `${path} はオブジェクトである必要があります`
      );
    }
    const record = row as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) => !["member", "level", "note"].includes(key)
    );
    if (unknownKeys.length > 0) {
      throw new MeetingSummaryParseError(
        "UNEXPECTED_KEY",
        `${path} に許可外のキーが含まれています: ${unknownKeys.join(", ")}`
      );
    }
    if (typeof record.level !== "number" || !Number.isFinite(record.level)) {
      throw new MeetingSummaryParseError(
        "TYPE_MISMATCH",
        `${path}.level は有限な数値である必要があります`
      );
    }
    const result: MemberAgreementLevel = {
      member: requireStringField(record, "member", path),
      level: record.level,
    };
    if (hasOwn(record, "note")) {
      result.note = requireStringField(record, "note", path);
    }
    return result;
  });
}

function validateNextActions(value: unknown): NextAction[] {
  if (!Array.isArray(value)) {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      "nextActions は配列である必要があります"
    );
  }
  return value.map((row, index) => {
    const path = `nextActions[${index}]`;
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new MeetingSummaryParseError(
        "TYPE_MISMATCH",
        `${path} はオブジェクトである必要があります`
      );
    }
    const record = row as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) => !["action", "owner", "due"].includes(key)
    );
    if (unknownKeys.length > 0) {
      throw new MeetingSummaryParseError(
        "UNEXPECTED_KEY",
        `${path} に許可外のキーが含まれています: ${unknownKeys.join(", ")}`
      );
    }
    const result: NextAction = {
      action: requireStringField(record, "action", path),
    };
    if (hasOwn(record, "owner")) {
      result.owner = requireStringField(record, "owner", path);
    }
    if (hasOwn(record, "due")) {
      result.due = requireStringField(record, "due", path);
    }
    return result;
  });
}

function validateAiRecommendation(value: unknown, exploration: boolean): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      "aiRecommendation は文字列または null である必要があります"
    );
  }
  if (exploration) {
    throw new MeetingSummaryParseError(
      "TYPE_MISMATCH",
      "探索モードでは aiRecommendation は null である必要があります"
    );
  }
  return value;
}

export function validateStructuredMeetingSummary(
  value: unknown,
  options?: { mode?: string }
): StructuredMeetingSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MeetingSummaryParseError(
      "NOT_OBJECT",
      "議事録JSONはオブジェクトである必要があります"
    );
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !(REQUIRED_LLM_KEYS as readonly string[]).includes(key)
  );
  if (unknownKeys.length > 0) {
    throw new MeetingSummaryParseError(
      "UNEXPECTED_KEY",
      `議事録JSONに許可外のキーが含まれています: ${unknownKeys.join(", ")}`
    );
  }
  for (const key of REQUIRED_LLM_KEYS) {
    if (!hasOwn(record, key)) {
      throw new MeetingSummaryParseError(
        "MISSING_FIELD",
        `議事録JSONに必須キーがありません: ${key}`
      );
    }
  }
  const exploration = isExplorationMode(options?.mode);
  return {
    issues: validateStringArray(record.issues, "issues"),
    proConTable: validateProConTable(record.proConTable),
    facts: validateStringArray(record.facts, "facts"),
    openConcerns: validateStringArray(record.openConcerns, "openConcerns"),
    aiRecommendation: validateAiRecommendation(record.aiRecommendation, exploration),
    memberAgreementLevels: validateAgreementLevels(record.memberAgreementLevels),
    nextActions: validateNextActions(record.nextActions),
  };
}

/**
 * 生のLLM出力を構造化議事録へ変換する純粋関数。
 * Markdown全文・不正JSON・型不一致・decisions等の余計なキーはエラーにする。
 */
export function parseStructuredMeetingSummary(
  raw: string,
  options?: { mode?: string }
): StructuredMeetingSummary {
  if (typeof raw !== "string") {
    throw new MeetingSummaryParseError(
      "INVALID_JSON",
      "入力は文字列である必要があります"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCodeFence(raw));
  } catch {
    throw new MeetingSummaryParseError(
      "INVALID_JSON",
      "議事録JSONをパースできませんでした。Markdown全文や不正JSONは受理しません"
    );
  }
  return validateStructuredMeetingSummary(parsed, options);
}
