# CrossRxBL — Code Review Findings & Implementation Brief

**Generated:** 2026-06-11 · **For:** an implementing agent · **Scope:** this repo only.
**Status:** review/handoff document — no code has been changed.

## How to use this doc
Each finding has an ID, severity, exact `file:line`, evidence, clinical impact, a concrete fix,
and a test. **Read `CLAUDE.md` first** — especially the five "Clinical safety invariants (DO NOT
REGRESS)."

> **Context:** Unlike the four vaccine apps, this is a β-lactam **cross-reactivity** tool driven by
> a single Excel matrix (`public/BLcrossmap.xlsx`, the single source of truth, swappable by a
> non-coder admin). The five documented safety invariants **hold on the happy path**: unknown
> symbols throw (never coerced to SAFE), blank = SAFE with the R1-only caveat surfaced, verdict =
> worst-case across all allergies, candidate-is-allergen short-circuits to AVOID, lookups are
> directional `matrix[allergy][candidate]`. The real risk is **parser robustness to spreadsheet
> drift** — the exact failure mode the admin-upload flow makes plausible — where a malformed table
> silently yields a falsely-SAFE "can give." The `.xlsx` itself could not be read in review; these
> findings are about the parsing + verdict code and its failure modes.

---

## P1 — High

### H1 · A drug present in the header but missing its data row silently returns "LOW RISK" for every candidate
- **Where:** `src/logic/parseTable.js:121–159` (matrix build) + `src/logic/assess.js:115–133,156–178`
- **What:** `parseSheetData` pre-initializes `matrix[drug] = {}` for every header drug (`parseTable.js:122`) but only fills cells for rows whose col-A label matches a drug and appear before a blank/LEGEND row. If a drug's data row is missing, blank, mistyped (`Amoxicilin`), or cut off by an early blank row, that drug's entry stays `{}`. In `assessCandidate`, the guard `if (!row) continue` (`assess.js:117`) does **not** catch this because `{}` is truthy, so `row[candidate] ?? TIERS.SAFE` returns SAFE for **every** candidate. `buildAlternatives` behaves the same. The fail-loud invariant protects against unknown **symbols**, not a missing **row**. The only signal is a soft parse-warning that fires only when `rowsProcessed != drugs.length`.
- **Impact:** If the uploaded spreadsheet has a drug in the header but a missing/blank/mistyped data row, a clinician selecting that drug as the patient's allergy is told **every** candidate β-lactam is LOW RISK ("can give") — including drugs with an **identical R1 side chain** (true AVOID) — with no error and no results-screen warning. This is the worst-case failure for a safety tool.
- **Fix:** Make it fail loud, consistent with the tool's philosophy: after building the matrix, assert **every** drug has a fully populated row (every candidate column present) and `throw` if any cell is missing — blocking the load (not just warning). In `assessCandidate`, if `matrix[allergyDrug]` is missing/empty, throw or surface a blocking error rather than defaulting to SAFE.
- **Test:** a fixture with a header drug whose data row is absent/empty → `parseSheetData` throws (table refuses to load); `assessCandidate` for that allergen never returns SAFE-by-default.

---

## P2 — Medium

### M1 · Short/ragged data rows coerce missing trailing cells to SAFE
- **Where:** `src/logic/parseTable.js:141–159,165–170`
- **What:** The build loop reads `row[c+1]` per candidate column and passes `undefined` (out-of-range) cells to `normalizeSymbol`, which returns `TIERS.SAFE` for null/undefined (`:45`). A row shorter than the header (a deleted cell/trailing block, or a `sheet_to_json` used-range that didn't reach the last column) → every missing trailing cell becomes SAFE silently. The only width check compares **row count** to `drugs.length` (a non-fatal warning); it never checks each row's **cell count**.
- **Impact:** If a column or trailing cells are dropped from a data row, the affected allergy→candidate pairs silently read LOW RISK even when the true rating was AVOID/CAUTION → unsafe recommendation, no load error.
- **Fix:** Distinguish "explicitly blank" (`''`, since `sheet_to_json` uses `defval:''`) from "absent" (`undefined`, index ≥ row.length). Treat an absent cell as a fatal structural error, or assert `row.length - 1 >= drugs.length` for every data row and throw otherwise.
- **Test:** a data row truncated by one column → load throws (not a silent SAFE).

### M2 · `normalizeSymbol` "alternate glyph" branches compare a character to itself (dead code)
- **Where:** `src/logic/parseTable.js:47–49`
- **What:** The AVOID and CAUTION branches OR a literal against an **identical** literal: `s === '✕' || s === '✕'` (both U+2715) and `s === '△' || s === '△'` (both U+25B3) — confirmed by hexdump. The duplication was clearly meant to accept a visual variant (e.g. `✖`/`×`/`❌` for avoid; `▲`/`⚠` for caution), but both operands collapsed to the same codepoint. The SELF branch **does** accept an ASCII `-` fallback, showing tolerance was intended.
- **Impact:** Fails safe (a look-alike blocks the whole table rather than mis-scoring), but a non-coder admin who types `×` (U+00D7, the most common substitute for `✕`, e.g. from autocorrect) gets a **total load failure / blank tool** with a confusing "Unrecognized symbol" error.
- **Fix:** Replace each duplicated literal with the real intended alternates using explicit `\u` escapes so they can't be collapsed by an editor, e.g. `if (s === '✕' || s === '✖' || s === '×' || s === '❌') return TIERS.AVOID;` and `if (s === '△' || s === '▲' || s === '⚠') return TIERS.CAUTION;`.
- **Test:** `normalizeSymbol('×')` (U+00D7) → AVOID; `normalizeSymbol('▲')` → CAUTION; a genuinely unknown glyph still returns null (still fails loud).

### M3 · Non-fatal parse warnings shown only on the Check tab, not on results or the Full Table
- **Where:** `src/App.jsx:164–171`
- **What:** `parseWarnings` (incl. "the table may not be square. Results may be incomplete" and "row label … skipped") render only inside the Check tab's left input panel. The Full Table tab and the verdict/results show no warning. A user on the Full Table, or routed to a verdict via "Check this pair →," can act on a degraded table without ever seeing it.
- **Impact:** A clinician could view the Full Table or a single-pair verdict built from a table that silently dropped a row (see H1) with no "results may be incomplete" warning.
- **Fix:** Surface a persistent warning banner whenever `parseWarnings` is non-empty regardless of active tab (e.g. a global strip below the header), and render it inside `TableView` and atop `ResultsPanel`.

### M4 · Directionality tests can't catch a transpose bug
- **Where:** `src/tests/parseTable.test.js:84–92`, `src/tests/assess.test.js:90–95`
- **What:** Invariant 5 (directional `matrix[allergy][candidate]`) is critical, but its tests are too weak: `parseTable.test.js:91` only asserts `amoxToCefaz !== undefined || cefazToAmox !== undefined` (trivially true); `assess.test.js:90` asserts the **same** verdict (CAUTION) in both directions on a synthetic matrix that's symmetric for that pair, so a transpose would still pass. Only the real-file Aztreonam→Ceftazidime=AVOID assertion could catch it, and only if the reverse differs in the production file.
- **Impact:** A future refactor that transposes the lookup (confusing "allergic to X, give Y" with "allergic to Y, give X") would pass the suite that's supposed to protect directionality → a wrong-direction verdict could ship.
- **Fix:** Add a synthetic fixture with an explicitly **asymmetric** pair (`matrix.A.B = AVOID`, `matrix.B.A = SAFE`) and assert `assessCandidate({allergies:['A'],candidate:'B'})` is AVOID while `({allergies:['B'],candidate:'A'})` is SAFE; in the real-file test, assert the actual reverse of Aztreonam→Ceftazidime.

---

## P3 — Low / cleanup
- **cefotaxime-availability-exclusion** (`src/logic/assess.js:29–35`): `EXCLUDED_FROM_ALTERNATIVES` hides 5 drugs from Safe Alternatives as "not consistently US-available," but **Cefotaxime** is a standard, broadly-stocked generic 3rd-gen cephalosporin. Over-exclusion (not unsafe — it's still in drop-downs/Full Table), but when cefotaxime would be a valid low-risk alternative the table omits it. Re-verify each of the 5 against a dated availability source; if cefotaxime is available, remove it (and update the two invariant tests + CLAUDE.md), or show excluded-but-safe drugs with an "(availability varies)" note.
- **safe-glyph-inconsistency** (`assess.js:53–58`, `ResultsPanel.jsx:88–92`, `TableView.jsx:4–9`): `—` means SAFE in `assess.js` `TIER_SYMBOL` but means SELF (same drug) in the table; `ResultsPanel` renders SAFE as `○`. Conflicting meanings for the same glyph across views the user sees together. Define one shared TIER→glyph map and import it everywhere (one SAFE glyph, one SELF glyph).
- **doc-test-count-drift** (`CLAUDE.md:23,262`, `HANDOFF.md:16,28`): docs say "39 unit tests" / "41 tests pass" while the files contain 43 `it(` blocks. Reconcile to the current count (or describe without a hard number).

---

## Verification for this repo
- `npm install && npm test` (Vitest, node env; ~43 `it` blocks across `parseTable.test.js` + `assess.test.js`). Keep covering the unknown-symbol fail-loud and blank=SAFE invariants.
- For H1/M1/M2, add fixtures that exercise spreadsheet-drift failure modes (missing row, truncated row, look-alike glyph) — the parser tests are the safety net for the non-coder admin upload flow.
- Manual smoke (`npm run dev`, served at `/CrossRxBL/`): load the real table (no warnings), then a deliberately broken copy (expect a blocking error, not a silent all-SAFE table); verify a known AVOID pair (e.g. Aztreonam→Ceftazidime) in both the Check tab and Full Table.
