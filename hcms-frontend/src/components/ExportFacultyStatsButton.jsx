import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';

// Keep in sync with STATISTICS_EXPORT_ROLES in hcms-backend/routes/statisticsRoutes.js
const STATISTICS_EXPORT_ROLES = ['admin', 'academic_head', 'program_head'];

const FALLBACK_FILENAME = () => `faculty-statistics-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
  const abortRef = useRef(null);

  // Cancel any in-flight export if the user navigates away mid-download.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!STATISTICS_EXPORT_ROLES.includes(user?.role)) return null;

  const handleExport = async () => {
    if (isExporting) return;

    const token = user?.token || JSON.parse(sessionStorage.getItem('hireSenseUser') || 'null')?.token;
    if (!token) {
      toast.error('You are not logged in.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    const toastId = toast.loading('Generating faculty statistics report...');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/statistics/export-faculty`, {
        method: 'GET',
        // Token goes in the Authorization header (never the query string) so it isn't written to server/proxy logs.
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error('The server returned an empty file.');

      const filename = parseFilename(response.headers.get('Content-Disposition')) || FALLBACK_FILENAME();
      triggerBlobDownload(blob, filename);
      toast.success('Faculty statistics exported successfully!', { id: toastId });
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
    <button
      type="button"
      id="export-faculty-stats-btn"
      className={`btn btn-success fw-bold shadow-sm d-inline-flex align-items-center gap-2 ${className}`}
      onClick={handleExport}
      disabled={isExporting}
      aria-busy={isExporting}
      title="Download faculty compliance statistics as an Excel workbook"
    >
      {isExporting ? (
        <>
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          Generating...
        </>
      ) : (
        <>
          <i className="bi bi-file-earmark-spreadsheet-fill"></i>
          Export Faculty Statistics
        </>
      )}
    </button>
  );
}

export default ExportFacultyStatsButton;
