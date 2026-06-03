import { useState, useRef, useEffect } from 'react';

/**
 * AllergySelect — multi-select with chip display and typeahead.
 *
 * Props:
 *   drugs        : string[]         all available drug names
 *   drugClass    : {[drug]: string} drug -> class name
 *   selected     : string[]         currently selected allergy drugs
 *   onAdd(drug)  : fn
 *   onRemove(drug): fn
 */
export default function AllergySelect({ drugs, drugClass, selected, onAdd, onRemove }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  const selectedSet = new Set(selected);
  const filtered = drugs.filter(
    (d) => !selectedSet.has(d) && d.toLowerCase().includes(query.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        dropRef.current && !dropRef.current.contains(e.target)
      ) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActiveIdx((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) {
      onAdd(filtered[activeIdx]);
      setQuery('');
      setOpen(false);
      setActiveIdx(-1);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  function handleSelect(drug) {
    onAdd(drug);
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
    // Focus the input so the user can click/type to open again, but do NOT
    // call setOpen(true) here — the input is already focused when the mousedown
    // fires (browser focuses the target element), so focus() is a no-op and
    // onFocus won't re-fire, preserving the closed state (same trick CandidateSelect uses).
    inputRef.current?.focus();
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="chip-list" role="list" aria-label="Selected allergens">
          {selected.map((d) => (
            <span key={d} className="chip" role="listitem">
              {d}
              <button
                type="button"
                onClick={() => onRemove(d)}
                aria-label={`Remove ${d}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="typeahead-wrap">
        <input
          ref={inputRef}
          type="text"
          className="typeahead-input"
          placeholder={selected.length === 0 ? 'Type to search for a drug…' : 'Add another drug…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search allergy drugs"
          aria-autocomplete="list"
          aria-expanded={open}
        />

        {open && filtered.length > 0 && (
          <div ref={dropRef} className="typeahead-dropdown" role="listbox">
            {filtered.map((d, i) => (
              <div
                key={d}
                className={`typeahead-option${i === activeIdx ? ' active' : ''}`}
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={() => handleSelect(d)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span>{d}</span>
                <span className="opt-class">{drugClass[d] || ''}</span>
              </div>
            ))}
          </div>
        )}

        {open && filtered.length === 0 && query.length > 0 && (
          <div ref={dropRef} className="typeahead-dropdown">
            <div className="typeahead-option" style={{ color: 'var(--gy4)', cursor: 'default' }}>
              No matches for "{query}"
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
