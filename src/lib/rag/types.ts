export interface KnowledgeDocument {
  id?: number;
  project_id: number;
  source_type: string;
  content: string;
  metadata?: Record<string, any>;
  vector?: number[];
}
