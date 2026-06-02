import { useState, useRef, useEffect } from 'react';

/**
 * CandidateSelect — single-select searchable typeahead for candidate antibiotic.
 *
 * Props:
 *   options      : string[]         available drug names (already excludes selected allergens)
 *   drugClass    : {[drug]: string} drug -> class name
 *   value        : string           currently selected drug ('' if none)
 *   onChange(drug): fn              called with the chosen drug string
 *   disabled     : bool
 */
export default function CandidateSelect({ options, drugClass, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Filtered list: match query against drug name
  const filtered = options.filter((d) =>
    d.toLowerCase().includes(query.toLowerCase())
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
        // If user clicked away without selecting, restore the displayed value
        if (value) setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [value]);

  // When the external value changes (e.g. from "Check this pair"), update display
  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(drug) {
    onChange(drug);
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function handleClear() {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (disabled) return;
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
      handleSelect(filtered[activeIdx]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
      if (value) setQuery('');
    }
  }

  // Placeholder text
  const placeholder = disabled
    ? 'No drugs available'
    : value
    ? ''   // show value chip below, keep input empty
    : 'Type to search for a drug…';

  return (
    <div>
      {/* Selected value chip — shown when a drug is chosen */}
      {value && (
        <div className="chip-list" style={{ marginBottom: 6 }}>
          <span className="chip" role="status" aria-label={`Selected: ${value}`}>
            {value}
            <button
              type="button"
              onClick={handleClear}
              aria-label={`Clear selection: ${value}`}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="typeahead-wrap">
        <input
          ref={inputRef}
          type="text"
          className="typeahead-input"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
            // If user types while a value is selected, clear the selection
            if (value) onChange('');
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onKeyDown={handleKeyDown}
          aria-label="Search candidate antibiotic"
          aria-autocomplete="list"
          aria-expanded={open}
        />

        {open && !disabled && filtered.length > 0 && (
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

        {open && !disabled && filtered.length === 0 && query.length > 0 && (
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
