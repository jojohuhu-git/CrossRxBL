# CrossRxBL — Claude Code Guidance

Guidance for working on (or rebuilding from scratch) the Beta-Lactam Cross-Reactivity
decision-support tool. Read this first.

## What it is

CrossRxBL is a **client-side React SPA** — no backend, no database, no login. It helps a
clinician answer: *"My patient is allergic to drug X. Is it safe to give drug Y?"* for
beta-lactam antibiotics, based on **R1 side-chain similarity**.

All clinical data comes from **one Excel file** (`public/BLcrossmap.xlsx`), parsed in the
browser. The spreadsheet is the **single source of truth** — drug names, classes, and risk
ratings are never hardcoded in JS, so swapping the file changes the app with zero code edits.

Live site: https://jojohuhu-git.github.io/CrossRxBL/

## Tech stack

- **React 18** (hooks only, function components)
- **Vite 5** (`npm run dev`, `npm run build`)
- **xlsx (SheetJS)** for in-browser Excel parsing
- **Vitest 2** for unit tests (`npm test`)
- Deployed to **GitHub Pages** via `.github/workflows/deploy.yml` on push to `main`
- `vite.config.js` sets `base: '/CrossRxBL/'` — required for the Pages subpath

## Setup

```bash
npm install
npm run dev      # dev server (http://localhost:5173/CrossRxBL/ — note the /CrossRxBL/ path)
npm test         # 39 unit tests (parser + verdict logic), node environment
npm run build    # production build to dist/
```

## File structure

```
public/
  BLcrossmap.xlsx     THE clinical data — single source of truth (see "Data model")
  favicon.svg         Navy shield + white plus (clinical logo)
src/
  main.jsx            React entry
  App.jsx             App shell: header, tab bar, Check tab + Table tab, state owner
  index.css           ALL styles + :root design tokens (no CSS framework)
  logic/
    parseTable.js     Excel parser. Exports TIERS, TIER_SEVERITY, parseSheetData,
                      loadTableFromUrl. Fail-loud on unknown symbols.
    assess.js         Verdict engine. assessCandidate(), buildAlternatives(), verdictMeta().
                      Also exports EXCLUDED_FROM_ALTERNATIVES (Set of 5 drugs).
  components/
    AllergySelect.jsx     Multi-select searchable typeahead (allergies). Closes on each
                          selection (mirrors CandidateSelect single-select behavior).
    CandidateSelect.jsx   Single-select searchable typeahead (desired antibiotic)
    ResultsPanel.jsx      Verdict banner + "Why?" breakdown + Safe Alternatives table.
                          AlternativesTable: class-color accents, IV/PO route tags.
    TableView.jsx         Interactive 29x29 matrix (Full Table tab)
  tests/
    parseTable.test.js    Parser tests (incl. unknown-symbol rejection)
    assess.test.js        Verdict + alternatives tests (incl. exclusion invariants)
docs/
  UPDATING-THE-TABLE.md   Non-coder admin guide for swapping the table
.github/workflows/
  deploy.yml          CI: test -> build -> deploy to Pages
```

## Data model — the Excel as source of truth

### Spreadsheet layout (`Sheet1`)
```
Row 0  : Title row (ignored)
Row 1  : "Drug Class →" in col A, then class labels (carried forward across blank cells)
Row 2  : "Allergy To ↓ \ Consider →" in col A, then 29 drug names (one per column)
Rows 3+: one drug per row; col A = allergy drug; cols 1..N = matrix cells
Below  : blank rows then a LEGEND block (ignored by the parser)
```
The matrix is **square and directional**: `matrix[allergyDrug][candidateDrug]`. Do NOT assume
symmetry (rows = the patient's allergy, columns = the drug being considered).

### Symbol → risk tier (the four states)
| Cell | Tier | Meaning | Verdict surface |
|---|---|---|---|
| `✕` | `AVOID` | Identical R1 side chain — high risk | Red "AVOID" |
| `△` | `CAUTION` | Similar R1 side chain | Amber "CAUTION" |
| `—` | `SELF` | Same drug (diagonal) | n/a |
| *blank* | `SAFE` | Dissimilar R1 — very low risk (<5%); the drug can be given | Green "LOW RISK" |

Tiers and severity live in `parseTable.js` (`TIERS`, `TIER_SEVERITY` where AVOID=2, CAUTION=1,
SAFE=SELF=0).

## Clinical safety invariants (DO NOT REGRESS)

1. **Unknown symbol = fail loud.** `normalizeSymbol` returns `null` for any non-empty,
   unrecognized cell, and `parseSheetData` **throws** — the whole table refuses to load and the
   UI shows a blocking error. An uninterpretable cell must NEVER be coerced to SAFE. (A blank /
   missing cell IS the SAFE case — that's different from unknown.)
2. **Blank = SAFE = "can give" (<5%).** This framing is intentional and clinician-approved. The
   tool assesses **R1 side chain only**.
3. **Every SAFE/low-risk surface must carry the caveat:** low risk is based on R1 side-chain
   similarity ONLY — it does not account for R2 side chains, severity of the original reaction,
   or non-side-chain mechanisms. Keep this on results, not buried in a disclaimer.
4. **Worst-case across multiple allergies.** A candidate's verdict = the most severe tier across
   all selected allergy rows (`assessCandidate`).
5. **Candidate-is-an-allergen → AVOID** ("same drug") before any matrix lookup.

## Safe Alternatives (naming)

The user-facing label is **"Safe Alternatives"** (not "Safer Alternatives"). This applies to the
`ResultsPanel` card title, `aria-label` on the table, and any other user-visible surface. Do not
revert to "Safer".

## EXCLUDED_FROM_ALTERNATIVES invariant

`assess.js` exports `EXCLUDED_FROM_ALTERNATIVES` — a `Set` of 5 drug names excluded from
`buildAlternatives()` output because they are not consistently available in the US market:

```
Cefaclor, Cefamandole, Cefoperazone, Ceftibuten, Cefotaxime
```

**These drugs remain fully present everywhere else**: allergy drop-down, candidate drop-down,
Full Table matrix. They are excluded ONLY from the safe-alternatives result. This is a deliberate
code constant (an intentional exception to the "all data in the spreadsheet" principle) because
US-availability filtering is not a cross-reactivity science concern.

`assess.test.js` has two invariant tests asserting none of the 5 ever appear in `alternatives`.
If you add or remove drugs from this list, update both the constant and those tests.

## Route data model

`ResultsPanel.jsx` exports a `DRUG_ROUTE` map (`{ [drugName]: 'IV' | 'PO' }`) used ONLY in the
Safe Alternatives table to show a small muted `(IV)` or `(PO)` tag after each drug name. This is
a code constant (another deliberate exception to the spreadsheet-only-data principle) because
route is a clinical convenience annotation, not cross-reactivity science. Any drug not in the map
gets no tag. Do NOT add route tags to the drop-downs, Why? breakdown, or Full Table matrix.

Current map (verified 2026-06-02):
- PO: Amoxicillin, Cefadroxil, Cephalexin, Cefprozil, Cefuroxime, Cefdinir, Cefixime, Cefpodoxime
- IV: Ampicillin, Oxacillin, Penicillin G, Piperacillin, Cefazolin, Cefotetan, Cefoxitin,
      Ceftazidime, Ceftriaxone, Cefepime, Ceftaroline, Ceftolozane, Cefiderocol, Ertapenem,
      Meropenem, Aztreonam

## Class color tokens

Nine CSS custom properties in `index.css :root` map drug classes to distinct hue accents used
in the Safe Alternatives table (colored left border on group header row + colored class label).
Colors are chosen to avoid confusion with the red/amber status colors:

| Token | Class | Color |
|---|---|---|
| `--class-color-penicillin`  | Penicillin | indigo (#6366f1) |
| `--class-color-1st`         | 1st Gen Ceph | cyan (#0891b2) |
| `--class-color-2nd`         | 2nd Gen Ceph | teal (#0d9488) |
| `--class-color-3rd`         | 3rd Gen Ceph | green (#16a34a) |
| `--class-color-4th`         | 4th Gen Ceph | olive (#4f7c20) |
| `--class-color-5th`         | 5th Gen Ceph | violet (#7c3aed) |
| `--class-color-siderophore` | Siderophore Ceph | amber-700 (#b45309) — distinct from UI amber |
| `--class-color-carbapenem`  | Carbapenem | sky (#0369a1) |
| `--class-color-monobactam`  | Monobactam | pink (#be185d) |

`CLASS_COLOR_TOKEN` in `ResultsPanel.jsx` maps the exact class-name strings from the spreadsheet
to these CSS variable references. If a class name changes in the data, update both the token name
and the map entry.

## Verdict logic (`assess.js`)

- `assessCandidate({ allergies, candidate, drugs, drugClass, matrix })` →
  `{ verdict: 'AVOID'|'CAUTION'|'SAFE'|'SAME_DRUG', driverRows, alternatives }`.
- `driverRows`: per-allergy breakdown for the "Why?" section.
- `alternatives` (`buildAlternatives`): every drug that is SAFE for **all** selected allergies,
  excluding the allergens, sorted by `CLASS_ORDER` (Penicillin → 1st…5th Gen Ceph → Siderophore
  → Carbapenem → Monobactam) then alphabetically.
- `verdictMeta(verdict, candidate)` provides label/icon/summary for the banner.

## UI structure

Two tabs (state in `App.jsx`: `tab`, `allergies[]`, `candidate`, `result`):

- **Cross-Reactivity Check** — `AllergySelect` (multi) + `CandidateSelect` (single, allergens
  excluded) + Check button → `ResultsPanel` (verdict banner, Why?, Safer Alternatives).
- **View Full Table** — `TableView`: interactive 29×29 matrix with:
  - **Single page-scroll model.** The table has NO inner scroll box — `.matrix-scroll` is
    `width: max-content` with `overflow` removed, so the whole **page** scrolls as one surface
    (no nested-scroll "break"). The app header is `position: fixed` (so it stays full-width
    during horizontal page scroll); `body` has `padding-top: 58px` to compensate. The drug-name
    header row (`.col-head`) and the "Allergy/Consider" corner are `position: sticky; top: 58px`
    (pinned below the fixed header); the allergy column (`.row-head`) is `sticky; left: 0`.
    **Do NOT re-add `overflow`/`max-height` to `.matrix-scroll`** — an inner scroll container
    re-introduces the scroll "break" and un-pins the column headers (sticky then sticks to the
    box, not the page). The `.matrix-overlay` divider layer is `z-index: 1` (below the sticky
    headers `z:2/3`) so the pinned header covers the lines behind it.
  - **Fixed table layout** (`table-layout: fixed` + a `<colgroup>`: row-head col 150px, every
    drug col 38px). This keeps all 29 columns identical width — without it the class-band labels
    of small classes stretch their columns. Do not remove the colgroup.
  - **Class band** (generation headers) split into ≤2 short tokens via `splitClassLabel`
    ("2nd Gen" / "Ceph"). Wide groups (3+ cols) render horizontally stacked; narrow groups
    (1–2 cols) render vertically. "Siderophore Ceph" is special-cased to just "Siderophore".
  - **Two-tone blue shading** alternating per class group on BOTH column and row headers
    (`--class-a` #34679a dark / `--class-b` #bcd6ef light; text color flips per shade).
    Jump-to-class buttons are color-matched via `CLASS_SHADE_COLORS`.
  - **Class dividers = absolutely-positioned overlay lines** (`.matrix-overlay` inside the
    `position:relative` `.matrix-scroll`), measured in a `useLayoutEffect` via
    `getBoundingClientRect().left/top - tableRect` (scroll-invariant). NOT per-cell borders or
    box-shadows — those get occluded by the sticky headers / overwritten by hover state, which
    caused the long-standing "navy line cut off" bug. See "Table rendering pitfalls" below.
  - **Hover crosshair** (row+col highlight) and **click-to-lock** focus with a plain-language
    readout ("Allergic to X → considering Y: AVOID — …")
  - **Search** scoped to the **allergy row** only; manual scroll subtracts the sticky header
    height so the matched row is not hidden (do not revert to `scrollIntoView`)
  - **Jump-to-class** scrolls the **candidate columns** by generation
  - **"Check this pair →"** button lifts the pair into the Check tab (`onCheckPair` prop) and
    runs the assessment
  - Keyboard: cells/headers are focusable with Enter/Space to select
  - **Saturated red/amber cell fills** with dark glyphs (matrix only — do not restyle the
    verdict banner, badges, legend, or focus readout)

### Table rendering pitfalls (learned the hard way)
- **Never put a per-render array in a hook dependency.** The overlay `useLayoutEffect` must
  depend on `[drugs]`, NOT `classGroups` (which is rebuilt every render) — the latter loops
  (measure → setState → re-render → measure…), throws "max update depth", and blanks the whole
  app. `npm run build` passes while the app is broken, so **always verify in the browser**.
- **Measure overlay positions with `getBoundingClientRect` relative to the table**, not
  `offsetLeft`/`offsetParent` accumulation — the sticky headers make the accumulation drift
  (~1 column), misaligning the dividers.
- The overlay lives inside `.matrix-scroll` and scrolls with content because both share the
  table's coordinate origin. `cellRect.left - tableRect.left` is scroll-invariant.

## Design tokens (`index.css :root`)

All components read CSS variables — never inline raw hex in JSX. Key tokens:
`--navy` (header/footer), `--blue`/`--blue-dk`/`--blue-lt`/`--blue-text` (primary action +
chips), `--avoid-*` / `--caution-*` / `--safe-*` (status), `--avoid-cell-bg`/`--caution-cell-bg`
(saturated matrix fills), `--class-a`/`--class-a-text`/`--class-b`/`--class-b-text` (the two-tone
class header shading), `--gy1..7` neutrals, `--rad`/`--rads` (radii). Single `VERSION` constant
in `App.jsx`.

## Deploy & Pages

- Push to `main` triggers `.github/workflows/deploy.yml`: `npm ci` → `npm test` → `npm run
  build` → upload `dist/` → deploy to Pages.
- **Pages source must be "GitHub Actions"** (not a branch). Set once:
  `gh api --method PUT /repos/jojohuhu-git/CrossRxBL/pages -f build_type=workflow`.
- Action versions are pinned to Node 24-compatible majors (checkout v6, setup-node v6,
  configure-pages v6, upload-pages-artifact v5, deploy-pages v5). The build itself uses Node 20
  (a current LTS) via `setup-node` — that's the app's build runtime, unrelated to the action
  deprecation.

## Updating the clinical table

For the designated admin (no coding): replace `public/BLcrossmap.xlsx` via GitHub's web UI and
commit — Pages redeploys automatically. Full steps + revert-to-prior-version (git history) are
in [`docs/UPDATING-THE-TABLE.md`](docs/UPDATING-THE-TABLE.md). Keep the spreadsheet layout
identical (square matrix, class row above the "Allergy To" header, ✕/△/—/blank symbols) or the
parser fails loud by design.

## Testing

- `npm test` (Vitest, node env). 39 tests across `parseTable.test.js` + `assess.test.js`.
- Parser tests MUST keep covering **unknown-symbol rejection** (the fail-loud invariant) and the
  blank=SAFE case.
- Verdict tests MUST keep covering worst-case-across-allergies, candidate-is-allergen, and the
  directional lookup.
- When changing parser or verdict logic, add/adjust a test in the same file.

## The ship loop (every change)

```
git checkout -b <branch>      # never commit straight to main
# edit, then:
npm test && npm run build      # verify the math/build
# verify in a browser too — build passing does NOT mean the app renders
# (a hook-dependency loop blanked the app while the build stayed green)
# UPDATE DOCS: reflect what changed in CLAUDE.md + HANDOFF.md (see below)
git status                     # check for stray generated files (.vite/, dist/, etc.)
git add -A && git commit -m "…"
git push -u origin <branch>
gh pr create --fill
gh pr merge <#> --squash --delete-branch   # merge -> auto-deploys
gh run watch <run-id> --exit-status        # confirm green
curl -s -o /dev/null -w "%{http_code}" https://jojohuhu-git.github.io/CrossRxBL/  # expect 200
```

**Docs are part of every ship (required).** Before committing a shippable change, update:
- **CLAUDE.md** — if architecture, the table internals, invariants, tokens, or the deploy setup
  changed.
- **HANDOFF.md** — always bump "Last updated" and add a one-line entry to the changelog of what
  shipped; update deferred items / decisions if they changed.
Treat a PR that changes behavior without a doc update as incomplete.

## Build-from-scratch checklist

1. `npm create vite@latest CrossRxBL -- --template react`; add `xlsx`, `vitest`.
2. `vite.config.js`: `base: '/CrossRxBL/'` + `test.environment: 'node'`.
3. Put `BLcrossmap.xlsx` in `public/`. Build `parseTable.js` (layout + symbol map + fail-loud)
   and `assess.js` (worst-case verdict + alternatives) per the invariants above.
4. Build the two tabs and the interactive table (see "UI structure").
5. Add the deploy workflow; enable Pages with the Actions source.
6. Write tests for the safety invariants. Keep `docs/UPDATING-THE-TABLE.md` current.
