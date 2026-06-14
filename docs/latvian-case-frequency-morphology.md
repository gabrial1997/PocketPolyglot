# Latvian Noun Case Frequency & Partial-Paradigm Teaching — Findings Memo

**DRAFT — QA pending**

**Author:** Researcher agent · **Date:** 2026-06-14 · **Status:** Draft for QA audit
**Evidence tiers:** ✅ Strong | ⚠️ Moderate | ❓ Hypothesis | ❌ Weak/Contested

---

## The question

The founder proposes that, for each Latvian noun, the curriculum teach the base/dictionary form (lemma/nominative) first, then only its **most-frequent inflected case forms** — capping at roughly the **top 5 of the 7 cases** rather than the full paradigm. This memo validates the empirical basis on four points: (1) is "7 cases" the right denominator or is it effectively ~6? (2) does corpus evidence support "the top-N case forms cover most running-text usage"? (3) does SLA evidence support teaching high-frequency inflected forms as lexical chunks vs. the full paradigm? (4) an evidence-based cutoff — explicitly comparing the project's **currently LOCKED 3-case decision** (nominative + accusative + dative; all others incidental) against the founder's proposed **~5** (which adds genitive + locative).

This memo concerns **nouns only**, consistent with the locked decision in `memory.md` principle 10. Verb morphology is a separate open question.

---

## 1. The case-system clarification — "7" is a textbook count; ~6 is the practical denominator, and arguably 5–6 carry essentially all distinct, free-standing forms

Latvian noun morphology is traditionally described with **seven cases**: nominative, genitive, dative, accusative, instrumental, locative, vocative (Wikipedia, *Latvian declension*; pronuncia.io overview). But "7" overstates the number of morphologically **distinct, productively used** case forms a learner must acquire:

- **Instrumental — not a distinct form (✅ Strong).** The instrumental is *always* syncretic: it is **identical to the accusative in the singular and to the dative in the plural**, across every declension class (Wikipedia, *Latvian declension*, with full paradigm tables; this is also why Fennel 1975, *"Is there an Instrumental Case in Latvian?"*, *J. Baltic Studies*, questioned its case status). It has **no endings of its own to learn** and is used as a free-standing (preposition-less) case only "in highly restricted contexts in modern Latvian" — e.g. *vīrs sarkanu bārdu* "a man with a red beard" (= accusative form), *meitene zilām acīm* "a girl with blue eyes" (= dative form). Otherwise the instrumental meaning is carried by **`ar` + accusative (sg.) / dative (pl.)**. For a learner, the instrumental is therefore **zero new morphology** — it falls out of accusative + dative, which the locked plan already teaches.

- **Vocative — marginal and receding (⚠️ Moderate).** The vocative is "rare in modern Latvian," survives mainly in set phrases/address, and **the nominative form can always be used as a vocative** (Wikipedia, *Latvian declension*; Latvians Online, *"The vocative case: Arnis! or Arni!"*). It is frequently formed as nominative-minus-final-s and in several declension groups is identical to the nominative. In casual speech it is increasingly replaced by the nominative. For a speaking-first beginner it is **not load-bearing** and can be taught later as a few memorized address forms, if at all.

**Net:** Of the seven labels, **instrumental adds no distinct forms** (it equals acc.sg / dat.pl) and **vocative is marginal and nominative-substitutable**. The set of cases that contribute distinct, productively-used noun endings in modern usage is therefore effectively **six** (nominative, genitive, dative, accusative, locative, + the residual vocative), and the cases that actually carry running-text meaning reduce to the **five "core" cases**: nominative, genitive, dative, accusative, locative. (A traditional grammar may also note an "ablative" — genitive in sg., dative in pl. — but this is not a separate case in standard grammars; it is a description of how prepositions shift government in the plural. Wikipedia, *Latvian declension*.)

**Conclusion for point 1:** "7" is the right *textbook* number but the wrong *teaching* denominator. The honest denominator is **~6 distinct (≈5 core + marginal vocative)**, because the instrumental is fully syncretic with cases the learner already gets. This materially weakens the framing of the founder's "5 of 7" cap: in form terms, the five core cases already cover essentially everything except the marginal vocative — there is no large "unused paradigm" being discarded.

---

## 2. Frequency coverage — the direction is right (a few cases dominate running text), but **Latvian-specific numbers are not well-published**; the claim is supported by proxy, not by a Latvian coverage curve yet

The founder's premise ("a small number of cases account for most usage") is **directionally well-supported but currently under-evidenced for Latvian specifically.**

- **Strong proxy (Russian National Corpus, ⚠️ Moderate for Latvian by extension).** In Russian — the nearest large, well-documented case-rich corpus — nominative forms account for roughly **~30%** of noun-case instances and genitive **~26%**, with the remaining cases (accusative, dative, instrumental, prepositional/locative) splitting the rest (figure reported from Russian National Corpus data; see grokipedia/RNC-derived summaries). The shape is a steep frequency curve: nominative + genitive alone are over half of all case tokens, and the top five cases account for the overwhelming majority. **Caveat:** Russian's case inventory and functional load differ from Latvian's (e.g. Russian genitive is unusually heavy due to negation and quantification), so the *exact* ranks do not transfer. Latvian likely shows a comparably steep curve, but the per-case shares are not the same.

- **Latvian-specific data exists but the case-frequency breakdown is not published in a convenient form (gap).** The authoritative resource is the **Latvian UD Treebank (LVTB)** — ~19,580 sentences / ~330,318 tokens, manually verified morphology and lemmas, from LU MII AiLab (UniversalDependencies/UD_Latvian-LVTB; CLARIN-LV Latvian Treebank). Case-tagged token counts are computable directly from the CoNLL-U `Case=` feature, but a ready-made coverage curve was not located in the literature. The project's own raw frequency list (`lv-frequency-top1000.csv`, OpenSubtitles/hermitdave) is **wordform-level, not case-tagged**, so it cannot answer the case-distribution question until it is morphologically parsed (Stanza/UDPipe lv).

- **Register note (relevant to PocketPolyglot).** Spoken/dialogue register (OpenSubtitles) likely tilts even harder toward nominative (subjects, naming, copular predicates), accusative (direct objects), and locative (place/time adjuncts), with genitive somewhat less dominant than in formal written Russian. This is a **❓ hypothesis** until measured on LVTB and/or the OpenSubtitles extract.

**Conclusion for point 2:** The claim **"the top-N case forms account for most running-text usage" is correct in shape** (steep Zipf-like case distribution; a handful of cases dominate) and is consistent with the strongest available proxy (RNC). But there is **no published Latvian coverage curve** to cite for exact shares. Producing one from LVTB (`Case=` feature counts) is a small, high-value task and should be done before any cutoff is *locked* on quantitative grounds.

---

## 3. SLA evidence — frequency-prioritized, chunk-embedded partial-paradigm teaching is the better-supported approach for speaking-first beginners

This is consistent with, and strengthens, the existing `sla-evidence-review.md` findings. Summary of the relevant evidence:

- **Frequency-first is the strongest cost-benefit result in vocabulary research (✅ Strong).** Nation (2006) and the broader frequency literature show learning effort tracks usage frequency; spoken language is even more frequency-concentrated than written. Applied to morphology, this means teaching the **high-frequency inflected forms** that learners will actually hear/say, rather than completing paradigms for their own sake (`sla-evidence-review.md` §6).

- **Formulaic chunks drive conversational fluency (⚠️ Moderate).** Boers et al. (2006) and Wood (2006, 2010) found learners taught formulaic sequences are rated more fluent and produce longer runs with fewer pauses. The mechanism — chunks bypass real-time morphological assembly — is exactly what a speaking-first beginner needs. High-frequency case forms delivered *inside* phrases (e.g. *Latvijā* "in Latvia" as a locative chunk, *paldies tev* "thanks to you" as a dative chunk) are acquired as wholes before the rule is generalized.

- **Case morphology is acquired slowly and is more important for comprehension than for intelligible production (⚠️ Moderate).** Kempe & MacWhinney (1998) show L2 case marking in Russian/German is protracted even for advanced learners; case errors rarely block casual intelligibility because word order, animacy, and context carry meaning. Endings matter more as **parsing cues (recognition)** than as production targets. This argues for: teach a small explicit core, prioritize *recognizing* case cues over producing them perfectly, and tolerate production errors — not drill the full paradigm.

- **Partial-paradigm / "principal parts" teaching has linguistic-pedagogy support (⚠️ Moderate).** The morphology literature recognizes that a paradigm has a predictable subset and that pedagogy can teach a minimal set of forms (high-frequency forms are early-acquired and stabilize the rest; Nick Ellis on frequency effects; "principal parts" pedagogy). Frequency-prioritized partial paradigms are a recognized strategy, not an ad-hoc shortcut.

- **What is NOT well-supported:** front-loading the *complete* declension table for beginners. There is no SLA evidence that exhaustive paradigm drilling speeds conversational ability; it raises cognitive load and delays speaking, contradicting the audio-first/speaking-first principle.

**Conclusion for point 3:** Frequency-prioritized, chunk-embedded partial-paradigm teaching is the **better-supported approach** for this learner profile. Both the locked 3-case plan and the founder's 5-case proposal are partial-paradigm approaches and both sit on this evidence — the SLA evidence does not by itself adjudicate 3 vs. 5; it only rules *out* the full paradigm.

---

## 4. Recommendation — 3 vs. 5

**The locked 3-case decision (nominative + accusative + dative, all others incidental) and the founder's ~5-case proposal (add genitive + locative) differ only on genitive and locative.** Here is the case for each, and the recommendation.

### What the two extra cases buy

- **Locative — strong candidate for explicit inclusion (⚠️ Moderate, leaning include).** The locative encodes *place and time* ("in Riga," "in the morning," "in Latvia"), which is high-frequency in casual conversation and very chunk-friendly (*Rīgā, mājās, Latvijā, no rīta*). It has a single, fairly regular ending pattern (-ā/-ē/-ī/-ū sg.; -os/-ās pl.) and is hard to express idiomatically any other way. Of the two cases the founder would add, **locative has the strongest claim** to explicit treatment. Notably, the existing `sla-evidence-review.md` (§open-question b) already recommended a core of "nominative, accusative, **locative** + frequent genitive forms as chunks" — i.e. the prior research draft itself implied locative, revealing a **latent inconsistency with the locked 3-case decision** that QA should flag.

- **Genitive — high frequency but lower teaching ROI as an *explicit* case (⚠️ Moderate, leaning incidental).** Genitive is very frequent (possession, "of"-relations, post-preposition government, partitive-like uses) — by proxy it may be the #2 case. But much of its conversational payload is already delivered through (a) fixed chunks and high-frequency genitive pronouns (*mans, tavs, mūsu, jūsu*), and (b) prepositional phrases learners memorize whole. Its productive endings are also among the more variable across declensions. So genitive is a strong candidate for **heavy incidental/chunk exposure** but a weaker candidate for **explicit paradigm teaching** in the earliest phase.

### Recommendation

**Adopt a "3 explicit + locative as the first incidental-to-explicit promotion" position — i.e. effectively 3.5–4, not a flat 5.** Concretely:

1. **Keep the locked explicit core for production: nominative, accusative, dative.** Well-justified — these cover subject, direct object, and recipient/indirect object, the backbone of simple transactional speech.
2. **Promote locative to explicit recognition + chunk production early** (it is high-frequency, regular, chunk-friendly, and already implied by the prior SLA memo). This is the single highest-value addition to the locked plan.
3. **Treat genitive as incidental/chunk-first** (pronoun possessives + memorized prepositional phrases), promoting to explicit only if LVTB frequency data shows it is doing more conversational work than chunks can absorb.

**Why this over a flat 5:** The framing "5 of 7" is partly illusory — once the syncretic instrumental and marginal vocative are removed, the five core cases are *almost the whole system*, so "5" is closer to "teach nearly everything explicitly" than the founder may intend. The evidence supports **adding locative explicitly** (clear conversational ROI, low morphological cost) more strongly than it supports **adding genitive explicitly** (high frequency but largely chunk-absorbable, higher morphological variability). A graduated position (3 explicit + locative promoted + genitive incidental) is better supported than either a hard 3 or a flat 5, and it preserves the chunk-first, speaking-first, low-load principles.

**Honest uncertainty:** The 3-vs-5 question is *not* resolvable from published evidence alone. The SLA literature rules out full-paradigm drilling and endorses frequency-prioritized chunks, but it does not tell us whether the optimal explicit set is 3, 4, or 5 — that depends on (a) Latvian case-frequency shares in the spoken register and (b) which cases are chunk-absorbable vs. need rule-level support. Both require project-specific measurement before locking.

---

## Open validation items (before any change to the locked decision is locked)

1. **korpuss.lv / LVTB case-frequency curve (required).** Compute per-case token shares from the Latvian UD Treebank `Case=` feature and from the project's OpenSubtitles extract (after Stanza/UDPipe parsing), spoken register weighted. This produces the missing Latvian coverage curve and turns "3 vs 5" into a data-grounded decision rather than a proxy argument. *(Linguistics Expert / Researcher.)*
2. **Elizabete native-speaker check (required for error tolerance).** Which case errors actually break intelligibility in casual speech vs. which are tolerated — directly informs how much *production* accuracy each case needs vs. recognition-only. This is the morphological intelligibility test already flagged in `founder/elizabeth/input.md`; run it before the morphology sequence is locked. *(Elizabete.)*
3. **Resolve the internal inconsistency.** `sla-evidence-review.md` §open-b recommends "nominative, accusative, **locative** + genitive chunks," while `memory.md` principle 10 locks "nominative + accusative + **dative**." These disagree on whether dative or locative is in the explicit core. QA should surface this; it should be reconciled by Gabrial, not silently. *(QA → Gabrial.)*
4. **Confirm spoken-register skew hypothesis.** Verify (not assume) that spoken/dialogue Latvian tilts toward nom/acc/loc relative to written genitive-heavy registers, using the OpenSubtitles vs. LVTB comparison.

---

## Sources

- Wikipedia, *Latvian declension* — case inventory, full declension paradigms, instrumental syncretism (acc.sg / dat.pl), vocative formation and marginality, ablative description. https://en.wikipedia.org/wiki/Latvian_declension
- Fennel, T. G. (1975). "Is there an Instrumental Case in Latvian?" *Journal of Baltic Studies* 6(1): 41–48. https://doi.org/10.1080/01629777500000441
- Andronov, A. V. (2001). "A survey of the case paradigm in Latvian." *Sprachtypologie und Universalienforschung* 54(3): 197–208.
- pronuncia.io — *The Seven Latvian Noun Cases: Overview for English Speakers.* https://pronuncia.io/learn/lv/the-seven-latvian-noun-cases-overview
- Latvians Online — *The vocative case: Arnis! or Arni!* (vocative recession, nominative substitution). https://latviansonline.com/the-vocative-case-arnis-or-arni/
- Russian National Corpus case-frequency figures (nominative ~30%, genitive ~26%) — nearest documented case-rich proxy; *exact ranks do not transfer to Latvian.* Reported via RNC-derived summaries (grokipedia, *Russian grammatical cases*). https://grokipedia.com/page/Russian_grammatical_cases
- UniversalDependencies / UD_Latvian-LVTB — Latvian UD Treebank (~19.6k sentences / ~330k tokens, manually verified morphology); source for computing a Latvian case-frequency curve via the `Case=` feature. https://github.com/UniversalDependencies/UD_Latvian-LVTB
- CLARIN-LV — Latvian Treebank repository. https://repository.clarin.lv/repository/xmlui/handle/20.500.12574/55
- Nation, I.S.P. (2006). How large a vocabulary is needed for reading and listening? *Canadian Modern Language Review.* (frequency-first cost-benefit) — see `sla-evidence-review.md`.
- Kempe, V. & MacWhinney, B. (1998). The acquisition of case marking by adult learners of Russian and German. *SSLA.* https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/acquisition-of-case-marking-by-adult-learners-of-russian-and-german/D42CEC8EF1639D877A7DC0F261C01377
- Boers et al. (2006); Wood (2006, 2010) — formulaic sequences and oral fluency. See `sla-evidence-review.md`.
- Ellis, N. C. — frequency effects and chunking in SLA (sequencing/chunking literature). https://sites.lsa.umich.edu/nickellis-new/wp-content/uploads/sites/1284/2021/07/Ellis1996Chunking.pdf
- Internal: `docs/research/sla-evidence-review.md` (esp. §6 frequency-first, §open-b morphology dose, §open-c chunks); `memory.md` principle 10 (LOCKED 3-case decision); `docs/linguistics/lv-frequency-top1000-source-note.md` (raw wordform list, not case-tagged).
