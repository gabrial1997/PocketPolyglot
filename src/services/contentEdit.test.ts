// Tests for the pure shared content-edit validation module.
// No I/O — pure unit tests. All edge cases from the brief.
import { validateContentEdit, EDITABLE_FIELDS_BY_TABLE, QA_ORDER } from './contentEdit';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// --- EDITABLE_FIELDS_BY_TABLE and QA_ORDER shape ---

it('EDITABLE_FIELDS_BY_TABLE has correct whitelists for each table', () => {
  expect(EDITABLE_FIELDS_BY_TABLE.lemmas).toEqual(['gloss_en', 'target', 'usage_note', 'literal_gloss']);
  expect(EDITABLE_FIELDS_BY_TABLE.phrases).toEqual(['gloss_en', 'target', 'usage_note', 'literal_gloss']);
  expect(EDITABLE_FIELDS_BY_TABLE.minimal_pairs).toEqual([]);
});

it('QA_ORDER is ordered draft→native_ok→locked', () => {
  expect(QA_ORDER).toEqual(['draft', 'native_ok', 'locked']);
});

// --- Valid cases ---

it('valid lemma gloss_en edit → patch contains only gloss_en', () => {
  const result = validateContentEdit({
    table: 'lemmas',
    id: VALID_UUID,
    fields: { gloss_en: 'hello' },
  });
  expect(result.table).toBe('lemmas');
  expect(result.id).toBe(VALID_UUID);
  expect(result.patch).toEqual({ gloss_en: 'hello' });
});

it('valid lemma edit with qa_status → patch includes both field and qa_status', () => {
  const result = validateContentEdit({
    table: 'lemmas',
    id: VALID_UUID,
    fields: { target: 'labdien' },
    qa_status: 'native_ok',
  });
  expect(result.patch).toEqual({ target: 'labdien', qa_status: 'native_ok' });
});

it('qa_status-only edit on minimal_pairs → valid (qa_status is the only edit path)', () => {
  const result = validateContentEdit({
    table: 'minimal_pairs',
    id: VALID_UUID,
    qa_status: 'locked',
  });
  expect(result.table).toBe('minimal_pairs');
  expect(result.patch).toEqual({ qa_status: 'locked' });
});

it('empty usage_note → allowed (nullable column)', () => {
  const result = validateContentEdit({
    table: 'lemmas',
    id: VALID_UUID,
    fields: { usage_note: '' },
  });
  expect(result.patch).toEqual({ usage_note: '' });
});

it('empty literal_gloss → allowed (nullable column)', () => {
  const result = validateContentEdit({
    table: 'phrases',
    id: VALID_UUID,
    fields: { literal_gloss: '' },
  });
  expect(result.patch).toEqual({ literal_gloss: '' });
});

// --- Rejection cases ---

it('unknown table → throws', () => {
  expect(() =>
    validateContentEdit({ table: 'unknown_table' as never, id: VALID_UUID, fields: { gloss_en: 'hi' } }),
  ).toThrow();
});

it('minimal_pairs field edit (e.g. gloss_en) → throws (no editable fields)', () => {
  expect(() =>
    validateContentEdit({
      table: 'minimal_pairs',
      id: VALID_UUID,
      fields: { gloss_en: 'hi' },
    }),
  ).toThrow();
});

it('unknown/forbidden column on lemmas → throws', () => {
  expect(() =>
    validateContentEdit({
      table: 'lemmas',
      id: VALID_UUID,
      fields: { notes_internal: 'secret' } as never,
    }),
  ).toThrow();
});

it('bad qa_status value → throws', () => {
  expect(() =>
    validateContentEdit({ table: 'lemmas', id: VALID_UUID, qa_status: 'published' as never }),
  ).toThrow();
});

it('non-uuid id → throws', () => {
  expect(() =>
    validateContentEdit({ table: 'lemmas', id: 'not-a-uuid', fields: { gloss_en: 'hi' } }),
  ).toThrow();
});

it('empty patch (no fields, no qa_status) → throws', () => {
  expect(() =>
    validateContentEdit({ table: 'lemmas', id: VALID_UUID }),
  ).toThrow();
});

it('empty patch (empty fields object, no qa_status) → throws', () => {
  expect(() =>
    validateContentEdit({ table: 'lemmas', id: VALID_UUID, fields: {} }),
  ).toThrow();
});

it('empty string for gloss_en on lemmas → throws (NOT NULL violation)', () => {
  expect(() =>
    validateContentEdit({ table: 'lemmas', id: VALID_UUID, fields: { gloss_en: '' } }),
  ).toThrow();
});

it('empty string for target on phrases → throws (NOT NULL violation)', () => {
  expect(() =>
    validateContentEdit({ table: 'phrases', id: VALID_UUID, fields: { target: '' } }),
  ).toThrow();
});

it('empty string for gloss_en on phrases → throws (NOT NULL violation)', () => {
  expect(() =>
    validateContentEdit({ table: 'phrases', id: VALID_UUID, fields: { gloss_en: '' } }),
  ).toThrow();
});
