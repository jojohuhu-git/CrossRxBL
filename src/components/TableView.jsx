import { useState, useRef, useEffect } from 'react';
import { TIERS } from '../logic/parseTable.js';

const TIER_META = {
  [TIERS.AVOID]:   { sym: '✕', cls: 'avoid',   verdict: 'Avoid',    desc: 'Identical R1 side chain — high risk of cross-reactivity.' },
  [TIERS.CAUTION]: { sym: '△', cls: 'caution', verdict: 'Caution',  desc: 'Similar R1 side chain — use caution.' },
  [TIERS.SELF]:    { sym: '—', cls: 'self',    verdict: 'Same drug', desc: 'This is the same drug.' },
  [TIERS.SAFE]:    { sym: '',  cls: 'safe',    verdict: 'Low risk',  desc: 'Dissimilar R1 side chain — low risk of cross-reactivity.' },
};

/**
 * Compute ordered unique class groups from drugClass + drugs array.
 * Returns [{ className, drugs: string[] }] in spreadsheet order.
 */
function buildClassGroups(drugs, drugClass) {
  const groups = [];
  let current = null;
  for (const d of drugs) {
    const cls = drugClass[d] || '';
    if (cls !== current) {
      groups.push({ className: cls, drugs: [d] });
      current = cls;
    } else {
      groups[groups.length - 1].drugs.push(d);
    }
  }
  return groups;
}

/**
 * TableView — the full cross-reactivity matrix, made interactive.
 *
 * Props:
 *   tableData   : { drugs, drugClass, matrix }
 *   onCheckPair : (allergyDrug, candidateDrug) => void   — cross-tab integration
 */
export default function TableView({ tableData, onCheckPair }) {
  const { drugs, drugClass, matrix } = tableData;

  const [hover, setHover] = useState({ row: null, col: null });
  const [sel, setSel] = useState({ row: null, col: null }); // locked focus
  const [searchQuery, setSearchQuery] = useState('');

  const scrollRef = useRef(null);        // ref on .matrix-scroll
  const colHeadRefs = useRef({});        // drug -> th ref (column heads, for jump-to-class)
  const rowHeadRefs = useRef({});        // drug -> th ref (row heads, for search scroll)
  const theadRef = useRef(null);         // ref on <thead> for sticky-header height

  const classGroups = buildClassGroups(drugs, drugClass);

  // Search targets the ALLERGY ROW only (left axis)
  const matchDrug = searchQuery.trim()
    ? drugs.find((d) => d.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : null;

  // Scroll matched ROW into view, accounting for sticky thead height
  useEffect(() => {
    if (!matchDrug) return;
    const rowEl = rowHeadRefs.current[matchDrug];
    const container = scrollRef.current;
    if (!rowEl || !container) return;

    // Compute sticky header height (class-band row + drug-name row)
    const theadHeight = theadRef.current ? theadRef.current.offsetHeight : 0;
    const MARGIN = 8;

    // offsetTop of the <tr> relative to the scrollable container
    const trEl = rowEl.parentElement; // <tr>
    const targetTop = trEl.offsetTop - theadHeight - MARGIN;
    container.scrollTop = Math.max(0, targetTop);
  }, [matchDrug]);

  function metaFor(allergyDrug, candidateDrug) {
    const tier = matrix[allergyDrug]?.[candidateDrug] ?? TIERS.SAFE;
    return TIER_META[tier] || TIER_META[TIERS.SAFE];
  }

  function clickCell(row, col) {
    setSel((s) => (s.row === row && s.col === col ? { row: null, col: null } : { row, col }));
  }
  function clickRowHead(row) {
    setSel((s) => (s.row === row && s.col === null ? { row: null, col: null } : { row, col: null }));
  }
  function clickColHead(col) {
    setSel((s) => (s.col === col && s.row === null ? { row: null, col: null } : { row: null, col }));
  }

  // Keyboard handler for row/col headers and cells
  function handleKeyActivate(e, fn) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  }

  // A row/column is highlighted if hovered OR locked-selected
  const activeRow = hover.row ?? sel.row;
  const activeCol = hover.col ?? sel.col;

  const focusMeta = sel.row && sel.col ? metaFor(sel.row, sel.col) : null;

  // Jump-to-class: scroll so first col of that class is visible
  function jumpToClass(className) {
    const group = classGroups.find((g) => g.className === className);
    if (!group) return;
    const firstDrug = group.drugs[0];
    const el = colHeadRefs.current[firstDrug];
    const container = scrollRef.current;
    if (!el || !container) return;

    // Subtract the sticky row-head width so the column isn't hidden behind it
    const rowHeadWidth = el.closest('table')?.querySelector('.row-head')?.offsetWidth ?? 0;
    const targetLeft = el.offsetLeft - rowHeadWidth - 4;
    container.scrollLeft = Math.max(0, targetLeft);
  }

  // Build a set of first-drugs-per-class for border styling
  const firstInClass = new Set(classGroups.map((g) => g.drugs[0]));

  // Search highlight: which ROW drug is matched
  const isSearchMatchRow = (d) => matchDrug === d;

  return (
    <div className="card">
      <div className="card-title">Cross-Reactivity Table</div>
      <p className="table-intro">
        Read across from the patient's <strong>allergy</strong> (left column) to the antibiotic
        you are <strong>considering</strong> (top row). <em>Hover</em> to trace a row and column;{' '}
        <em>click</em> a cell to lock the focus, or click a drug name to highlight its row/column.
      </p>

      <div className="matrix-legend">
        <span><span className="ml-sym avoid">✕</span> Identical R1 — avoid (high risk)</span>
        <span><span className="ml-sym caution">△</span> Similar R1 — caution</span>
        <span><span className="ml-sym safe">&nbsp;</span> Blank — dissimilar R1, low risk</span>
        <span><span className="ml-sym self">—</span> Same drug</span>
      </div>

      {/* Jump-to-class quick-nav */}
      <div className="class-jump-nav" aria-label="Jump to drug class">
        <span className="class-jump-label">Jump to:</span>
        {classGroups.map((g) => (
          <button
            key={g.className}
            type="button"
            className="class-jump-btn"
            onClick={() => jumpToClass(g.className)}
          >
            {g.className}
          </button>
        ))}
      </div>

      {/* Drug search — scoped to allergy row (left axis) */}
      <div className="matrix-search-wrap">
        <input
          type="text"
          className="matrix-search-input"
          placeholder="Find patient's allergy (row)…"
          value={searchQuery}
          aria-label="Find patient's allergy row"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="matrix-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
        {matchDrug && (
          <span className="matrix-search-match">↳ {matchDrug}</span>
        )}
        {searchQuery && !matchDrug && (
          <span className="matrix-search-nomatch">No match</span>
        )}
        <span className="matrix-search-caption">Highlights the allergy row</span>
      </div>

      {/* Focus readout with "Check this pair" button */}
      <div className={`focus-readout ${focusMeta ? focusMeta.cls : 'empty'}`} aria-live="polite">
        {focusMeta ? (
          <>
            <div className="focus-pair">
              <span className="focus-allergy">Allergic to <strong>{sel.row}</strong></span>
              <span className="focus-arrow">→ considering</span>
              <span className="focus-candidate"><strong>{sel.col}</strong></span>
            </div>
            <div className="focus-verdict">
              <span className={`focus-badge ${focusMeta.cls}`}>{focusMeta.verdict}</span>
              <span className="focus-desc">{focusMeta.desc}</span>
            </div>
            {onCheckPair && (
              <button
                type="button"
                className="focus-check-pair"
                onClick={() => onCheckPair(sel.row, sel.col)}
                title="Switch to Cross-Reactivity Check tab with this pair pre-filled"
              >
                Check this pair →
              </button>
            )}
            <button type="button" className="focus-clear" onClick={() => setSel({ row: null, col: null })}>
              Clear
            </button>
          </>
        ) : (
          <span className="focus-hint">
            Click any cell to see the allergy → candidate relationship in plain language.
          </span>
        )}
      </div>

      <div
        className="matrix-scroll"
        ref={scrollRef}
        onMouseLeave={() => setHover({ row: null, col: null })}
      >
        <table className="matrix-table">
          <thead ref={theadRef}>
            {/* Class band row above drug names */}
            <tr className="class-band-row">
              {/* Corner cell spans the corner (sticky top+left) */}
              <th
                className="corner class-band-corner"
                rowSpan={1}
                aria-hidden="true"
              />
              {classGroups.map((g) => (
                <th
                  key={g.className}
                  colSpan={g.drugs.length}
                  className="class-band-cell"
                >
                  {g.className}
                </th>
              ))}
            </tr>
            <tr>
              <th className="corner">Allergy&nbsp;↓ \ Consider&nbsp;→</th>
              {drugs.map((d) => (
                <th
                  key={d}
                  ref={(el) => { colHeadRefs.current[d] = el; }}
                  className={[
                    'col-head',
                    activeCol === d ? 'hl' : '',
                    sel.col === d && sel.row === null ? 'sel' : '',
                    firstInClass.has(d) ? 'class-first-col' : '',
                    // No search-match-head on columns — search is row-scoped
                  ].filter(Boolean).join(' ')}
                  title={`${d} (${drugClass[d]})`}
                  onMouseEnter={() => setHover((h) => ({ ...h, col: d }))}
                  onClick={() => clickColHead(d)}
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyActivate(e, () => clickColHead(d))}
                >
                  <span>{d}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drugs.map((rowDrug) => {
              const isSearchRow = isSearchMatchRow(rowDrug);
              return (
                <tr
                  key={rowDrug}
                  className={[
                    activeRow === rowDrug ? 'row-hl' : '',
                    firstInClass.has(rowDrug) ? 'class-first-row' : '',
                    isSearchRow ? 'search-row-hl' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <th
                    ref={(el) => { rowHeadRefs.current[rowDrug] = el; }}
                    className={[
                      'row-head',
                      activeRow === rowDrug ? 'hl' : '',
                      sel.row === rowDrug && sel.col === null ? 'sel' : '',
                      firstInClass.has(rowDrug) ? 'class-first-col' : '',
                      isSearchRow ? 'search-match-head' : '',
                    ].filter(Boolean).join(' ')}
                    title={`${rowDrug} (${drugClass[rowDrug]})`}
                    onMouseEnter={() => setHover((h) => ({ ...h, row: rowDrug }))}
                    onClick={() => clickRowHead(rowDrug)}
                    tabIndex={0}
                    onKeyDown={(e) => handleKeyActivate(e, () => clickRowHead(rowDrug))}
                  >
                    {rowDrug}
                  </th>
                  {drugs.map((colDrug) => {
                    const m = metaFor(rowDrug, colDrug);
                    const isSel = sel.row === rowDrug && sel.col === colDrug;
                    const inCross = activeCol === colDrug || activeRow === rowDrug;
                    const isFirstCol = firstInClass.has(colDrug);
                    return (
                      <td
                        key={colDrug}
                        className={[
                          'cell',
                          m.cls,
                          inCross ? 'cross' : '',
                          isSel ? 'sel' : '',
                          isFirstCol ? 'class-first-col' : '',
                          isSearchRow ? 'search-row-cell' : '',
                        ].filter(Boolean).join(' ')}
                        title={`${rowDrug} → ${colDrug}: ${m.verdict}`}
                        onMouseEnter={() => setHover({ row: rowDrug, col: colDrug })}
                        onClick={() => clickCell(rowDrug, colDrug)}
                        tabIndex={0}
                        onKeyDown={(e) => handleKeyActivate(e, () => clickCell(rowDrug, colDrug))}
                      >
                        {m.sym}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
