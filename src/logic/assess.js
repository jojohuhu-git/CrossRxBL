/**
 * assess.js
 *
 * Core cross-reactivity verdict logic. Pure functions — no DOM, no fetch.
 *
 * Exported:
 *   assessCandidate({ allergies, candidate, drugs, drugClass, matrix })
 *     -> { verdict, driverRows, alternatives }
 *
 *   verdict: 'AVOID' | 'CAUTION' | 'SAFE' | 'SAME_DRUG'
 *   driverRows: Array<{ allergyDrug, tier, symbol, description }>
 *   alternatives: Array<{ drug, drugClass }>  — SAFE for ALL allergies, sorted by class/drug
 */

import { TIERS, TIER_SEVERITY } from './parseTable.js';

/**
 * Drugs excluded from the Safe Alternatives output because they are not
 * consistently available in the US market or have been withdrawn.
 *
 * Design note: this is a deliberate exception to the "all data in the
 * spreadsheet" principle — US-availability filtering is a code concern,
 * not a cross-reactivity science concern.  These drugs remain:
 *   • selectable as an allergy
 *   • selectable as a candidate
 *   • visible in the Full Table matrix
 * They are ONLY excluded from buildAlternatives() output.
 */
export const EXCLUDED_FROM_ALTERNATIVES = new Set([
  'Cefaclor',
  'Cefamandole',
  'Cefoperazone',
  'Ceftibuten',
  'Cefotaxime',
]);

// Human-readable descriptions for each tier in the "Why?" section
function tierDescription(tier, allergyDrug, candidateDrug) {
  switch (tier) {
    case TIERS.AVOID:
      return `Identical R1 side chain between ${allergyDrug} and ${candidateDrug} — high risk of cross-reactivity.`;
    case TIERS.CAUTION:
      return `Similar R1 side chain between ${allergyDrug} and ${candidateDrug} — some cross-reactivity possible.`;
    case TIERS.SAFE:
      return `Dissimilar R1 side chain — very low cross-reactivity risk (<5%) based on R1 structure.`;
    case TIERS.SELF:
      return `${candidateDrug} is the same drug as ${allergyDrug}.`;
    default:
      return '';
  }
}

const TIER_SYMBOL = {
  [TIERS.AVOID]: '✕',
  [TIERS.CAUTION]: '△',
  [TIERS.SAFE]: '—',
  [TIERS.SELF]: '=',
};

// Class sort order for the alternatives table
const CLASS_ORDER = [
  'Penicillin',
  '1st Gen Ceph',
  '2nd Gen Ceph',
  '3rd Gen Ceph',
  '4th Gen Ceph',
  '5th Gen Ceph',
  'Siderophore Ceph',
  'Carbapenem',
  'Monobactam',
];

function classRank(className) {
  const idx = CLASS_ORDER.indexOf(className);
  return idx >= 0 ? idx : CLASS_ORDER.length;
}

/**
 * Main assessment function.
 *
 * @param {object} params
 * @param {string[]} params.allergies    - selected allergy drug names
 * @param {string}   params.candidate   - candidate drug name
 * @param {string[]} params.drugs       - all drug names from table
 * @param {{[drug]: string}} params.drugClass - drug -> class name
 * @param {object}   params.matrix      - matrix[allergyDrug][candidateDrug] = tier
 * @returns {{ verdict, driverRows, alternatives }}
 */
export function assessCandidate({ allergies, candidate, drugs, drugClass, matrix }) {
  if (!allergies || allergies.length === 0) {
    throw new Error('At least one allergy must be selected.');
  }
  if (!candidate) {
    throw new Error('A candidate drug must be selected.');
  }

  // If the candidate is itself a selected allergy → SAME_DRUG
  if (allergies.includes(candidate)) {
    return {
      verdict: 'SAME_DRUG',
      driverRows: [{
        allergyDrug: candidate,
        tier: TIERS.SELF,
        symbol: '=',
        description: `${candidate} is listed as one of the patient's allergies.`,
      }],
      alternatives: buildAlternatives({ allergies, drugs, drugClass, matrix }),
    };
  }

  // Compute worst tier across all allergy rows
  let worstTier = TIERS.SAFE;
  const driverRows = [];

  for (const allergyDrug of allergies) {
    const row = matrix[allergyDrug];
    if (!row) continue; // should not happen if drug is valid

    const tier = row[candidate] ?? TIERS.SAFE;
    const sev = TIER_SEVERITY[tier] ?? 0;
    const worstSev = TIER_SEVERITY[worstTier] ?? 0;

    if (sev > worstSev) {
      worstTier = tier;
    }

    driverRows.push({
      allergyDrug,
      tier,
      symbol: TIER_SYMBOL[tier] ?? '?',
      description: tierDescription(tier, allergyDrug, candidate),
    });
  }

  // Map worst tier to verdict
  let verdict;
  if (worstTier === TIERS.AVOID || worstTier === TIERS.SELF) {
    verdict = 'AVOID';
  } else if (worstTier === TIERS.CAUTION) {
    verdict = 'CAUTION';
  } else {
    verdict = 'SAFE';
  }

  return {
    verdict,
    driverRows,
    alternatives: buildAlternatives({ allergies, drugs, drugClass, matrix }),
  };
}

/**
 * Build the sorted list of SAFE alternatives (SAFE for ALL selected allergies).
 * Excludes the allergen drugs themselves.
 */
function buildAlternatives({ allergies, drugs, drugClass, matrix }) {
  const allergySet = new Set(allergies);
  const safeList = [];

  for (const drug of drugs) {
    if (allergySet.has(drug)) continue; // exclude the allergens
    if (EXCLUDED_FROM_ALTERNATIVES.has(drug)) continue; // US-availability filter

    let isSafeForAll = true;
    for (const allergyDrug of allergies) {
      const row = matrix[allergyDrug];
      if (!row) continue;
      const tier = row[drug] ?? TIERS.SAFE;
      if (tier === TIERS.AVOID || tier === TIERS.CAUTION || tier === TIERS.SELF) {
        isSafeForAll = false;
        break;
      }
    }

    if (isSafeForAll) {
      safeList.push({ drug, drugClass: drugClass[drug] || '' });
    }
  }

  // Sort by class order, then alphabetically within class
  safeList.sort((a, b) => {
    const cr = classRank(a.drugClass) - classRank(b.drugClass);
    if (cr !== 0) return cr;
    return a.drug.localeCompare(b.drug);
  });

  return safeList;
}

/**
 * Verdict display metadata (label, icon, CSS class, summary text).
 */
export function verdictMeta(verdict, candidate) {
  switch (verdict) {
    case 'AVOID':
    case 'SAME_DRUG':
      return {
        cssClass: 'avoid',
        label: 'AVOID',
        icon: '✕',
        summary: verdict === 'SAME_DRUG'
          ? `${candidate} is listed as one of the patient's allergies — do not give.`
          : `Do not give ${candidate} to this patient based on R1 side chain similarity.`,
      };
    case 'CAUTION':
      return {
        cssClass: 'caution',
        label: 'CAUTION',
        icon: '△',
        summary: `${candidate} shares a similar R1 side chain with one or more allergens. Use clinical judgment; consider premedication or alternative.`,
      };
    case 'SAFE':
      return {
        cssClass: 'safe',
        label: 'LOW RISK',
        icon: '✓',
        summary: `${candidate} has a dissimilar R1 side chain from the listed allergens. Low cross-reactivity risk (<5%) based on R1 structure.`,
      };
    default:
      return { cssClass: '', label: verdict, icon: '?', summary: '' };
  }
}
