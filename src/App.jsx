import { useState, useEffect } from 'react';
import { loadTableFromUrl } from './logic/parseTable.js';
import { assessCandidate } from './logic/assess.js';
import AllergySelect from './components/AllergySelect.jsx';
import CandidateSelect from './components/CandidateSelect.jsx';
import ResultsPanel from './components/ResultsPanel.jsx';
import TableView from './components/TableView.jsx';

const TABLE_URL = import.meta.env.BASE_URL + 'BLcrossmap.xlsx';

// Task 5: single version constant
const VERSION = 'v1.0';

export default function App() {
  // Table state
  const [tableData, setTableData] = useState(null);   // { drugs, drugClass, matrix, fileName, drugCount, parseWarnings }
  const [tableError, setTableError] = useState(null); // string
  const [loading, setLoading] = useState(true);

  // Which tab is active: 'tool' (assessment) or 'table' (full matrix)
  const [tab, setTab] = useState('tool');

  // Input state
  const [allergies, setAllergies] = useState([]);
  const [candidate, setCandidate] = useState('');

  // Result state
  const [result, setResult] = useState(null);
  const [resultCandidate, setResultCandidate] = useState('');

  // Load table on mount
  useEffect(() => {
    setLoading(true);
    loadTableFromUrl(TABLE_URL)
      .then((data) => {
        setTableData(data);
        setLoading(false);
      })
      .catch((err) => {
        setTableError(err.message || String(err));
        setLoading(false);
      });
  }, []);

  function handleAddAllergy(drug) {
    if (!allergies.includes(drug)) {
      setAllergies((prev) => [...prev, drug]);
      setResult(null); // clear stale result
    }
  }

  function handleRemoveAllergy(drug) {
    setAllergies((prev) => prev.filter((d) => d !== drug));
    setResult(null);
  }

  function runCheck(currentAllergies, currentCandidate) {
    if (!tableData || currentAllergies.length === 0 || !currentCandidate) return;
    const assessment = assessCandidate({
      allergies: currentAllergies,
      candidate: currentCandidate,
      drugs: tableData.drugs,
      drugClass: tableData.drugClass,
      matrix: tableData.matrix,
    });
    setResult(assessment);
    setResultCandidate(currentCandidate);
  }

  function handleCheck() {
    runCheck(allergies, candidate);
  }

  // Task 3: cross-tab "Check this pair" callback from TableView
  function handleCheckPair(allergyDrug, candidateDrug) {
    const newAllergies = [allergyDrug];
    setAllergies(newAllergies);
    setCandidate(candidateDrug);
    setTab('tool');
    // Run assessment immediately with the new pair
    runCheck(newAllergies, candidateDrug);
  }

  const canCheck = tableData && allergies.length > 0 && candidate;

  // Candidate options: all drugs except those that are selected allergens
  const candidateOptions = tableData
    ? tableData.drugs.filter((d) => !allergies.includes(d))
    : [];

  return (
    <>
      <header className="app-header">
        <h1>Beta-Lactam Cross-Reactivity Tool</h1>
        <div className="header-right">
          {/* Task 5: unified label — no "Beta" */}
          <span className="header-tag">Clinical decision support tool</span>
          {tableData && (
            <span className="table-indicator">
              Table: {tableData.fileName} · {tableData.drugCount} drugs
            </span>
          )}
          {loading && (
            <span className="table-indicator">Loading table…</span>
          )}
          {tableError && (
            <span className="table-indicator" style={{ background: 'rgba(192,57,43,0.25)', borderColor: 'rgba(192,57,43,0.5)' }}>
              Table error
            </span>
          )}
        </div>
      </header>

      <main>
        {loading && (
          <div className="loading-state">
            <p>Loading cross-reactivity table…</p>
          </div>
        )}

        {!loading && tableError && (
          <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
            <div className="error-banner">
              <h2>Unable to load the cross-reactivity table</h2>
              <p>{tableError}</p>
              <p style={{ marginTop: 8 }}>
                Please check that <code>public/BLcrossmap.xlsx</code> exists and follows the
                expected format (one square matrix, class row above the "Allergy To" header row,
                and ✕ / △ / — / blank symbols).
              </p>
            </div>
          </div>
        )}

        {!loading && tableData && (
          <div className="tab-bar">
            <button
              type="button"
              className={`tab-btn ${tab === 'tool' ? 'active' : ''}`}
              onClick={() => setTab('tool')}
            >
              Cross-Reactivity Check
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'table' ? 'active' : ''}`}
              onClick={() => setTab('table')}
            >
              View Full Table
            </button>
          </div>
        )}

        {!loading && tableData && tab === 'table' && (
          <div className="table-tab-wrap">
            <TableView tableData={tableData} onCheckPair={handleCheckPair} />
          </div>
        )}

        {!loading && tableData && tab === 'tool' && (
          <div className="app-body">
            {/* LEFT: Inputs */}
            <div className="input-panel">
              {tableData.parseWarnings && tableData.parseWarnings.length > 0 && (
                <div className="card" style={{ marginBottom: 0, background: '#fff8e1', borderLeft: '4px solid var(--caution-border)' }}>
                  <div className="card-title" style={{ color: 'var(--caution-text)' }}>Table parse warnings</div>
                  {tableData.parseWarnings.map((w, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', color: 'var(--gy2)', marginTop: 4 }}>{w}</p>
                  ))}
                </div>
              )}

              {/* Allergy input */}
              <div className="card">

                <div className="field-group">
                  <label className="field-label">
                    Select drug allergies
                    <span className="sub">Select one or more beta-lactam antibiotics the patient is allergic to.</span>
                  </label>
                  <AllergySelect
                    drugs={tableData.drugs}
                    drugClass={tableData.drugClass}
                    selected={allergies}
                    onAdd={handleAddAllergy}
                    onRemove={handleRemoveAllergy}
                  />
                </div>

                <div className="field-group" style={{ marginBottom: 0 }}>
                  {/* Task 4: label kept as-is; CandidateSelect replaces the plain <select> */}
                  <label className="field-label" htmlFor="candidate-typeahead">
                    Select desired antibiotic
                    <span className="sub">Select the beta-lactam antibiotic you are considering using.</span>
                  </label>
                  <CandidateSelect
                    options={candidateOptions}
                    drugClass={tableData.drugClass}
                    value={candidate}
                    onChange={(d) => { setCandidate(d); setResult(null); }}
                    disabled={candidateOptions.length === 0}
                  />
                </div>
              </div>

              {/* Check button */}
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-check"
                  onClick={handleCheck}
                  disabled={!canCheck}
                >
                  Check Cross-Reactivity
                </button>
              </div>

              {/* How it works */}
              <div className="card how-it-works" style={{ marginTop: 16 }}>
                <div className="card-title">How this tool works</div>
                <p>
                  This tool checks the <strong>R1 side chain similarity</strong> between a
                  patient's listed beta-lactam allergies and a candidate antibiotic. Similar R1
                  side chains are the primary driver of cross-reactivity between beta-lactams.
                </p>
                <p style={{ marginTop: 6 }}>
                  <strong>Ratings:</strong>{' '}
                  <span style={{ color: 'var(--avoid-text)', fontWeight: 600 }}>AVOID</span> = identical R1 (high risk) ·{' '}
                  <span style={{ color: 'var(--caution-text)', fontWeight: 600 }}>CAUTION</span> = similar R1 ·{' '}
                  <span style={{ color: 'var(--safe-text)', fontWeight: 600 }}>LOW RISK</span> = dissimilar R1
                </p>
                <p style={{ marginTop: 6 }}>
                  Multiple allergies: the <strong>worst rating</strong> across all listed
                  allergens is shown.
                </p>
              </div>

              {/* Disclaimer */}
              <div className="card disclaimer" style={{ marginTop: 12 }}>
                <div className="disclaimer-title">⚠ Clinical Disclaimer</div>
                <p>
                  This is a <strong>decision support tool only</strong>. It does not account for
                  R2 side chains, reaction severity, IgE-mediated versus non-IgE-mediated
                  mechanisms, or patient-specific factors. Always verify allergy history and apply
                  clinical judgment. Not a substitute for specialist consultation when indicated.
                </p>
              </div>
            </div>

            {/* RIGHT: Results */}
            <div>
              <ResultsPanel result={result} candidate={resultCandidate} />
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Data based on the bundled cross-reactivity table. Always verify patient history and use clinical judgment.</p>
        {/* Task 5: VERSION constant — consistent with header tag */}
        <p>{VERSION} · Beta-Lactam Cross-Reactivity Tool · CrossRxBL</p>
      </footer>
    </>
  );
}
