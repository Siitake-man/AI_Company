import {
  KnowledgeDocument,
  KnowledgeSource,
} from "./types";

export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 200;

export interface ChunkOptions {
  /** Maximum number of UTF-16 code units per chunk. */
  maxCharacters?: number;
  /** Number of trailing characters repeated in the next chunk. */
  overlapCharacters?: number;
}

function assertOptions(maxCharacters: number, overlapCharacters: number): void {
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
    throw new Error("maxCharacters must be a positive integer");
  }
  if (
    !Number.isInteger(overlapCharacters) ||
    overlapCharacters < 0 ||
    overlapCharacters >= maxCharacters
  ) {
    throw new Error(
      "overlapCharacters must be an integer from 0 to maxCharacters - 1",
    );
  }
}

/**
 * Split text deterministically while preserving a small overlap for context.
 * Empty/whitespace-only input returns no chunks.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): string[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_CHUNK_SIZE;
  const overlapCharacters =
    options.overlapCharacters ??
    Math.min(DEFAULT_CHUNK_OVERLAP, Math.max(0, maxCharacters - 1));
  assertOptions(maxCharacters, overlapCharacters);

  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxCharacters) return [normalized];

  const chunks: string[] = [];
  const step = maxCharacters - overlapCharacters;
  for (let start = 0; start < normalized.length; start += step) {
    const chunk = normalized.slice(start, start + maxCharacters).trim();
    if (chunk) chunks.push(chunk);
    if (start + maxCharacters >= normalized.length) break;
  }
  return chunks;
}

/** Convert one SQLite/RAG source row into stable, store-ready chunks. */
export function buildKnowledgeDocuments(
  source: KnowledgeSource,
  options?: ChunkOptions,
): KnowledgeDocument[] {
  const chunks = chunkText(source.content, options);
  return chunks.map((content, chunkIndex) => ({
    id: `${source.source_type}:${source.source_id}:${chunkIndex}`,
    project_id: source.project_id,
    source_type: source.source_type,
    content,
    metadata: {
      created_at: source.created_at,
      source_id: source.source_id,
      member_id: source.member_id,
      department_id: source.department_id,
      role_category: source.role_category,
      chunk_index: chunkIndex,
      chunk_count: chunks.length,
    },
  }));
}
