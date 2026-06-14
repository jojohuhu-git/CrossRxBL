/**
 * parseTable.js
 *
 * Parses the BLcrossmap.xlsx spreadsheet into a structured table object.
 *
 * Expected spreadsheet layout (Sheet1):
 *   Row 0  : Title row (ignored)
 *   Row 1  : "Drug Class →" in col A, then class labels (merged/carried forward)
 *   Row 2  : "Allergy To ↓" in col A, then drug names (one per column)
 *   Rows 3+ : One drug per row. Col A = allergy drug name; cols 1..N = matrix cells
 *   Below matrix: blank rows, then LEGEND block (ignored by parser)
 *
 * Symbol -> tier mapping:
 *   ✕  -> AVOID
 *   △  -> CAUTION
 *   —  -> SELF   (same drug, diagonal)
 *   ''  -> SAFE   (blank = dissimilar R1 side chain, very low risk)
 *
 * Returns: { drugs, drugClass, matrix, parseWarnings }
 *   drugs       : string[]         ordered list of 29 drug names
 *   drugClass   : {[drug]: string} drug -> class name
 *   matrix      : {[allergyDrug]: {[candidateDrug]: 'AVOID'|'CAUTION'|'SAFE'|'SELF'}}
 *   parseWarnings: string[]        any non-fatal issues noted during parsing
 *
 * Throws: Error with a descriptive message if the file is malformed.
 */

export const TIERS = {
  AVOID: 'AVOID',
  CAUTION: 'CAUTION',
  SAFE: 'SAFE',
  SELF: 'SELF',
};

// Severity order for worst-case logic (higher = worse)
export const TIER_SEVERITY = {
  SAFE: 0,
  SELF: 0,   // SELF is not worse than SAFE for cross-drug decisions
  CAUTION: 1,
  AVOID: 2,
};

// Single source of truth for tier → display glyph, shared across every view
// (assess driver rows, ResultsPanel "why", TableView). Defined with explicit
// \u escapes so an editor can't silently collapse look-alikes. Note: TableView
// intentionally renders SAFE as an empty cell for matrix density (documented
// there); every other surface uses these.
export const TIER_GLYPH = {
  AVOID: '✕',   // ✕  multiplication X
  CAUTION: '△', // △  white up-pointing triangle
  SELF: '—',    // —  em dash (diagonal / same drug)
  SAFE: '○',    // ○  white circle
};

function normalizeSymbol(raw) {
  // A missing or blank cell is the SAFE case (dissimilar R1 side chain).
  // NOTE: an *absent* cell (row truncated — index past row.length) is handled
  // by the caller as a fatal structural error, NOT routed here, so a dropped
  // column can never be coerced to SAFE. An explicit null/'' cell is genuinely
  // blank and IS the SAFE case.
  if (raw === null || raw === undefined) return TIERS.SAFE;
  const s = String(raw).trim();
  // Avoid: accept the intended visual variants (autocorrect/keyboard substitutes).
  if (s === '✕' || s === '✖' || s === '×' || s === '❌') return TIERS.AVOID; // ✕ ✖ × ❌
  // Caution: accept filled triangle and warning sign as variants of △.
  if (s === '△' || s === '▲' || s === '⚠') return TIERS.CAUTION; // △ ▲ ⚠
  // Self (diagonal): em dash, en dash, or ASCII hyphen.
  if (s === '—' || s === '–' || s === '-') return TIERS.SELF; // — – -
  if (s === '') return TIERS.SAFE;
  return null; // unknown — caller refuses to load the table (fail loud)
}

/**
 * Parse a 2D array (from XLSX.utils.sheet_to_json with header:1, defval:'')
 * into the structured table.
 */
export function parseSheetData(rows) {
  if (!Array.isArray(rows) || rows.length < 4) {
    throw new Error(
      'Spreadsheet has fewer than 4 rows — expected a title row, class row, header row, and at least one data row.'
    );
  }

  // Find the header row: the row where col A contains "Allergy To"
  let headerRowIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const cellA = String(rows[r][0] || '').trim();
    if (cellA.startsWith('Allergy To')) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx < 0) {
    throw new Error(
      'Could not find the header row. Expected a cell in column A containing "Allergy To". ' +
      'Check that the spreadsheet has not been reformatted.'
    );
  }

  const classRowIdx = headerRowIdx - 1;
  if (classRowIdx < 0) {
    throw new Error(
      'Class row expected immediately above the "Allergy To" header row, but the header is on row 1.'
    );
  }

  const headerRow = rows[headerRowIdx];
  const classRow = rows[classRowIdx];

  // Drug names: columns 1..N in the header row (skip col A), stop at first null/empty
  const drugs = [];
  for (let c = 1; c < headerRow.length; c++) {
    const name = headerRow[c];
    if (name === null || name === undefined || String(name).trim() === '') break;
    drugs.push(String(name).trim());
  }

  if (drugs.length < 2) {
    throw new Error(
      `Only ${drugs.length} drug name(s) found in the header row. Expected at least 2. ` +
      'Check that the spreadsheet format matches the expected layout.'
    );
  }

  // Class map: carry forward the class name across blank/merged cells
  const drugClass = {};
  let lastClass = '';
  for (let i = 0; i < drugs.length; i++) {
    const raw = classRow[i + 1]; // offset by 1 for col A
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      lastClass = String(raw).trim();
    }
    drugClass[drugs[i]] = lastClass;
  }

  const drugSet = new Set(drugs);
  const parseWarnings = [];

  // Build matrix from data rows (starting right after headerRowIdx)
  const matrix = {};
  for (const drug of drugs) matrix[drug] = {};

  const dataStartIdx = headerRowIdx + 1;
  let rowsProcessed = 0;
  const seenRows = new Set();

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    const allergyDrug = String(row[0] || '').trim();

    // Stop at blank row or legend block
    if (!allergyDrug || allergyDrug === 'LEGEND:') break;

    if (!drugSet.has(allergyDrug)) {
      parseWarnings.push(
        `Row ${r + 1}: row label "${allergyDrug}" is not in the drug list — skipped.`
      );
      continue;
    }

    for (let c = 0; c < drugs.length; c++) {
      const candidateDrug = drugs[c];

      // Clinical safety (M1): a *truncated* row — one with fewer cells than the
      // header has drug columns — must NEVER silently read its missing trailing
      // cells as SAFE. An out-of-range index (c + 1 >= row.length) means the cell
      // is absent (a dropped column / deleted block), distinct from an explicitly
      // blank cell ('' or null) which is the legitimate SAFE case. Fail loud.
      if (c + 1 >= row.length) {
        throw new Error(
          `Row "${allergyDrug}" is missing data: it has ${Math.max(0, row.length - 1)} ` +
          `cell(s) but ${drugs.length} drug columns are expected (missing from column ` +
          `"${candidateDrug}" onward). A truncated row would silently read as "safe" — ` +
          'the table was not loaded. Restore the full row in the spreadsheet and re-upload.'
        );
      }

      const rawCell = row[c + 1]; // offset by 1 for col A
      const tier = normalizeSymbol(rawCell);

      if (tier === null) {
        // Clinical safety: an unrecognized symbol must NEVER be coerced to SAFE.
        // Refuse to load the whole table rather than risk a false "safe to give".
        const sym = String(rawCell ?? '');
        throw new Error(
          `Unrecognized symbol "${sym}" at row "${allergyDrug}" / column "${candidateDrug}". ` +
          'Allowed cell values are ✕ (avoid), △ (caution), — (same drug), or blank (safe). ' +
          'Fix this cell in the spreadsheet and re-upload — the table was not loaded.'
        );
      }
      matrix[allergyDrug][candidateDrug] = tier;
    }
    rowsProcessed++;
    seenRows.add(allergyDrug);
  }

  if (rowsProcessed === 0) {
    throw new Error('No valid data rows found below the header row.');
  }

  // Clinical safety (H1): every drug in the header MUST have a fully populated
  // data row. A drug present as a column but missing its row (deleted, blank,
  // cut off by an early blank/LEGEND row, or mistyped so it was skipped above)
  // leaves matrix[drug] = {} — and assessCandidate would then read every
  // candidate as SAFE-by-default for a patient with that allergy. Refuse to
  // load rather than ship a falsely-"safe" table.
  const missingRows = drugs.filter((d) => !seenRows.has(d));
  if (missingRows.length > 0) {
    throw new Error(
      `These drug(s) appear in the header but have no data row: ${missingRows.join(', ')}. ` +
      'A missing row would make every candidate read as "low risk" for that allergy — ' +
      'the table was not loaded. Add the missing row(s) (check for typos in the row label) and re-upload.'
    );
  }

  return { drugs, drugClass, matrix, parseWarnings };
}

/**
 * Load and parse the xlsx file in a browser environment.
 * Dynamically imports the xlsx package to avoid SSR issues.
 *
 * @param {string} url - URL to the xlsx file
 * @returns {Promise<{drugs, drugClass, matrix, parseWarnings, fileName, drugCount}>}
 */
export async function loadTableFromUrl(url) {
  const XLSX = await import('xlsx');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch table file: HTTP ${response.status} ${response.statusText}. ` +
      `URL: ${url}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The Excel file contains no sheets.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('Could not read Sheet1 from the Excel file.');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const result = parseSheetData(rows);

  // Extract filename from URL
  const fileName = url.split('/').pop() || 'BLcrossmap.xlsx';

  return {
    ...result,
    fileName,
    drugCount: result.drugs.length,
  };
}
