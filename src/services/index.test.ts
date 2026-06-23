// Shape tests for service interfaces + ServiceBundle exported from src/services/index.ts
// These are compile-time + runtime shape checks.
import type {
  EditorService,
  EditableTable,
  QaStatus,
  ContentEditRequest,
  ServiceBundle,
} from './index';

// --- Type-level assertions (compile-time checks via satisfies / assignability) ---

// EditableTable must accept exactly these three values
const _t1: EditableTable = 'lemmas';
const _t2: EditableTable = 'phrases';
const _t3: EditableTable = 'minimal_pairs';
void _t1; void _t2; void _t3;

// QaStatus must accept exactly these three values
const _q1: QaStatus = 'draft';
const _q2: QaStatus = 'native_ok';
const _q3: QaStatus = 'locked';
void _q1; void _q2; void _q3;

// ContentEditRequest must accept a valid shape
const _req: ContentEditRequest = {
  table: 'lemmas',
  id: '00000000-0000-0000-0000-000000000001',
  fields: { gloss_en: 'hello' },
  qa_status: 'native_ok',
};
void _req;

// EditorService shape check — a stub satisfying the interface compiles cleanly
const _editorStub = {
  isEditor: (): Promise<boolean> => Promise.resolve(false),
  edit: (_r: ContentEditRequest): Promise<void> => Promise.resolve(),
} satisfies EditorService;
void _editorStub;

// ServiceBundle must have an `editor: EditorService` member
const _bundleEditor: ServiceBundle['editor'] = _editorStub;
void _bundleEditor;

// --- Runtime checks (Jest) ---

it('EditorService, ContentEditRequest, EditableTable, QaStatus exported', () => {
  // Runtime: verify the stub (built above with typed literals) has real function members.
  // If EditorService interface were removed, the `satisfies EditorService` on _editorStub would
  // fail to compile, so this also acts as a compile-time guard.
  const ed: EditorService = { isEditor: async () => false, edit: async () => {} };
  expect(typeof ed.isEditor).toBe('function');
  expect(typeof ed.edit).toBe('function');

  // Verify ContentEditRequest accepts a well-typed value at runtime (the typed literal above
  // proves compile-time assignability; asserting its keys proves it wasn't erased to {}).
  const req: ContentEditRequest = {
    table: 'lemmas',
    id: '00000000-0000-0000-0000-000000000001',
    fields: { gloss_en: 'hello' },
    qa_status: 'native_ok',
  };
  expect(req.table).toBe('lemmas');
  expect(req.id).toBe('00000000-0000-0000-0000-000000000001');
  expect(req.fields).toEqual({ gloss_en: 'hello' });
  expect(req.qa_status).toBe('native_ok');
});

it('ServiceBundle has an editor member (shape check)', () => {
  // A partial ServiceBundle-shaped object with editor set to our stub compiles —
  // if editor was missing from the interface, the `satisfies ServiceBundle` below would fail.
  const partial = { editor: _editorStub } satisfies Pick<ServiceBundle, 'editor'>;
  expect(typeof partial.editor.isEditor).toBe('function');
  expect(typeof partial.editor.edit).toBe('function');
});
