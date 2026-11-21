import React, { useState, useRef, useEffect, useCallback } from 'react';

const DEFAULT_FORMATS = [
  {
    value: 'xlsx',
    label: 'Excel Workbook',
    shortLabel: 'Excel',
    icon: 'bi-file-earmark-excel-fill',
    color: '#1D6F42',
    description: 'Formatted .xlsx spreadsheet'
  },
  {
    value: 'csv',
    label: 'CSV Spreadsheet',
    shortLabel: 'CSV',
    icon: 'bi-filetype-csv',
    color: '#0284c7',
    description: 'Universal .csv data file'
  },
  {
    value: 'pdf',
    label: 'PDF Report',
    shortLabel: 'PDF',
    icon: 'bi-file-earmark-pdf-fill',
    color: '#C62828',
    description: 'Printable formatted document'
  }
];

/**
 * Split Format-Picker + Export Button following the Faculty Directory outline style
 * with high-contrast Dark Mode support.
 */
const ExportDropdownButton = ({
  label = 'Export',
  formats = ['xlsx', 'csv'],
  defaultFormat,
  onExport,
  disabled = false,
  isExporting = false,
  size = 'sm',
  storageKey = null,
  className = ''
}) => {
  const availableFormats = formats
    .map((f) => (typeof f === 'string' ? DEFAULT_FORMATS.find((df) => df.value === f) : f))
    .filter(Boolean);

  const getInitialFormat = () => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved && availableFormats.some((f) => f.value === saved)) return saved;
      } catch {
        // ignore storage errors
      }
    }
    return defaultFormat || availableFormats[0]?.value || 'xlsx';
  };

  const [selectedFormat, setSelectedFormat] = useState(getInitialFormat);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const containerRef = useRef(null);
  const toggleRef = useRef(null);

  const activeFormat =
    availableFormats.find((f) => f.value === selectedFormat) || availableFormats[0];

  const closeMenu = useCallback((returnFocus = false) => {
    setIsMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu(true);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, closeMenu]);

  const handleSelectFormat = (value) => {
    setSelectedFormat(value);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        // ignore
      }
    }
    closeMenu(true);
  };

  const handleTriggerExport = () => {
    if (disabled || isExporting || !onExport) return;
    closeMenu();
    onExport(activeFormat.value);
  };

  const sizeClass = size === 'sm' ? 'btn-sm py-2' : '';

  return (
    <div
      ref={containerRef}
      className={`btn-group position-relative shadow-sm ${className}`}
      role="group"
      aria-label={label}
    >
      {/* Left: Format Picker Dropdown Toggle */}
      <button
        ref={toggleRef}
        type="button"
        className={`btn btn-outline-success ${sizeClass} fw-semibold d-inline-flex align-items-center gap-2 px-3`}
        onClick={() => setIsMenuOpen((open) => !open)}
        disabled={disabled || isExporting}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        title="Choose export format"
      >
        <i className={`bi ${activeFormat.icon}`} style={{ color: activeFormat.color }}></i>
        <span>{activeFormat.shortLabel}</span>
        <i className={`bi bi-chevron-${isMenuOpen ? 'up' : 'down'} small`}></i>
      </button>

      {/* Right: Export Action Button (follows Faculty Directory outline style) */}
      <button
        type="button"
        className={`btn btn-outline-success ${sizeClass} fw-semibold d-inline-flex align-items-center gap-2 px-3`}
        style={{ borderLeftWidth: '0' }}
        onClick={handleTriggerExport}
        disabled={disabled || isExporting}
        title={`${label} as ${activeFormat.label}`}
      >
        {isExporting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <i className="bi bi-download"></i>
            <span>{label}</span>
          </>
        )}
      </button>

      {isMenuOpen && (
        <ul
          className="dropdown-menu show shadow p-1 export-format-dropdown"
          style={{
            backgroundColor: 'var(--surface-neutral)',
            borderColor: 'var(--border-subtle)'
          }}
          role="menu"
        >
          <li>
            <h6 className="dropdown-header text-uppercase small" style={{ color: 'var(--text-muted)' }}>
              Export format
            </h6>
          </li>
          {availableFormats.map((option) => {
            const isSelected = option.value === activeFormat.value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`dropdown-item rounded d-flex align-items-center gap-3 py-2 ${isSelected ? 'active' : ''}`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: 'rgba(25, 135, 84, 0.14)',
                          color: 'var(--text-main)'
                        }
                      : { color: 'var(--text-main)' }
                  }
                  onClick={() => handleSelectFormat(option.value)}
                >
                  <i className={`bi ${option.icon} fs-4`} style={{ color: option.color }}></i>
                  <span className="flex-grow-1 text-start">
                    <span className="d-block fw-semibold" style={{ color: 'var(--text-main)' }}>
                      {option.label}
                    </span>
                    <small style={{ color: 'var(--text-muted)' }}>{option.description}</small>
                  </span>
                  {isSelected && <i className="bi bi-check-lg text-success fs-5"></i>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ExportDropdownButton;
