import {
  buildKnowledgeDocuments,
  ChunkOptions,
} from "./chunker";
import {
  KnowledgeDocument,
  KnowledgeRoleCategory,
  KnowledgeSource,
} from "./types";

export interface RagDatabase {
  select<T>(query: string, bindings?: unknown[]): Promise<T[]>;
}

interface MeetingSummaryRow {
  source_id: number;
  project_id: number;
  mode: string;
  issues: string | null;
  decisions: string | null;
  next_actions: string | null;
  created_at: string;
}

interface MemberLearningRow {
  source_id: number;
  project_id: number;
  member_id: number;
  department_id: number;
  department_name: string;
  role: string | null;
  content: string;
  created_at: string;
}

function inferRoleCategory(
  departmentName: string,
  role: string | null,
): KnowledgeRoleCategory {
  const text = `${departmentName} ${role ?? ""}`.toLowerCase();
  if (text.includes("法務") || text.includes("legal") || text.includes("コンプライアンス")) {
    return "legal";
  }
  if (text.includes("エンジニア") || text.includes("engineering") || text.includes("技術") || text.includes("security")) {
    return "engineering";
  }
  if (text.includes("マーケティング") || text.includes("marketing") || text.includes("sns")) {
    return "marketing";
  }
  if (text.includes("戦略") || text.includes("経営") || text.includes("strategy") || text.includes("pm")) {
    return "strategy";
  }
  if (text.includes("思考スタイル") || text.includes("dreamer") || text.includes("代弁者")) {
    return "thinking_style";
  }
  return "other";
}

function joinNonEmpty(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/** Load project-scoped RAG sources from the existing SQLite schema. */
export async function loadKnowledgeSources(
  db: RagDatabase,
  projectId: number,
  limit = 100,
): Promise<KnowledgeSource[]> {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("projectId must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }

  const [summaries, learnings] = await Promise.all([
    db.select<MeetingSummaryRow>(
      `SELECT
         s.id AS source_id,
         m.project_id,
         s.mode,
         s.issues,
         s.decisions,
         s.next_actions,
         s.created_at
       FROM meeting_summaries s
       JOIN meetings m ON m.id = s.meeting_id
       WHERE m.project_id = ?
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [projectId, limit],
    ),
    db.select<MemberLearningRow>(
      `SELECT
         l.id AS source_id,
         d.project_id,
         l.member_id,
         m.department_id,
         d.name AS department_name,
         m.role,
         l.content,
         l.created_at
       FROM member_learnings l
       JOIN members m ON m.id = l.member_id
       JOIN departments d ON d.id = m.department_id
       WHERE d.project_id = ?
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [projectId, limit],
    ),
  ]);

  const summarySources: KnowledgeSource[] = summaries
    .map((row) => ({
      project_id: row.project_id,
      source_type: "meeting_summary" as const,
      source_id: row.source_id,
      content: joinNonEmpty([
        `会議モード: ${row.mode}`,
        row.issues,
        row.decisions,
        row.next_actions,
      ]),
      created_at: row.created_at,
    }))
    .filter((source) => source.content.length > 0);

  const learningSources: KnowledgeSource[] = learnings
    .map((row) => ({
      project_id: row.project_id,
      source_type: "member_learning" as const,
      source_id: row.source_id,
      content: row.content,
      created_at: row.created_at,
      member_id: row.member_id,
      department_id: row.department_id,
      role_category: inferRoleCategory(row.department_name, row.role),
    }))
    .filter((source) => source.content.trim().length > 0);

  return [...summarySources, ...learningSources].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export async function loadKnowledgeDocuments(
  db: RagDatabase,
  projectId: number,
  chunkOptions?: ChunkOptions,
  limit = 100,
): Promise<KnowledgeDocument[]> {
  const sources = await loadKnowledgeSources(db, projectId, limit);
  return sources.flatMap((source) =>
    buildKnowledgeDocuments(source, chunkOptions),
  );
}
