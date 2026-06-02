# CrossRxBL — Beta-Lactam Cross-Reactivity Tool

A client-side React single-page application that helps clinicians quickly assess
the cross-reactivity risk between a patient's beta-lactam allergies and a
candidate antibiotic.

**No backend. No login. No upload.** The cross-reactivity table is bundled with
the app and loaded in the browser at startup.

Live site: <https://jojohuhu-git.github.io/CrossRxBL/>

---

## What it does

1. The clinician selects one or more **allergy drugs** the patient has reacted to.
2. The clinician picks a **candidate antibiotic** they want to give.
3. The app looks up the R1 side-chain similarity between each allergen and the
   candidate in the bundled Excel table and returns the worst-case verdict:

| Verdict | Meaning |
|---------|---------|
| **AVOID** (red) | Identical R1 side chain — high cross-reactivity risk |
| **CAUTION** (amber) | Similar R1 side chain — some risk |
| **LOW RISK** (green) | Dissimilar R1 side chain — <5% cross-reactivity risk |

The tool also lists **safer alternatives** — every drug in the table that is
SAFE for **all** selected allergies, grouped by drug class.

### Important limitation

R1 side-chain similarity is the primary driver of beta-lactam cross-reactivity,
but this tool does **not** account for:
- R2 side chains
- Severity of the patient's original reaction
- IgE-mediated vs. non-IgE-mediated mechanisms
- Patient-specific factors

Always apply clinical judgment. See the in-app disclaimer.

---

## Running locally

### Prerequisites
- Node.js 20+
- npm 10+

### Commands

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:5173/CrossRxBL/)
npm run dev

# Run the test suite
npm test

# Build for production (output to dist/)
npm run build

# Preview the production build locally
npm run preview
```

---

## Project structure

```
CrossRxBL/
  public/
    BLcrossmap.xlsx          The cross-reactivity table (do not rename)
  src/
    main.jsx                 React entry point
    App.jsx                  Root component: layout, state, data loading
    index.css                Global styles (CSS custom properties)
    logic/
      parseTable.js          Spreadsheet parser — pure functions, no DOM
      assess.js              Verdict + alternatives logic — pure functions
    components/
      AllergySelect.jsx      Multi-select typeahead for allergy drugs
      ResultsPanel.jsx       Verdict banner, Why? section, alternatives table
    tests/
      parseTable.test.js     Unit + integration tests for the parser
      assess.test.js         Unit + integration tests for the verdict logic
  .github/workflows/
    deploy.yml               CI: test → build → deploy to GitHub Pages
  vite.config.js             Vite config (base: /CrossRxBL/)
  docs/
    UPDATING-THE-TABLE.md    Non-coder admin guide for updating the table
```

---

## Parser assumptions

The parser reads `public/BLcrossmap.xlsx` (Sheet1) and expects:

| Row | Content |
|-----|---------|
| Row 0 | Title (ignored) |
| Row 1 | `"Drug Class →"` in col A, then drug class labels. Blank cells carry the class forward (handles merged cells). |
| Row 2 | `"Allergy To ↓"` in col A (the header row), then drug names left-to-right. |
| Rows 3–N | One drug per row. Col A = allergy drug; cols B onward = cross-reactivity symbols. |
| Below matrix | Blank rows, then `LEGEND:` row (parser stops here). |

**Symbol → tier mapping:**

| Symbol | Tier |
|--------|------|
| `✕` | AVOID |
| `△` | CAUTION |
| `—` | SELF (same drug, diagonal) |
| *blank* | SAFE |

Unknown symbols produce a parse warning (shown in the UI) but are treated as
SAFE to avoid silent failures. The parser throws a descriptive error if the file
is missing, lacks the `"Allergy To"` header row, or has no data rows — it will
never silently produce wrong results.

---

## Updating the table

See [`docs/UPDATING-THE-TABLE.md`](docs/UPDATING-THE-TABLE.md) for the
non-coder admin workflow (GitHub web UI only, no command line needed).
