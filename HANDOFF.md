# CrossRxBL — Handoff & Status

Snapshot of where the project stands, the decisions behind it, what's deliberately deferred,
and recurring maintenance. Pair this with [`CLAUDE.md`](CLAUDE.md) (architecture / rebuild guide).

Last updated: 2026-06-02 (feat/safe-alternatives-route-colors).

> **Update this file (and CLAUDE.md) on every ship.** Bump "Last updated", add a Changelog
> entry, and revise decisions/deferred items if they changed. A behavior change without a doc
> update is an incomplete PR.

## Status: SHIPPED & LIVE

- Live: https://jojohuhu-git.github.io/CrossRxBL/
- `main` is deployed via GitHub Actions; every push to `main` redeploys.
- 39 unit tests passing; build clean.

## Changelog (most recent first)

- **2026-06-02 — Safe Alternatives UX polish** (feat/safe-alternatives-route-colors): allergy
  drop-down closes on each selection; 5 US-unavailable drugs (Cefaclor, Cefamandole,
  Cefoperazone, Ceftibuten, Cefotaxime) excluded from safe-alternatives output (still in
  drop-downs + Full Table); "Safer" → "Safe Alternatives" throughout; class color-coding in the
  alternatives table — every drug row is shaded with a pale per-class tint plus a full-height
  accent bar, and the 9 hues alternate warm/cool down the list so adjacent classes never sit
  close in tone; IV/PO route tags in alternatives table only. Removed the emoji icon from the
  verdict banner (🚫/⚠️/✅) — the verdict is already conveyed by per-status background shading,
  colored left border, and colored label. 41 tests pass.
- **2026-06-02 — Single page-scroll + legend colors** (PR #6): removed the table's inner scroll
  box so the whole page scrolls as one smooth surface; app header is now `fixed` and the
  drug-name row + allergy column stay pinned (column headers at `top:58px`, allergy column at
  `left:0`) including during horizontal scroll. Legend swatches updated to the saturated cell
  colors so they match the table. Divider overlay dropped to `z-index:1` so the pinned header
  covers it.
- **2026-06-02 — Table readability overhaul** (PR #4): fixed-layout uniform 38px columns;
  class labels split into short tokens (Siderophore shortened); two-tone blue shading
  (`#34679a`/`#bcd6ef`) alternating per class on both axes with color-matched jump buttons;
  class dividers reimplemented as `getBoundingClientRect`-measured overlay lines (continuous,
  aligned, not occluded by sticky headers). Caught + fixed an infinite-render-loop crash and a
  divider misalignment during browser verification.
- **2026-06-02 — Docs** (PR #3): added CLAUDE.md + HANDOFF.md.
- **2026-06-02 — CI hardening** (PR #2): bumped GitHub Actions to Node 24-compatible majors.
- **2026-06-02 — Initial release** (PR #1): full app — Check tab, Full Table tab, fail-loud
  parser, Pages deploy, admin update guide.

## What's built (done)

- **Cross-Reactivity Check tab** — multi-allergy select (closes on each selection) + candidate
  select → Avoid / Caution / Low-risk verdict, per-allergy "Why?" breakdown, and a Safe
  Alternatives table grouped by class (class-color accents, IV/PO route tags).
- **View Full Table tab** — interactive 29×29 matrix: single page-scroll (fixed app header,
  drug-name row + allergy column pinned), fixed-layout uniform columns, two-tone blue class
  shading on both axes (color-matched jump buttons), split class-band labels, overlay class
  dividers (continuous + aligned), hover crosshair, click-to-lock plain-language readout,
  allergy-row search, jump-to-class column nav, "Check this pair →" cross-tab handoff,
  keyboard-selectable cells, and saturated red/amber fills (legend swatches match).
- **Single source of truth** — `public/BLcrossmap.xlsx`, parsed in-browser; nothing hardcoded.
- **Fail-loud parser** — unknown cell symbols block the load instead of being treated as safe.
- **Shield favicon** (`public/favicon.svg`); blue palette matched to the reference mockup.
- **Admin update guide** — `docs/UPDATING-THE-TABLE.md` (non-coder, web-UI only).
- **CI/CD** — `.github/workflows/deploy.yml`; Pages source = GitHub Actions.

## Key decisions & rationale (so they aren't relitigated)

- **No backend; the GitHub repo IS the shared table.** Requirement: one shared table, one
  controller per hospital, read-only for clinicians, with version history + revert. Git delivers
  all of that for free (admin commits via web UI; `git` history = versioning; collaborators =
  access control). A backend (Supabase/Firebase) was considered and deferred — only needed for
  true multi-hospital tenancy or real per-user logins.
- **No runtime upload in the deployed app.** An earlier localStorage-upload idea was dropped:
  localStorage is per-browser/per-device, so it can't be the *shared* source of truth and would
  let clinicians diverge from the official table. Updates go through the repo instead.
- **Blank cell = SAFE, <5%, "can give."** Clinician-confirmed framing. Tool scope is R1 side
  chain only; the caveat is shown on every low-risk result.
- **Unknown symbol fails loud.** Clinical safety: never render "safe to give" for a cell nobody
  scored. (Caught and fixed during the initial build — the agent had defaulted unknowns to SAFE.)
- **Directional matrix.** Allergy = row, candidate = column; symmetry is not assumed.
- **Vibrancy via background, not symbol.** Saturated cell fills read fastest across a dense grid;
  symbols kept dark for contrast.
- **Class dividers via inset box-shadow,** because per-cell `border` drops out on tinted cells
  under `border-collapse: collapse`.

## Deferred / not done (intentional)

- **Multi-hospital tenancy / per-user logins** — would require a backend. Not built; current
  model is one shared table per deployment. To split per hospital short-term: fork the repo /
  separate Pages deployment.
- **Arrow-key grid navigation** in the table — cells are focusable with Enter/Space select;
  full arrow-key movement was left out to avoid sticky-scroll complications.
- **Print / export of a result** — not implemented.
- **Header logo** — the shield is the favicon only; it is not (yet) placed next to the title in
  the app header. (Reference mockup had it there.)

## Recurring maintenance

- **GitHub Actions runtime deprecations.** Actions are pinned to Node 24-compatible majors
  (bumped 2026-06-02, ahead of the 2026-06-16 Node 20 removal). When CI logs show a runtime
  deprecation annotation, bump the action majors — check latest with
  `gh api repos/actions/<name>/releases/latest --jq .tag_name`.
- **The clinical table itself** is owned by the medical admin, not code. If the science changes,
  the admin replaces `public/BLcrossmap.xlsx` (see the admin guide). No code change needed unless
  the spreadsheet *layout* changes (then update `parseTable.js` and its tests).
- **Node build version.** `setup-node` installs Node 20 for the build; bump to a newer LTS when
  20 nears end of life.

## Repro tips for the next session

- Dev server runs at `http://localhost:5173/CrossRxBL/` — the `/CrossRxBL/` path is required
  (base path); plain `localhost:5173` 404s.
- The preview/verification tooling in this workspace is bound to a different project root; to
  preview CrossRxBL, run `npm run dev` and open the URL (or point a browser preview at port 5173).
- Specific manual check that has caught regressions: on the Full Table tab, search `cefaclor` →
  the Cefaclor **row** highlights and is fully visible below the sticky header, and the Cefaclor
  **column** is NOT highlighted.
- **Always verify the Full Table in a browser, not just `npm run build`.** A bad hook dependency
  (a per-render array like `classGroups` in a `useLayoutEffect` dep) caused an infinite render
  loop that blanked the whole app while the build stayed green. If the page is blank, check the
  browser console for "Maximum update depth exceeded".
- Class-divider overlay lines must be measured with `getBoundingClientRect` relative to the
  table (not `offsetLeft` accumulation) or they drift ~1 column and misalign.
- `git status` before committing: Vite's `.vite/` cache (now gitignored) and `dist/` should
  never be committed.
