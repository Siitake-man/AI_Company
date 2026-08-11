export type KnowledgeSourceType =
  | "meeting_summary"
  | "user_note"
  | "member_learning";

export type KnowledgeRoleCategory =
  | "strategy"
  | "engineering"
  | "legal"
  | "marketing"
  | "thinking_style"
  | "other";

export interface KnowledgeMetadata {
  created_at: string;
  source_id: number;
  member_id?: number;
  department_id?: number;
  role_category?: KnowledgeRoleCategory;
  chunk_index: number;
  chunk_count: number;
}

export interface KnowledgeDocument {
  /** Stable document/chunk identifier supplied by the vector-store adapter. */
  id: string;
  project_id: number;
  source_type: KnowledgeSourceType;
  content: string;
  metadata: KnowledgeMetadata;
  /** Optional embedding populated by the selected embedding provider. */
  vector?: number[];
}

export interface KnowledgeSource {
  project_id: number;
  source_type: KnowledgeSourceType;
  source_id: number;
  content: string;
  created_at: string;
  member_id?: number;
  department_id?: number;
  role_category?: KnowledgeRoleCategory;
}
