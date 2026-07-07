# Backend Integration — How to Wire Each Card Modularly

This doc defines the **component boundary** that keeps every card swappable, testable, and
backend-driven. Follow it and Claude Code can wire a real SRS backend without touching card
internals.

> **Companion:** `WIRING_MAP.md` maps every `CardKind` in this doc to its actual component,
> file, and trigger prop, flags the routing gotchas (e.g. the `state`→`kind` rename), lists the
> hard-coded sample data to delete per card, and adds Expo / React Native port notes. The two
> screen tiers — SRS cards vs. standalone (`home`/`pod`/`prog`) — are explained there.

---

## 1. The golden rule: cards are pure, data-in / events-out

Each card is a **presentational component**. It receives everything it needs as **props** and
reports everything that happens via **callbacks**. It owns only ephemeral UI state (current
stage, which option is highlighted, is-audio-playing). It never fetches, never schedules,
never knows what comes next.

```
            ┌─────────────────────────────────────────────┐
  data ───▶ │  <Card item, onPlay, onRecord, onAnswer,    │ ───▶ events
            │          onReveal, onComplete />             │
            └─────────────────────────────────────────────┘
                 owns only: stage, picked, playing, speed
```

This mirrors the prototype: in the mocks the cards already isolate their UI state and take a
`T` (theme) + `t` (tweaks) prop. To productionize, add a **`item`** data prop and the
**callback** props below, and delete the hard-coded sample content.

---

## 2. The session controller (the one stateful piece)

Wrap the cards in a single **SessionController** (a hook, a screen, or a state machine — your
choice) that:

1. Fetches the day's batch from the backend.
2. Picks the next item and decides **which card + variant** to render for it (`renderFor(item)`).
3. Passes the item + callbacks to that card.
4. On `onComplete`, posts the result to the SRS backend and advances.

```ts
// pseudo-contract — adapt to your framework
type CardKind =
  | 'word/learn-concrete' | 'word/learn-abstract' | 'word/learn-function'
  | 'word/pic-review' | 'word/hear' | 'word/say'
  | 'phrase/hear' | 'phrase/meaning' | 'phrase/sayit'
  | 'drill' | 'diphthong' | 'pron';

function renderFor(item: ReviewItem): CardKind {
  if (item.stage === 'new') {
    if (item.type === 'word' && item.wordClass === 'concrete') return 'word/learn-concrete';
    if (item.type === 'word' && item.wordClass === 'abstract') return 'word/learn-abstract';
    if (item.type === 'word' && item.wordClass === 'function') return 'word/learn-function';
  }
  if (item.type === 'word') {
    if (item.media?.imageUrl) return 'word/pic-review'; // full loop on picturable words
    return item.reps < 3 ? 'word/hear' : 'word/say';    // recognition → production
  }
  // …phrase / drill / pron by item.type
}
```

The `CardKind` strings map 1:1 to the `id` + variant `k` in `app.jsx`'s `PP_SCREENS`. Keep them
stable — they're your analytics and deep-link keys too.

---

## 3. Shared data model

```ts
interface ReviewItem {
  id: string;                       // stable item id
  type: 'word' | 'phrase' | 'pair'; // 'pair' = minimal-pair drill
  stage: 'new' | 'learning' | 'review' | 'mature';
  reps: number;                     // successful reviews so far

  target: string;                   // e.g. "māja"  (the Latvian form)
  gloss: string;                    // e.g. "house"
  pron?: string;                    // e.g. "MAH-ya"
  wordClass?: 'concrete' | 'abstract' | 'function';

  audio: { nativeUrl: string; slowUrl?: string };
  media?: { imageUrl?: string; imageUrlDark?: string };

  mnemonic?: { soundsLike: string; note: string };       // abstract learn card
  examples?: { pre: string; w: string; post: string;     // function learn card
               en: string; audioUrl: string }[];

  // for multiple-choice steps — backend supplies distractors so difficulty is controlled
  choices?: { value: string; gloss?: string; correct: boolean }[];

  // minimal-pair drill
  pair?: { a: string; b: string; correct: 'a' | 'b'; audioUrl: string };
}
```

```ts
interface CardResult {
  itemId: string;
  cardKind: CardKind;
  correct?: boolean;          // multiple-choice outcome (undefined for learn cards)
  spoke?: boolean;            // did the user record an attempt
  recording?: Blob | string;  // audio blob or uploaded URL, for pron scoring
  selfRating?: 'good' | 'again'; // phrase say-it self rating
  latencyMs?: number;
}
```

The backend turns `CardResult` into the next interval (SM-2 / FSRS / your own). The card never
computes intervals — it only *displays* whatever "next review in N days" string the controller
hands back (or hides it).

---

## 4. Per-card contracts

> Props every card also takes: `theme`/tokens and any i18n. Below lists only the
> data + behavior contract.

> **Realized boundary note (`onRecordStop`).** The signatures below write `onRecordStop(blob)`,
> mirroring the web prototype where recording happened in-card. In the RN app the locked
> "cards are pure" boundary takes precedence: a pure, snapshot-testable card cannot produce real
> audio, so **the injected `RecorderService` owns the take**. Cards call `onRecordStop()` with no
> argument (a stop signal); the controller wiring (`src/session/cardWiring.ts`) captures the
> recording from `RecorderService.stop()` and merges it into the `CardResult`. The prop type is
> `onRecordStop(recording?: Blob | string)` for back-compat. This is the only intentional
> deviation from the literal signatures here.

### `word/learn-concrete` · `word/learn-abstract` · `word/learn-function`
- **In:** `item` (uses `target`, `gloss`, `pron`, `audio`, and one of `media` /
  `mnemonic` / `examples` by class).
- **Events:** `onPlay(which: 'native'|'slow'|exampleIndex)`, `onContinue()`.
- **Out (`onComplete`):** `{ spoke:false }` — exposure only; backend schedules first review.
- **Image:** concrete card renders `item.media.imageUrl`, swapping to `imageUrlDark` when in
  dark mode. (Prototype uses `assets/house.svg` / `house-night.svg` as the example.)

### `word/pic-review` — full loop, picture-prompted
- **In:** `item` with `media.imageUrl` + `choices` (one `correct`).
- **Stages:** `choose → speak → rec → result`.
- **Events:** `onPlay('native'|'slow')`, `onAnswer(value, correct)`,
  `onRecordStart()`, `onRecordStop(blob)`, `onPlayCompare('native'|'you')`, `onComplete(result)`.
- **Out:** `{ correct, spoke:true, recording }`.

### `word/hear` — recognition
- **In:** `item` + `choices` of **glosses** (audio is the cue).
- **Events:** `onPlay`, `onAnswer(value, correct)`, `onComplete`.
- **Out:** `{ correct, spoke:false }`.

### `word/say` — production (inverse)
- **In:** `item` + `choices` of **words** (the gloss is the cue).
- **Stages:** `choose → speak → rec → result`.
- **Out:** `{ correct, spoke:true, recording }`.

### `phrase/*`
- `locked`/`unlock` are **gating UI** — the controller decides lock state from whether all
  component word ids are in the known set; `unlock` fires `onUnlocked()` then auto-advances.
- `hear` → `{ spoke:false }`; `meaning` → `{ correct }`; `sayit` →
  `{ spoke:true, recording, selfRating }`.

### `drill` (minimal pair)
- **In:** `item.pair`.
- **Stages:** pick `a|b` → say-it-back (`idle → rec → done`).
- **Out:** `{ correct, spoke:true, recording }`.

### `diphthong` (ie-glide drill)
- **Trigger:** a `pair` item **with audio** whose `glide` field is set — `renderFor()` routes it
  here instead of `drill` (a pair without `glide` stays a plain `drill`).
- **In:** `item.pair` + `item.glide` (`{ combo, from, to, audioUrl? }`; the isolated-glide clip
  falls back to the native clip when unseeded).
- **Stages:** meet the glide → contrast (pick `a|b`) → say-it-back.
- **Out:** `{ correct, spoke:true, recording }` — same shape as `drill`.
- **Component:** `DiphthongDrillScreen` — `src/screens/DiphthongDrillScreen.tsx`.

### `pron`
> **Status: not yet reachable in the production loop (Phase 1).** `renderFor()` never returns
> `'pron'` today — every `item.type` resolves to another kind first. The registry entry and this
> contract stand ready for Phase 1, when GOP scoring lands and pronunciation items get scheduled.
- **In:** `item.audio.nativeUrl`.
- **Out:** `{ spoke:true, recording }` for server-side pronunciation scoring (the
  waveform/pitch compare in the mock is illustrative; real scoring is backend).

---

## 5. Services to inject (don't let cards import these directly)

Provide these as context/props so cards stay portable and testable:

| Service | Responsibility |
|---------|----------------|
| `AudioService` | `play(url, {rate})`, `stop()`, returns playing state. Cards call this via the `onPlay` callbacks; the orb's visual state is driven by the returned promise/observable. |
| `RecorderService` | `start()`, `stop(): Blob`, mic-permission handling. Backs `MicOrb`. |
| `SrsService` | `getDueBatch()`, `submit(result): { nextReviewLabel }`. Lives in the controller, **not** the card. |
| `KnownWordsStore` | set of known word ids; gates phrase unlocking. |

Cards receive **only the results** of these (e.g. the "next review in 5 days" string), never the
service instances, so they remain pure and snapshot-testable.

---

## 6. Practical port checklist for Claude Code
1. Stand up the **design system** first from `kit.jsx` tokens (README → Design Tokens):
   colors, type scale, `PlayOrb`, `MicOrb`, `Waveform`, `SpeedChip`, choice button, CTA.
2. Build the **`ReviewItem` / `CardResult`** types and the **SessionController** with
   `renderFor()`.
3. Port cards **one `CardKind` at a time**, replacing hard-coded sample content (`māja`,
   `labrīt`, the house image, the 2×2 options) with `item` fields and wiring callbacks.
4. Inject `AudioService` / `RecorderService`; keep the orbs' visual states identical.
5. Keep the **`id`+variant strings** as analytics events and deep-link routes.
6. Verify the **core loop** end-to-end on `word/pic-review`: picture+audio in → pick →
   say → result → `SrsService.submit`.

Everything visual is already decided — your job is the data/behavior plumbing behind a boundary
the prototype already draws.

---

## 7. Sound — the unlock chime

The phrase **unlock chime is synthesized at runtime**, not loaded from a file. It lives in
`screens-phrase.jsx` as `ppChime()`: two sine notes — **E5 (659.3 Hz)** then **A5 (880 Hz)**
130 ms later — each with a 20 ms fade-in to gain 0.07 and a ~1.1 s exponential fade-out.
Triggered in `PhraseUnlock` (`phrase/unlock`) on unlock; wrapped in try/catch so it no-ops in
audio-less contexts (PDF/print).

A bounced WAV of the **exact** parameters ships at **`assets/unlock-chime.wav`** (mono, 16-bit,
44.1 kHz, ~1.5 s, soft ~0.10 peak). For production, pick one:
- **Play the asset** through the injected `AudioService` (recommended — easiest to swap for a
  branded sound later, and avoids per-platform WebAudio quirks), or
- **Re-synthesize** by porting `ppChime` to your platform's audio API (no asset to bundle).

Either way, route it through `AudioService` so it respects the user's sound/haptics settings;
don't call an audio context directly from the card.
