// Pure shared content-edit validation module.
// Importable from both React Native (client) and Deno (Edge Function).
// No I/O, no RN/Node-only imports.
import type { EditableTable, ContentEditRequest } from './index';

export const EDITABLE_FIELDS_BY_TABLE: Record<EditableTable, readonly string[]> = {
  lemmas:        ['gloss_en', 'target', 'usage_note', 'literal_gloss'],
  phrases:       ['gloss_en', 'target', 'usage_note', 'literal_gloss'],
  minimal_pairs: [], // only qa_status is editable
};

export const QA_ORDER = ['draft', 'native_ok', 'locked'] as const;

// Columns that are NOT NULL in the schema — reject empty strings for these.
const NOT_NULL_FIELDS = new Set<string>(['gloss_en', 'target']);

// UUID v4/v5 regex (standard 8-4-4-4-12 hex, case-insensitive)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and sanitizes a ContentEditRequest.
 * Returns { table, id, patch } where patch is a plain Record<string,string>
 * containing only whitelisted columns and/or qa_status.
 * Throws a descriptive Error on any validation failure.
 */
export function validateContentEdit(req: ContentEditRequest): {
  table: EditableTable;
  id: string;
  patch: Record<string, string>;
} {
  // 1. Table — single source of truth: EDITABLE_FIELDS_BY_TABLE
  if (!(req.table in EDITABLE_FIELDS_BY_TABLE)) {
    throw new Error(`validateContentEdit: unknown table "${String(req.table)}"`);
  }

  // 2. ID must be a UUID
  if (!UUID_RE.test(req.id)) {
    throw new Error(`validateContentEdit: id must be a UUID, got "${req.id}"`);
  }

  // 3. qa_status (if provided)
  if (req.qa_status !== undefined) {
    if (!(QA_ORDER as ReadonlyArray<string>).includes(req.qa_status)) {
      throw new Error(
        `validateContentEdit: bad qa_status "${String(req.qa_status)}" — must be one of ${QA_ORDER.join(', ')}`,
      );
    }
  }

  // 4. Fields
  const whitelist = EDITABLE_FIELDS_BY_TABLE[req.table];
  const patch: Record<string, string> = {};

  if (req.fields != null) {
    const fieldEntries = Object.entries(req.fields as Record<string, unknown>);
    for (const [col, val] of fieldEntries) {
      // Unknown or forbidden column
      if (!whitelist.includes(col)) {
        throw new Error(
          `validateContentEdit: column "${col}" is not editable on table "${req.table}"`,
        );
      }
      if (val === undefined) continue;
      // Reject non-string values (null, number, boolean, …) — security boundary
      if (typeof val !== 'string') {
        throw new Error(
          `validateContentEdit: value for "${col}" must be a string, got ${typeof val}`,
        );
      }
      // NOT NULL columns reject empty strings
      if (NOT_NULL_FIELDS.has(col) && val === '') {
        throw new Error(
          `validateContentEdit: "${col}" cannot be empty (NOT NULL in schema)`,
        );
      }
      patch[col] = val;
    }
  }

  if (req.qa_status !== undefined) {
    patch['qa_status'] = req.qa_status;
  }

  // 5. Patch must not be empty
  if (Object.keys(patch).length === 0) {
    throw new Error('validateContentEdit: patch is empty — provide at least one field or qa_status');
  }

  return { table: req.table, id: req.id, patch };
}
