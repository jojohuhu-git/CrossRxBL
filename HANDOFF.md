# CrossRxBL — Handoff & Status

Snapshot of where the project stands, the decisions behind it, what's deliberately deferred,
and recurring maintenance. Pair this with [`CLAUDE.md`](CLAUDE.md) (architecture / rebuild guide).

Last updated: 2026-06-02.

## Status: SHIPPED & LIVE

- Live: https://jojohuhu-git.github.io/CrossRxBL/
- `main` is deployed via GitHub Actions; every push to `main` redeploys.
- 39 unit tests passing; build clean.

## What's built (done)

- **Cross-Reactivity Check tab** — multi-allergy select + candidate select → Avoid / Caution /
  Low-risk verdict, per-allergy "Why?" breakdown, and a Safer-Alternatives table grouped by
  class.
- **View Full Table tab** — interactive 29×29 matrix: class bands by generation, continuous
  class dividers, hover crosshair, click-to-lock plain-language readout, allergy-row search
  (sticky-header-aware scroll), jump-to-class column nav, "Check this pair →" cross-tab handoff,
  keyboard-selectable cells, and saturated red/amber fills.
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
