# How to Update the Cross-Reactivity Table

**Audience:** the one designated administrator who controls the table for your hospital.
**No coding or command line required — everything below is done on github.com.**

The app reads a single Excel file as its source of truth:

```
public/BLcrossmap.xlsx
```

Whatever is committed there is what every clinician sees on the live site. Change that
file and the live app updates automatically (about 1 minute later).

---

## Publish a new table

1. Go to the repository on GitHub: <https://github.com/jojohuhu-git/CrossRxBL>
2. Open the **`public`** folder, then click **`Add file → Upload files`**.
3. Drag in your new Excel file. **It must be named exactly `BLcrossmap.xlsx`** so it
   replaces the current one.
4. Scroll down to **Commit changes**, type a short note (e.g. `Update table – June 2026`),
   and click **Commit changes**.
5. Wait ~1 minute. The live site rebuilds and shows the new table automatically.

> Keep the spreadsheet layout the same as the original (one square matrix, the class row
> above the drug-name header, and the `✕ / △ / — / blank` symbols). The app validates the
> file on load — if something is wrong it shows an error instead of bad advice.

### What the symbols mean
| Symbol | Meaning | Result in app |
|--------|---------|---------------|
| `✕` | Identical R1 side chain — high risk | **AVOID** (red) |
| `△` | Similar R1 side chain | **CAUTION** (amber) |
| `—` | Same drug (diagonal) | self |
| *blank* | Dissimilar R1 side chain, very low risk (<5%) | **SAFE — can give** (green) |

---

## Control who can change the table

Only people added as repository collaborators can publish a new table. Everyone else just
uses the live link and cannot change anything.

- On GitHub: **Settings → Collaborators** → add or remove people.
- Keep this to **one administrator** for your hospital.

---

## See past versions / revert to an older table

Git keeps every version ever committed — nothing is lost.

1. Open **`public/BLcrossmap.xlsx`** on GitHub and click **History** (top-right of the file).
2. You'll see every version with the date and who changed it. Click any version to view or
   download it.
3. **To revert:** download the older version, then repeat the *Publish a new table* steps
   above to upload it again. The old table goes live, and the change is itself recorded in
   history.

---

## The live app
<https://jojohuhu-git.github.io/CrossRxBL/>

Clinicians only need this link. They cannot upload or edit — the table is read-only for them.
