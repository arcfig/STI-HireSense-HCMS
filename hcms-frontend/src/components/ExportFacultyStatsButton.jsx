import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

// Keep in sync with STATISTICS_EXPORT_ROLES in hcms-backend/routes/statisticsRoutes.js
const STATISTICS_EXPORT_ROLES = ['admin', 'academic_head', 'program_head'];

// Keep keys in sync with EXPORT_FORMATS in hcms-backend/controllers/statisticsController.js
const EXPORT_FORMATS = [
  {
    value: 'xlsx',
    label: 'Excel Workbook',
    shortLabel: 'Excel',
    extension: 'xlsx',
    icon: 'bi-file-earmark-excel-fill',
    color: '#1D6F42',
    description: 'Multi-sheet .xlsx with filters',
  },
  {
    value: 'pdf',
    label: 'PDF Report',
    shortLabel: 'PDF',
    extension: 'pdf',
    icon: 'bi-file-earmark-pdf-fill',
    color: '#C62828',
    description: 'Printable formatted report',
  },
  {
    value: 'csv',
    label: 'CSV (ZIP)',
    shortLabel: 'CSV',
    extension: 'zip',
    icon: 'bi-file-earmark-zip-fill',
    color: '#5D4037',
    description: 'Separate .csv files in a .zip',
  },
];

const FORMAT_STORAGE_KEY = 'hireSenseExportFormat';

const getFormat = (value) => EXPORT_FORMATS.find((f) => f.value === value) || EXPORT_FORMATS[0];

const loadSavedFormat = () => {
  try {
    return getFormat(localStorage.getItem(FORMAT_STORAGE_KEY)).value;
  } catch {
    return EXPORT_FORMATS[0].value;
  }
};

const fallbackFilename = (format) =>
  `faculty-statistics-${new Date().toISOString().slice(0, 10)}.${format.extension}`;

/** Extracts the filename from a Content-Disposition header (supports RFC 5987 filename*=). */
const parseFilename = (header) => {
  if (!header) return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch { /* fall through */ }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
};

/** Reads a JSON { error } body from a failed response, falling back to a status-based message. */
const getErrorMessage = async (response) => {
  const fallback = {
    400: 'The selected export format is not supported.',
    401: 'Your session has expired. Please log in again.',
    403: 'You do not have permission to export faculty statistics.',
    429: 'Too many export requests. Please wait a minute and try again.',
  }[response.status] || `Export failed (HTTP ${response.status}).`;

  try {
    const data = await response.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
};

/** Triggers a browser "Save file" prompt for a Blob without navigating away. */
const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so Safari/Firefox have time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function ExportFacultyStatsButton({ user, className = '' }) {
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(loadSavedFormat);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const abortRef = useRef(null);
  const containerRef = useRef(null);
  const toggleRef = useRef(null);
  const optionRefs = useRef([]);

  const format = getFormat(selectedFormat);

  // Cancel any in-flight export if the user navigates away mid-download.
  useEffect(() => () => abortRef.current?.abort(), []);

  const closeMenu = useCallback((returnFocus = false) => {
    setIsMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) closeMenu();
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

  // Move focus to the selected option when the menu opens (keyboard accessibility).
  useEffect(() => {
    if (isMenuOpen) {
      const index = EXPORT_FORMATS.findIndex((f) => f.value === selectedFormat);
      optionRefs.current[index]?.focus();
    }
  }, [isMenuOpen, selectedFormat]);

  if (!STATISTICS_EXPORT_ROLES.includes(user?.role)) return null;

  const handleSelectFormat = (value) => {
    setSelectedFormat(value);
    try { localStorage.setItem(FORMAT_STORAGE_KEY, value); } catch { /* storage unavailable */ }
    closeMenu(true);
  };

  const handleMenuKeyDown = (e, index) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + EXPORT_FORMATS.length) % EXPORT_FORMATS.length;
      optionRefs.current[next]?.focus();
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  };

  const handleExport = async () => {
    if (isExporting) return;

    const token = user?.token || JSON.parse(sessionStorage.getItem('hireSenseUser') || 'null')?.token;
    if (!token) {
      toast.error('You are not logged in.');
      return;
    }

    // Snapshot the format so changing the dropdown mid-request can't mislabel the file.
    const exportFormat = format;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    closeMenu();
    const toastId = toast.loading(`Generating ${exportFormat.label}...`);

    try {
      const params = new URLSearchParams({ format: exportFormat.value });
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/statistics/export-faculty?${params}`,
        {
          method: 'GET',
          // Token goes in the Authorization header (never the query string) so it isn't written to server/proxy logs.
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error('The server returned an empty file.');

      // Prefer the server's filename, but guarantee the extension matches the chosen format.
      let filename = parseFilename(response.headers.get('Content-Disposition')) || fallbackFilename(exportFormat);
      if (!filename.toLowerCase().endsWith(`.${exportFormat.extension}`)) {
        filename = fallbackFilename(exportFormat);
      }

      triggerBlobDownload(blob, filename);
      toast.success(`${exportFormat.label} downloaded successfully!`, { id: toastId });
    } catch (error) {
      if (error.name === 'AbortError') {
        toast.dismiss(toastId);
        return;
      }
      console.error('Faculty statistics export failed:', error);
      toast.error(error.message || 'Failed to export faculty statistics.', { id: toastId });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setIsExporting(false);
    }
  };

  return (
    <div ref={containerRef} className={`btn-group position-relative shadow-sm ${className}`} role="group" aria-label="Export faculty statistics">
      {/* Format selector */}
      <button
        ref={toggleRef}
        type="button"
        id="export-format-toggle"
        className="btn btn-outline-success fw-semibold d-inline-flex align-items-center gap-2"
        style={{ backgroundColor: 'var(--surface-neutral)' }}
        onClick={() => setIsMenuOpen((open) => !open)}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls="export-format-menu"
        title="Choose export format"
      >
        <i className={`bi ${format.icon}`} style={{ color: format.color }}></i>
        <span>{format.shortLabel}</span>
        <i className={`bi bi-chevron-${isMenuOpen ? 'up' : 'down'} small`}></i>
      </button>

      {/* Export action */}
      <button
        type="button"
        id="export-faculty-stats-btn"
        className="btn btn-success fw-bold d-inline-flex align-items-center gap-2"
        onClick={handleExport}
        disabled={isExporting}
        aria-busy={isExporting}
        title={`Download faculty compliance statistics as ${format.label}`}
      >
        {isExporting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Generating...
          </>
        ) : (
          <>
            <i className="bi bi-download"></i>
            Export Faculty Statistics
          </>
        )}
      </button>

      {isMenuOpen && (
        <ul
          id="export-format-menu"
          className="dropdown-menu show shadow p-1 export-format-dropdown"
          role="menu"
          aria-labelledby="export-format-toggle"
        >
          <li><h6 className="dropdown-header text-uppercase small">Export format</h6></li>
          {EXPORT_FORMATS.map((option, index) => {
            const isSelected = option.value === selectedFormat;
            return (
              <li key={option.value}>
                <button
                  ref={(el) => { optionRefs.current[index] = el; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`dropdown-item rounded d-flex align-items-center gap-3 py-2 ${isSelected ? 'active' : ''}`}
                  style={isSelected ? { backgroundColor: 'var(--bs-success-bg-subtle)', color: 'var(--bs-emphasis-color)' } : undefined}
                  onClick={() => handleSelectFormat(option.value)}
                  onKeyDown={(e) => handleMenuKeyDown(e, index)}
                >
                  <i className={`bi ${option.icon} fs-4`} style={{ color: option.color }}></i>
                  <span className="flex-grow-1">
                    <span className="d-block fw-semibold">{option.label}</span>
                    <small className="text-body-secondary">{option.description}</small>
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
}

export default ExportFacultyStatsButton;
