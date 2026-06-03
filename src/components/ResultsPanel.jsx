import { verdictMeta } from '../logic/assess.js';
import { TIERS } from '../logic/parseTable.js';

/**
 * ResultsPanel — renders the verdict banner, Why? section, and Safe Alternatives.
 */
export default function ResultsPanel({ result, candidate }) {
  if (!result) {
    return (
      <div className="results-empty card">
        <p>
          Select one or more allergy drugs on the left, pick a candidate antibiotic,
          and click <strong>Check Cross-Reactivity</strong>.
        </p>
      </div>
    );
  }

  const { verdict, driverRows, alternatives } = result;
  const meta = verdictMeta(verdict, candidate);

  return (
    <div className="results-panel">
      {/* Verdict banner */}
      <div className={`verdict-banner ${meta.cssClass}`} role="alert" aria-live="polite">
        <div className="verdict-icon">
          {verdict === 'AVOID' || verdict === 'SAME_DRUG' ? '🚫' : verdict === 'CAUTION' ? '⚠️' : '✅'}
        </div>
        <div className="verdict-body">
          <div className="verdict-label">{meta.label}</div>
          <div className="verdict-summary">{meta.summary}</div>
        </div>
      </div>

      {/* Why? section */}
      <div className="card why-card" style={{ marginBottom: 16 }}>
        <div className="card-title">Why? — Allergy-by-Allergy Breakdown</div>
        {driverRows.map((row) => (
          <div key={row.allergyDrug} className="why-row">
            <div className="why-allergen">{row.allergyDrug}</div>
            <WhySymbol tier={row.tier} />
            <div className="why-desc">{row.description}</div>
          </div>
        ))}
        {(verdict === 'SAFE') && (
          <p className="safety-note">
            <strong>Important limitation:</strong> Low risk (&lt;5%) is based on R1 side-chain
            similarity only. This does <em>not</em> account for R2 side chains, how severe the
            patient's original reaction was, or other immune mechanisms (e.g., IgE to the
            beta-lactam ring itself). Use clinical judgment and consider the reaction history.
          </p>
        )}
        {(verdict === 'CAUTION') && (
          <p className="safety-note">
            R1 side chain similarity detected. Risk may be low but is not negligible.
            Consider the reaction severity, time since reaction, and availability of alternatives.
            This tool does not replace clinical assessment.
          </p>
        )}
      </div>

      {/* Safe Alternatives */}
      <div className="card">
        <div className="card-title">Safe Alternatives (Low Risk for All Listed Allergies)</div>
        {alternatives.length === 0 ? (
          <p className="no-alts">
            No beta-lactams in this table are rated SAFE for all selected allergies.
            Consider non-beta-lactam antibiotics or allergy testing.
          </p>
        ) : (
          <>
            <AlternativesTable alternatives={alternatives} />
            <p className="safety-note" style={{ marginTop: 10 }}>
              "Low risk" means the R1 side chain is dissimilar to all listed allergens.
              This does NOT account for R2 side chains, reaction severity, or other allergy
              mechanisms. Always verify patient history and apply clinical judgment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function WhySymbol({ tier }) {
  const cls =
    tier === TIERS.AVOID ? 'avoid'
    : tier === TIERS.CAUTION ? 'caution'
    : tier === TIERS.SELF ? 'self'
    : 'safe';
  const label =
    tier === TIERS.AVOID ? '✕'
    : tier === TIERS.CAUTION ? '△'
    : tier === TIERS.SELF ? '='
    : '○';
  return <div className={`why-symbol ${cls}`} title={tier}>{label}</div>;
}

/**
 * Map from drug class name → CSS token name for accent color.
 * Matches the 9 classes in CLASS_ORDER (assess.js).
 */
const CLASS_COLOR_TOKEN = {
  'Penicillin':       'var(--class-color-penicillin)',
  '1st Gen Ceph':     'var(--class-color-1st)',
  '2nd Gen Ceph':     'var(--class-color-2nd)',
  '3rd Gen Ceph':     'var(--class-color-3rd)',
  '4th Gen Ceph':     'var(--class-color-4th)',
  '5th Gen Ceph':     'var(--class-color-5th)',
  'Siderophore Ceph': 'var(--class-color-siderophore)',
  'Carbapenem':       'var(--class-color-carbapenem)',
  'Monobactam':       'var(--class-color-monobactam)',
};

/**
 * Route map for the Safe Alternatives table only.
 * Source: user-confirmed list (2026-06-02). Any drug not listed → no tag shown.
 * This is a deliberate code constant (not in the spreadsheet) because route is
 * a clinical convenience label, not cross-reactivity science.
 */
const DRUG_ROUTE = {
  // PO (oral)
  'Amoxicillin':  'PO',
  'Cefadroxil':   'PO',
  'Cephalexin':   'PO',
  'Cefprozil':    'PO',
  'Cefuroxime':   'PO',
  'Cefdinir':     'PO',
  'Cefixime':     'PO',
  'Cefpodoxime':  'PO',
  // IV (intravenous)
  'Ampicillin':    'IV',
  'Oxacillin':     'IV',
  'Penicillin G':  'IV',
  'Piperacillin':  'IV',
  'Cefazolin':     'IV',
  'Cefotetan':     'IV',
  'Cefoxitin':     'IV',
  'Ceftazidime':   'IV',
  'Ceftriaxone':   'IV',
  'Cefepime':      'IV',
  'Ceftaroline':   'IV',
  'Ceftolozane':   'IV',
  'Cefiderocol':   'IV',
  'Ertapenem':     'IV',
  'Meropenem':     'IV',
  'Aztreonam':     'IV',
};

function AlternativesTable({ alternatives }) {
  // Group by class
  const groups = [];
  let currentClass = null;
  for (const alt of alternatives) {
    if (alt.drugClass !== currentClass) {
      groups.push({ className: alt.drugClass, drugs: [alt] });
      currentClass = alt.drugClass;
    } else {
      groups[groups.length - 1].drugs.push(alt);
    }
  }

  return (
    <table className="alt-table" aria-label="Safe antibiotic alternatives">
      <thead>
        <tr>
          <th>Antibiotic</th>
          <th>Class</th>
          <th>Cross-Reactivity Risk</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const accentColor = CLASS_COLOR_TOKEN[group.className] || 'var(--gy5)';
          return group.drugs.map((alt, i) => {
            const route = DRUG_ROUTE[alt.drug];
            return (
              <tr
                key={alt.drug}
                className={i === 0 ? 'alt-class-group' : ''}
                style={{ '--alt-class-color': accentColor }}
              >
                <td>
                  {alt.drug}
                  {route && <span className="route-tag">({route})</span>}
                </td>
                <td>
                  {i === 0 ? (
                    <span className="alt-class-label" style={{ color: accentColor }}>
                      {group.className}
                    </span>
                  ) : ''}
                </td>
                <td>
                  <span className="badge-safe">Low Risk</span>
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}
