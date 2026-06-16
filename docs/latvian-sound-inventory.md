# Latvian Sound Inventory — Hard-Sound Coverage Matrix

**Scope:** This is a curated inventory of ONLY the Latvian sounds that are **difficult for English speakers** and merit dedicated drill cards. The rest are absorbed from hearing the core vocabulary.

---

## Principle: What gets a drill card

An English ear actually confuses only a handful of Latvian contrasts. Rather than attempt to drill every sound in the inventory, we drill *only the contrasts an English speaker actually struggles with* — the ones that block comprehension or unintelligible production. The remaining sounds (the sibilants, affricates, and familiar consonants) are absorbed passively through daily exposure to the core 1,000 words and phrases.

This principle keeps cognitive load low in the early phase and directs pronunciation pressure where it matters most.

---

## Coverage matrix — Drilled sounds

| Sound(s) | contrast_type | Representative minimal pair | Ships |
|---|---|---|---|
| ļ ķ ģ ņ | palatalization | *ļoti* "very" / *lācis* "bear" (the L/Ļ contrast) | **[slice]** |
| ie | diphthong | *lieta* "thing" / *lēta* "cheap" (the ie/ē contrast) | **[slice]** |
| ā ē ī ū (vs. short) | vowel_length | *pile* "hair" (short i) / *pīle* "duck" (long ī) | *(next batch)* |
| dz dž | affricate | *dzīvot* "to live" / *žēlot* "to pity" (dz vs. dž contrast) | *(next batch)* |

---

## Excluded / absorbed from hearing

The following sounds are NOT drilled. They are absorbed passively through listening to the core words and phrases:

- **č** — palatal affricate; English "ch" in "chip." Latvian uses it regularly but English speakers recognize it immediately from everyday exposure.
- **š** — voiceless palatal fricative; English "sh" in "ship." Familiar to English ears.
- **ž** — voiced palatal fricative; English "s" in "measure." Common in English (and French loanwords) so learners quickly internalize it.
- **c** — alveolar affricate; English "ts" in "cats." Learners pick this up naturally from *cilvēks* ("person"), *centīgs* ("diligent"), etc.
- **j** — palatal approximant; English "y" in "yes." Identical to English; no confusion.
- **r** — alveolar trill. Borderline. English has a post-alveolar approximant "r," and the Latvian trill is phonetically distant. However, it is not a *contrast* (no minimal pairs distinguish trill from English-style "r" at the syllable level), and learners acquire the trill through listening to high-frequency words (*rīt* "tomorrow," *runāt* "to speak"). Marked as borderline; not drilled, but noted here because the sound is perceptibly different.

---

## Note on the `pron` respelling convention

The `pron` field used throughout the app (and in content-pipeline outputs) is a phonetic respelling aid for learners. It must mark three features to be useful:

1. **First-syllable stress.** Latvian stress is nearly always initial; the respelling must highlight the stressed syllable (e.g., `MAH-ya` for *māja*).
2. **Long vowels.** The macron (ā ē ī ū) marks length in Latvian orthography; the respelling must preserve or transliterate this (e.g., `PEEL-ay` for *pīle*, where ī is marked).
3. **Palatals.** The sounds ļ ķ ģ ņ have no direct English equivalent. The respelling must either use a diacritic (e.g., ļ), a softening mark (e.g., "L' "), or a descriptive note (e.g., "soft L") so learners know the articulation differs from plain L, K, G, N.

When these three features are present, the respelling is a reliable bridge between orthography and pronunciation.
