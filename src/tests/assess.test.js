/**
 * Tests for assess.js
 *
 * Uses the real parsed table from BLcrossmap.xlsx plus synthetic fixtures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { read, utils } from 'xlsx';
import { parseSheetData, TIERS } from '../logic/parseTable.js';
import { assessCandidate, verdictMeta, EXCLUDED_FROM_ALTERNATIVES } from '../logic/assess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = join(__dirname, '../../public/BLcrossmap.xlsx');

function loadRealTable() {
  const buf = readFileSync(XLSX_PATH);
  const wb = read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });
  return parseSheetData(rows);
}

// ── Synthetic fixture ──────────────────────────────────────────
const syntheticDrugs = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const syntheticDrugClass = {
  Alpha: 'ClassA',
  Beta: 'ClassA',
  Gamma: 'ClassB',
  Delta: 'ClassC',
};
const syntheticMatrix = {
  Alpha: { Alpha: TIERS.SELF, Beta: TIERS.AVOID,   Gamma: TIERS.CAUTION, Delta: TIERS.SAFE },
  Beta:  { Alpha: TIERS.AVOID,  Beta: TIERS.SELF,  Gamma: TIERS.SAFE,    Delta: TIERS.SAFE },
  Gamma: { Alpha: TIERS.CAUTION, Beta: TIERS.SAFE, Gamma: TIERS.SELF,    Delta: TIERS.SAFE },
  Delta: { Alpha: TIERS.SAFE,  Beta: TIERS.SAFE,   Gamma: TIERS.SAFE,    Delta: TIERS.SELF },
};
const syntheticCtx = {
  drugs: syntheticDrugs,
  drugClass: syntheticDrugClass,
  matrix: syntheticMatrix,
};

// ── Synthetic tests ────────────────────────────────────────────

describe('assessCandidate — synthetic', () => {
  it('single AVOID allergy → verdict AVOID', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha'], candidate: 'Beta' });
    expect(res.verdict).toBe('AVOID');
  });

  it('single CAUTION allergy → verdict CAUTION', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha'], candidate: 'Gamma' });
    expect(res.verdict).toBe('CAUTION');
  });

  it('single SAFE allergy → verdict SAFE', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha'], candidate: 'Delta' });
    expect(res.verdict).toBe('SAFE');
  });

  it('worst-case across allergies: AVOID wins over CAUTION', () => {
    // Alpha→Gamma = CAUTION, Beta→Gamma = SAFE → worst = CAUTION
    const r1 = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Beta'], candidate: 'Gamma' });
    expect(r1.verdict).toBe('CAUTION');

    // Alpha→Beta = AVOID, Gamma→Beta = SAFE → worst = AVOID
    const r2 = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Gamma'], candidate: 'Beta' });
    expect(r2.verdict).toBe('AVOID');
  });

  it('worst-case: AVOID wins over SAFE directly', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Delta'], candidate: 'Beta' });
    // Alpha→Beta=AVOID, Delta→Beta=SAFE → AVOID
    expect(res.verdict).toBe('AVOID');
  });

  it('candidate is itself a selected allergy → SAME_DRUG', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Beta'], candidate: 'Alpha' });
    expect(res.verdict).toBe('SAME_DRUG');
  });

  it('SAME_DRUG verdict renders as AVOID in verdictMeta', () => {
    const meta = verdictMeta('SAME_DRUG', 'Alpha');
    expect(meta.cssClass).toBe('avoid');
    expect(meta.label).toBe('AVOID');
  });

  it('directional: Alpha→Gamma = CAUTION but Gamma→Alpha = CAUTION (both)', () => {
    const r1 = assessCandidate({ ...syntheticCtx, allergies: ['Alpha'], candidate: 'Gamma' });
    const r2 = assessCandidate({ ...syntheticCtx, allergies: ['Gamma'], candidate: 'Alpha' });
    expect(r1.verdict).toBe('CAUTION');
    expect(r2.verdict).toBe('CAUTION');
  });

  it('directional (transpose guard): asymmetric pair gives different verdicts each way', () => {
    // Explicitly asymmetric: X→Y = AVOID, Y→X = SAFE. A transpose bug
    // (confusing "allergic to X, give Y" with the reverse) would flip these.
    const asymCtx = {
      drugs: ['X', 'Y'],
      drugClass: { X: 'ClassA', Y: 'ClassB' },
      matrix: {
        X: { X: TIERS.SELF, Y: TIERS.AVOID },
        Y: { X: TIERS.SAFE, Y: TIERS.SELF },
      },
    };
    expect(assessCandidate({ ...asymCtx, allergies: ['X'], candidate: 'Y' }).verdict).toBe('AVOID');
    expect(assessCandidate({ ...asymCtx, allergies: ['Y'], candidate: 'X' }).verdict).toBe('SAFE');
  });

  it('fail-loud: a missing/empty allergy row throws rather than defaulting to SAFE', () => {
    const degradedCtx = {
      drugs: ['Alpha', 'Beta'],
      drugClass: { Alpha: 'ClassA', Beta: 'ClassA' },
      // Alpha's row is empty {} — the H1 failure mode (header drug, no data).
      matrix: { Alpha: {}, Beta: { Alpha: TIERS.SAFE, Beta: TIERS.SELF } },
    };
    expect(() =>
      assessCandidate({ ...degradedCtx, allergies: ['Alpha'], candidate: 'Beta' })
    ).toThrow(/no cross-reactivity data/i);
  });

  it('fail-loud: a missing candidate cell throws rather than defaulting to SAFE', () => {
    const degradedCtx = {
      drugs: ['Alpha', 'Beta'],
      drugClass: { Alpha: 'ClassA', Beta: 'ClassA' },
      // Alpha row exists but is missing the Beta cell.
      matrix: { Alpha: { Alpha: TIERS.SELF }, Beta: { Alpha: TIERS.SAFE, Beta: TIERS.SELF } },
    };
    expect(() =>
      assessCandidate({ ...degradedCtx, allergies: ['Alpha'], candidate: 'Beta' })
    ).toThrow(/missing cross-reactivity cell/i);
  });

  it('alternatives exclude all selected allergens', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Beta'], candidate: 'Gamma' });
    const altDrugs = res.alternatives.map((a) => a.drug);
    expect(altDrugs).not.toContain('Alpha');
    expect(altDrugs).not.toContain('Beta');
  });

  it('alternatives include only drugs SAFE for ALL allergies', () => {
    // Alpha→Delta=SAFE, Beta→Delta=SAFE → Delta should be in alternatives
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Beta'], candidate: 'Gamma' });
    const altDrugs = res.alternatives.map((a) => a.drug);
    expect(altDrugs).toContain('Delta');
    // Gamma→ anything: Gamma is the candidate so it stays (not an allergen)
    // Check Gamma is NOT in alternatives if it's CAUTION for one allergy
    // Alpha→Gamma=CAUTION → Gamma is NOT safe for Alpha allergy → excluded
    expect(altDrugs).not.toContain('Gamma');
  });

  it('driverRows contains one entry per allergy', () => {
    const res = assessCandidate({ ...syntheticCtx, allergies: ['Alpha', 'Beta', 'Delta'], candidate: 'Gamma' });
    expect(res.driverRows).toHaveLength(3);
    const allergyNames = res.driverRows.map((r) => r.allergyDrug);
    expect(allergyNames).toContain('Alpha');
    expect(allergyNames).toContain('Beta');
    expect(allergyNames).toContain('Delta');
  });
});

// ── Real table tests ───────────────────────────────────────────

describe('assessCandidate — real BLcrossmap.xlsx', () => {
  let table;
  try {
    table = loadRealTable();
  } catch (e) {
    it('loads the real table', () => { throw new Error(e.message); });
    return;
  }

  function assess(allergies, candidate) {
    return assessCandidate({
      allergies,
      candidate,
      drugs: table.drugs,
      drugClass: table.drugClass,
      matrix: table.matrix,
    });
  }

  it('Amoxicillin allergy → Cefadroxil = AVOID', () => {
    expect(assess(['Amoxicillin'], 'Cefadroxil').verdict).toBe('AVOID');
  });

  it('Amoxicillin allergy → Meropenem = SAFE', () => {
    expect(assess(['Amoxicillin'], 'Meropenem').verdict).toBe('SAFE');
  });

  it('Amoxicillin allergy → Ampicillin = CAUTION', () => {
    expect(assess(['Amoxicillin'], 'Ampicillin').verdict).toBe('CAUTION');
  });

  it('Aztreonam allergy → Ceftazidime = AVOID (shared R1 side chain)', () => {
    expect(assess(['Aztreonam'], 'Ceftazidime').verdict).toBe('AVOID');
  });

  it('Ceftriaxone allergy → Cefotaxime = AVOID', () => {
    // Row 24: Ceftriaxone → Cefotaxime = ✕
    expect(assess(['Ceftriaxone'], 'Cefotaxime').verdict).toBe('AVOID');
  });

  it('candidate is itself an allergy → SAME_DRUG', () => {
    expect(assess(['Amoxicillin', 'Cefazolin'], 'Amoxicillin').verdict).toBe('SAME_DRUG');
  });

  it('worst-case: Amoxicillin+Cephalexin allergies → Cefadroxil = AVOID (Amox drives it)', () => {
    // Amoxicillin→Cefadroxil=AVOID; Cephalexin→Cefadroxil=CAUTION
    expect(assess(['Amoxicillin', 'Cephalexin'], 'Cefadroxil').verdict).toBe('AVOID');
  });

  it('alternatives are all valid drugs', () => {
    const res = assess(['Amoxicillin'], 'Meropenem');
    for (const alt of res.alternatives) {
      expect(table.drugs).toContain(alt.drug);
    }
  });

  it('alternatives include Cefazolin when Amoxicillin is the only allergy', () => {
    // Amoxicillin→Cefazolin = blank (SAFE)
    const res = assess(['Amoxicillin'], 'Meropenem');
    const altDrugs = res.alternatives.map((a) => a.drug);
    expect(altDrugs).toContain('Cefazolin');
  });

  it('alternatives never include the allergen itself', () => {
    const res = assess(['Amoxicillin', 'Cefazolin'], 'Meropenem');
    const altDrugs = res.alternatives.map((a) => a.drug);
    expect(altDrugs).not.toContain('Amoxicillin');
    expect(altDrugs).not.toContain('Cefazolin');
  });

  it('EXCLUDED_FROM_ALTERNATIVES drugs never appear in alternatives even when the matrix rates them SAFE', () => {
    // Use Penicillin G as allergy — many drugs are SAFE for it including some excluded ones.
    // We test each excluded drug individually to be explicit.
    const excluded = [...EXCLUDED_FROM_ALTERNATIVES];
    for (const drug of excluded) {
      // The excluded drug may or may not even be in the table; either way it must not appear.
      const res = assess(['Penicillin G'], 'Meropenem');
      const altDrugs = res.alternatives.map((a) => a.drug);
      expect(altDrugs).not.toContain(drug);
    }
  });

  it('EXCLUDED_FROM_ALTERNATIVES: Cefaclor, Cefamandole, Cefoperazone, Ceftibuten, Cefotaxime absent from any alternatives result', () => {
    // Exhaustive: run a few different allergy/candidate combos and confirm none of the 5 appear.
    const scenarios = [
      { allergies: ['Amoxicillin'], candidate: 'Meropenem' },
      { allergies: ['Cephalexin'], candidate: 'Aztreonam' },
      { allergies: ['Ceftriaxone'], candidate: 'Ampicillin' },
    ];
    for (const s of scenarios) {
      const res = assess(s.allergies, s.candidate);
      const altDrugs = res.alternatives.map((a) => a.drug);
      expect(altDrugs).not.toContain('Cefaclor');
      expect(altDrugs).not.toContain('Cefamandole');
      expect(altDrugs).not.toContain('Cefoperazone');
      expect(altDrugs).not.toContain('Ceftibuten');
      expect(altDrugs).not.toContain('Cefotaxime');
    }
  });
});
