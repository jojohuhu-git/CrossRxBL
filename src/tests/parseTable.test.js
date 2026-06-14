/**
 * Tests for parseTable.js
 *
 * Reads the real BLcrossmap.xlsx from disk to verify the parser against the
 * actual production file, plus unit tests with synthetic data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { read, utils } from 'xlsx';
import { parseSheetData, TIERS } from '../logic/parseTable.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = join(__dirname, '../../public/BLcrossmap.xlsx');

// Helper: load the real file and parse it
function loadRealTable() {
  const buf = readFileSync(XLSX_PATH);
  const wb = read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });
  return parseSheetData(rows);
}

// ── Real-file tests ────────────────────────────────────────────

describe('parseSheetData — real BLcrossmap.xlsx', () => {
  let table;
  try {
    table = loadRealTable();
  } catch (e) {
    // If file not found, skip gracefully with a failing test
    it('loads the xlsx file', () => {
      throw new Error(`Could not load ${XLSX_PATH}: ${e.message}`);
    });
    return;
  }

  it('parses 29 drugs', () => {
    expect(table.drugs).toHaveLength(29);
  });

  it('includes expected drugs', () => {
    expect(table.drugs).toContain('Amoxicillin');
    expect(table.drugs).toContain('Aztreonam');
    expect(table.drugs).toContain('Meropenem');
    expect(table.drugs).toContain('Cefazolin');
  });

  it('assigns correct drug classes', () => {
    expect(table.drugClass['Amoxicillin']).toBe('Penicillin');
    expect(table.drugClass['Cefazolin']).toBe('1st Gen Ceph');
    expect(table.drugClass['Meropenem']).toBe('Carbapenem');
    expect(table.drugClass['Aztreonam']).toBe('Monobactam');
    expect(table.drugClass['Cefiderocol']).toBe('Siderophore Ceph');
  });

  it('marks diagonal as SELF', () => {
    for (const drug of table.drugs) {
      if (table.matrix[drug] && table.matrix[drug][drug] !== undefined) {
        expect(table.matrix[drug][drug]).toBe(TIERS.SELF);
      }
    }
  });

  it('Amoxicillin → Cefadroxil is AVOID (identical R1)', () => {
    // Row 3 shows ✕ for Amoxicillin → Cefadroxil
    expect(table.matrix['Amoxicillin']['Cefadroxil']).toBe(TIERS.AVOID);
  });

  it('Amoxicillin → Ampicillin is CAUTION (similar R1)', () => {
    expect(table.matrix['Amoxicillin']['Ampicillin']).toBe(TIERS.CAUTION);
  });

  it('Amoxicillin → Meropenem is SAFE (blank = dissimilar)', () => {
    expect(table.matrix['Amoxicillin']['Meropenem']).toBe(TIERS.SAFE);
  });

  it('Aztreonam → Ceftazidime is AVOID (shared R1 side chain)', () => {
    expect(table.matrix['Aztreonam']['Ceftazidime']).toBe(TIERS.AVOID);
  });

  it('stores both directions of every pair (full population)', () => {
    // The production matrix is chemically symmetric (R1 similarity is a
    // symmetric relation), so a transpose bug cannot be caught on the real
    // file — the synthetic asymmetric fixture below is the real transpose
    // guard. What we CAN assert here is that every directional cell is
    // populated (no undefined), which H1 row-completeness now guarantees.
    const amoxToCefaz = table.matrix['Amoxicillin']['Cefazolin'];
    const cefazToAmox = table.matrix['Cefazolin']['Amoxicillin'];
    expect(amoxToCefaz).not.toBeUndefined();
    expect(cefazToAmox).not.toBeUndefined();
  });

  it('has no unknown symbols (no parse warnings about unknown symbols)', () => {
    const unknownWarnings = table.parseWarnings.filter(w => w.includes('Unknown symbol'));
    expect(unknownWarnings).toHaveLength(0);
  });
});

// ── Synthetic data tests ───────────────────────────────────────

describe('parseSheetData — synthetic data', () => {
  function makeRows({ drugs, classRow, dataRows, extraRows = [] }) {
    const title = ['Title', ...Array(drugs.length).fill('')];
    const cls = ['Drug Class →', ...classRow];
    const header = ['Allergy To ↓ \\ Consider →', ...drugs];
    const data = dataRows.map(([rowLabel, ...cells]) => [rowLabel, ...cells]);
    return [title, cls, header, ...data, ...extraRows];
  }

  it('throws if header row is missing', () => {
    const rows = [
      ['Title', '', ''],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['No allergy row here', 'DrugA', 'DrugB'],
      ['DrugA', '—', ''],
      ['DrugB', '', '—'],
    ];
    expect(() => parseSheetData(rows)).toThrow('Could not find the header row');
  });

  it('throws if fewer than 4 rows', () => {
    expect(() => parseSheetData([['a'], ['b']])).toThrow('fewer than 4 rows');
  });

  it('throws if no data rows below header', () => {
    const rows = [
      ['Drug Class →', 'Penicillin', 'Penicillin'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      // No data rows
    ];
    // Only 2 rows — will fail with "fewer than 4" first
    expect(() => parseSheetData(rows)).toThrow();
  });

  it('maps ✕ → AVOID, △ → CAUTION, — → SELF, blank → SAFE', () => {
    const rows = makeRows({
      drugs: ['DrugA', 'DrugB'],
      classRow: ['ClassX', 'ClassX'],
      dataRows: [
        ['DrugA', '—', '✕'],
        ['DrugB', '△', '—'],
      ],
    });
    const { matrix } = parseSheetData(rows);
    expect(matrix['DrugA']['DrugA']).toBe(TIERS.SELF);
    expect(matrix['DrugA']['DrugB']).toBe(TIERS.AVOID);
    expect(matrix['DrugB']['DrugA']).toBe(TIERS.CAUTION);
    expect(matrix['DrugB']['DrugB']).toBe(TIERS.SELF);
  });

  it('blank/null cell → SAFE', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—', ''],   // empty string
      ['DrugB', null, '—'], // null
    ];
    const { matrix } = parseSheetData(rows);
    expect(matrix['DrugA']['DrugB']).toBe(TIERS.SAFE);
    expect(matrix['DrugB']['DrugA']).toBe(TIERS.SAFE);
  });

  it('throws on an unrecognized symbol — never coerces it to SAFE', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—', 'UNKNOWN_SYMBOL'],
      ['DrugB', '', '—'],
    ];
    expect(() => parseSheetData(rows)).toThrow('Unrecognized symbol');
  });

  it('carries forward class name across blank columns', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'Penicillin', null, null, '1st Gen Ceph', null],
      ['Allergy To ↓', 'Amox', 'Amp', 'Pen', 'CefA', 'CefB'],
      ['Amox', '—', '', '', '', ''],
      ['Amp', '', '—', '', '', ''],
      ['Pen', '', '', '—', '', ''],
      ['CefA', '', '', '', '—', ''],
      ['CefB', '', '', '', '', '—'],
    ];
    const { drugClass } = parseSheetData(rows);
    expect(drugClass['Amox']).toBe('Penicillin');
    expect(drugClass['Amp']).toBe('Penicillin');
    expect(drugClass['Pen']).toBe('Penicillin');
    expect(drugClass['CefA']).toBe('1st Gen Ceph');
    expect(drugClass['CefB']).toBe('1st Gen Ceph');
  });

  it('stops reading at LEGEND: row', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—', '✕'],
      ['DrugB', '△', '—'],
      [''],
      ['LEGEND:', '✕', 'Identical R1...'],
    ];
    // Should parse OK and not try to treat LEGEND as a drug row
    const { drugs } = parseSheetData(rows);
    expect(drugs).toHaveLength(2);
  });

  // ── H1: a header drug whose data row is missing must fail loud ──
  it('throws if a header drug has no data row (missing row → would be falsely SAFE)', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—', '✕'],
      // DrugB row is absent entirely
    ];
    expect(() => parseSheetData(rows)).toThrow(/no data row/i);
    expect(() => parseSheetData(rows)).toThrow(/DrugB/);
  });

  it('throws if a data-row label is mistyped (real drug ends up with no row)', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—', '✕'],
      ['DrugBB', '△', '—'], // typo → skipped → DrugB has no row
    ];
    expect(() => parseSheetData(rows)).toThrow(/DrugB/);
  });

  // ── M1: a truncated data row must fail loud, never coerce trailing → SAFE ──
  it('throws if a data row is truncated (dropped trailing column)', () => {
    const rows = [
      ['Title'],
      ['Drug Class →', 'ClassX', 'ClassX'],
      ['Allergy To ↓', 'DrugA', 'DrugB'],
      ['DrugA', '—'],        // missing the DrugB cell — must NOT read as SAFE
      ['DrugB', '✕', '—'],
    ];
    expect(() => parseSheetData(rows)).toThrow(/missing data/i);
  });

  // ── M2: intended visual glyph variants are accepted ──
  it('accepts × (U+00D7) and ▲ as AVOID/CAUTION variants', () => {
    const rows = makeRows({
      drugs: ['DrugA', 'DrugB'],
      classRow: ['ClassX', 'ClassX'],
      dataRows: [
        ['DrugA', '—', '×'], // × multiplication sign (autocorrect of ✕)
        ['DrugB', '▲', '—'], // ▲ black up-pointing triangle
      ],
    });
    const { matrix } = parseSheetData(rows);
    expect(matrix['DrugA']['DrugB']).toBe(TIERS.AVOID);
    expect(matrix['DrugB']['DrugA']).toBe(TIERS.CAUTION);
  });

  it('still throws on a genuinely unknown glyph (fail-loud preserved)', () => {
    const rows = makeRows({
      drugs: ['DrugA', 'DrugB'],
      classRow: ['ClassX', 'ClassX'],
      dataRows: [
        ['DrugA', '—', '?'],
        ['DrugB', '', '—'],
      ],
    });
    expect(() => parseSheetData(rows)).toThrow('Unrecognized symbol');
  });

  // ── M4: directionality is stored independently (transpose guard) ──
  it('stores an asymmetric pair directionally (A→B ≠ B→A)', () => {
    const rows = makeRows({
      drugs: ['DrugA', 'DrugB'],
      classRow: ['ClassX', 'ClassX'],
      dataRows: [
        ['DrugA', '—', '✕'], // A→B = AVOID
        ['DrugB', '',  '—'], // B→A = SAFE (blank)
      ],
    });
    const { matrix } = parseSheetData(rows);
    expect(matrix['DrugA']['DrugB']).toBe(TIERS.AVOID);
    expect(matrix['DrugB']['DrugA']).toBe(TIERS.SAFE);
  });
});
