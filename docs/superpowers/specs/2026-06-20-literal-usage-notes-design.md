# Literal / Usage Notes on Cards — Design

**Date:** 2026-06-20
**Status:** Approved design (pending spec review) → next step `writing-plans`
**Author:** brainstormed with Gabrial

## Problem

Some Latvian words and phrases carry a **literal** meaning that differs from how they're
**actually used**. The clearest example is `kā` — literally "like / as," but functionally "how"
(*Kā tev iet?* = "How are you?", literally "how to-you goes?"). Today the app shows only the
single functional gloss, so the learner never sees *why* a word means what it means, and idiom
phrases route to a `phrase/meaning` card that has a literal-note display slot which is **never
populated**.

We want to surface, **only where the two genuinely differ**, both the literal reading and the
functional meaning together — on words and on phrases.

### Non-goal / correction captured during brainstorming

`labdien` is **not** a literal/actual mismatch: it literally **is** "good day" (a formal greeting),
and `sveiki` is the informal "hi/hello." The note must appear only on true gaps, never as a blanket
feature. **Separately, this surfaced a content bug:** `content-pipeline/golden-slice.json` currently
glosses `labdien` as `"hello"` — that is wrong; it should be `"good day"`. Fixing that gloss is
folded into the content pass below.

## Decisions (locked with the user)

| Question | Decision |
| --- | --- |
| Which item types carry a note? | **Both words and phrases** |
| What is shown? | **Literal reading + actual meaning together**, only where they differ |
| When does a WORD note appear? | **On first-exposure "learn" cards only** (`word/learn-concrete` / `-abstract` / `-function`). Reviews stay clean. |
| When does a PHRASE note appear? | **On the first-exposure `phrase/hear` card**, AND it enriches the existing `phrase/meaning` idiom reveal with real data. |
| Data shape | **Two fields: a literal gloss + a freeform usage note.** |
| Content drafting scope | **All seeded content with a genuine gap** — I audit every seeded lemma + phrase, draft notes for each gap. |
| Content workflow | **I draft, you approve** before anything is seeded. |

## Out of scope (explicit)

- **`is_idiom` routing changes.** Making a phrase like *Kā tev iet?* route to the `phrase/meaning`
  comprehension card would also require phrase distractors/choices (phrases don't currently get
  `get_distractors`). That is a separate feature. For this work, *Kā tev iet?* stays a non-idiom
  phrase and its note surfaces on `phrase/hear`. Flagged as a follow-up.
- Authoring notes for the full ~1000-word list. This pass covers only currently-seeded content.
- Any new TTS / audio generation (notes are text only).

## Architecture

The note is **additive optional content** that flows exactly like `mnemonic` and `examples`
already do: DB column → hand-written row type → pure mapper → `ReviewItem` field → pure card.
Nothing about the card boundary changes (data-in / events-out; cards render from `item` fields).

```
lemmas.literal_gloss / .usage_note ┐
phrases.literal_gloss / .usage_note ┘→ LemmaRow/PhraseRow → mapper → ReviewItem.literal / .usageNote
                                                                          │
                                              ┌───────────────────────────┼───────────────────────────┐
                                  WordLearn{Concrete,Abstract,Function}  PhraseHear            PhraseMeaning
                                              └──────────────── all render <LiteralNote literal usageNote/> ┘
```

### Data model

New migration `supabase/migrations/0008_literal_usage.sql`. Add two **nullable** text columns to
**both** `lemmas` and `phrases`:

- `literal_gloss text` — the literal / word-for-word reading (word: e.g. `kā` → "like / as";
  phrase: its word-for-word string, e.g. "how to-you goes").
- `usage_note text` — a short freeform nuance line (e.g. "used to ask 'how' in greetings").

Both default `NULL`. Almost every row leaves both null; the note only renders when `literal_gloss`
is present.

Hand-written row types (`src/services/supabase/types.ts`) — `LemmaRow` and `PhraseRow` each gain:

```ts
literal_gloss: string | null;
usage_note: string | null;
```

### Contract shape (`src/types/reviewItem.ts`)

`ReviewItem` gains two optional fields:

```ts
literal?: string;    // literal / word-for-word reading
usageNote?: string;  // freeform usage nuance
```

**Remove the dormant `literalNote?: string` field** (line 86). It is read in exactly one place
(`PhraseMeaning`) and is never populated by the mapper or seeder. `PhraseMeaning` is being edited
in this work anyway, so the removal is contained.

### Mapper (`src/services/supabase/mappers.ts`)

`lemmaRowToReviewItem` and `phraseRowToReviewItem` each populate the two fields from the row,
mapping SQL `null` → `undefined` (consistent with how `pron`, `mnemonic`, etc. are handled):

```ts
if (row.literal_gloss) item.literal = row.literal_gloss;
if (row.usage_note) item.usageNote = row.usage_note;
```

### Presentational component (`src/components/cardChrome.tsx`)

Add a pure `LiteralNote` to `cardChrome` (where the other small card-chrome pieces live —
`GlossLine`, `Caption`, `FootNote`). Single render path, reused by every surface so styling and
behavior stay identical everywhere.

```tsx
export function LiteralNote({ literal, usageNote }: { literal?: string; usageNote?: string }): React.JSX.Element | null {
  const T = useTheme();
  if (!literal) return null; // nothing authored → render nothing
  return (
    <View style={styles.literalNote}>
      <Text style={[styles.literalLine, { color: T.sub }]}>
        <Text style={{ fontWeight: '600' }}>Literally: </Text>{literal}
      </Text>
      {usageNote ? (
        <Text style={[styles.usageLine, { color: T.faint }]}>{usageNote}</Text>
      ) : null}
    </View>
  );
}
```

Tokens come from the theme (`useTheme()` — `T.sub`, `T.faint`), never magic colors. Exact spacing
(margins, font sizes) is left to the implementer to match the surrounding card chrome; the plan
will name the sizes.

### Rendering surfaces

All four gate on `item.literal` being present (the component itself returns `null` when absent, so
each card can render it unconditionally and it simply disappears for items without a note).

1. **`WordLearnConcrete` / `WordLearnAbstract` / `WordLearnFunction`** — render `<LiteralNote>`
   directly below the `GlossLine` (for `WordLearnFunction`, below the gloss line, above the example
   rows). First exposure only — these cards only mount for `stage === 'new'` words.
2. **`PhraseHear`** — render `<LiteralNote>` in the card body (below the `newLemma`/`newForm` hint,
   above the audio hero). First exposure of every phrase.
3. **`PhraseMeaning`** — replace the hard-coded fallback feedback string
   (`x.literalNote ?? 'That's it — the words don't add up literally.'`) with the real data. In the
   solved state: the feedback line shows `item.usageNote ?? 'That's it — the words don't add up
   literally.'`, and `<LiteralNote literal={item.literal} usageNote={undefined} />` renders the
   literal reading below the choices (usageNote is passed `undefined` here precisely because it is
   already the feedback line — the literal and usage do not both appear twice). The `MeaningExtra`
   type and every `x.literalNote` reference are removed.

`renderFor` is **unchanged**. `is_idiom` continues to control comprehension-check routing
independently of whether a note exists.

### Seeding (`content-pipeline/golden-slice.json` + `seed-golden-slice.mjs`)

- `golden-slice.json` lemma/phrase entries gain optional `"literal"` and `"usageNote"` string
  fields (only on items with a gap). Also fix `labdien`'s `"gloss": "hello"` → `"good day"`.
- `seed-golden-slice.mjs` writes the new columns, mirroring the existing `mnemonic`/`examples`
  conditional pattern:
  - lemma row build: `if (l.literal) row.literal_gloss = l.literal; if (l.usageNote) row.usage_note = l.usageNote;`
  - phrase row build: `if (p.literal) phraseRow.literal_gloss = p.literal; if (p.usageNote) phraseRow.usage_note = p.usageNote;`

### Content (drafted by me, approved by you before seeding)

I audit every seeded lemma + phrase in `golden-slice.json` for a genuine literal/actual gap and
present a **markdown approval table** (Latvian · current gloss · proposed literal · proposed usage)
for your edit/approval. Only approved strings land in the seed. Known candidates from the current
seed (final list comes with the table):

- **`kā`** — literal "like / as"; usage "used as 'how' in questions like *Kā tev iet?*"
- **`Kā tev iet?`** (phrase) — literal "how to-you goes?"; usage "everyday 'How are you?'"
- **`labdien`** — gloss correction to "good day" (not a literal/actual gap; no note, just the fix).

The audit may also note phrases that *would* be idioms (e.g. *Kā tev iet?*) — surfaced for your
awareness only; `is_idiom` routing is out of scope here.

## Persistence & seeding gates (require your approval, like the Task 5 seeder)

1. `mcp__supabase__apply_migration` of `0008_literal_usage.sql` to the live project
   (`necfghfotwykjsykccsa`) — I confirm before touching the live DB.
2. Re-run `seed-golden-slice.mjs` to write the new columns — text only, no new TTS spend.

The code can merge with **zero notes authored** and stay completely invisible (the component
renders `null`), so the structure and the content approvals are independent gates.

## Testing

- **`cardChrome` / `LiteralNote`** unit test: renders literal + usage when `literal` present;
  renders `null` (nothing) when `literal` absent; renders literal only when `usageNote` absent.
- **`mappers.test.ts`**: `literal_gloss` → `literal`, `usage_note` → `usageNote`, with `null` →
  `undefined`, for both lemma and phrase mappers.
- **Card tests** (`WordLearnConcrete/Abstract/Function`, `PhraseHear`, `PhraseMeaning`): each shows
  the note when the fixture `ReviewItem` carries `literal`, and hides it when it doesn't.
  `PhraseMeaning` additionally asserts the usage note drives the solved-state feedback line.
- **`renderFor.test.ts`**: unchanged (smoke test must still pass — routing is untouched).
- Full suite (`logic` + `components` projects), `tsc`, and `lint` stay green.

## File touch list

| File | Change |
| --- | --- |
| `supabase/migrations/0008_literal_usage.sql` | **Create** — add `literal_gloss`, `usage_note` to `lemmas` + `phrases` |
| `src/services/supabase/types.ts` | Add the two fields to `LemmaRow` + `PhraseRow` |
| `src/types/reviewItem.ts` | Add `literal?` + `usageNote?`; remove dormant `literalNote?` |
| `src/services/supabase/mappers.ts` | Populate `literal` / `usageNote` in both row mappers |
| `src/components/cardChrome.tsx` | Add pure `LiteralNote` component |
| `src/components/cardChrome.test.tsx` (or sibling) | Test `LiteralNote` |
| `src/screens/WordLearnConcrete.tsx` | Render `<LiteralNote>` below gloss |
| `src/screens/WordLearnAbstract.tsx` | Render `<LiteralNote>` below gloss |
| `src/screens/WordLearnFunction.tsx` | Render `<LiteralNote>` below gloss |
| `src/screens/PhraseHear.tsx` | Render `<LiteralNote>` in body |
| `src/screens/PhraseMeaning.tsx` | Use real `literal`/`usageNote`; drop `MeaningExtra`/`literalNote` |
| respective `*.test.tsx` | Assert note shows/hides |
| `content-pipeline/golden-slice.json` | Add `literal`/`usageNote` to gap items; fix `labdien` gloss |
| `content-pipeline/seed-golden-slice.mjs` | Write the two columns for lemmas + phrases |
