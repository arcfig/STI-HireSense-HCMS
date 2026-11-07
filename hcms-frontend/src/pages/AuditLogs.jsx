import { useState, useEffect } from 'react';

function AuditLogs({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [summary, setSummary] = useState({
    totalEvents: 0,
    adminEvents: 0,
    securityAlerts: 0,
    exportEvents: 0,
  });

  // Filter & pagination controls
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [excludeSelfReads, setExcludeSelfReads] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);

  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const token = currentUser?.token || savedUser?.token;

  // Debounce text search so typing doesn't fire an API request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let ignore = false;

    const loadAuditLogs = async () => {
      if (!token) {
        if (!ignore) {
          setError('Authentication token missing. Please log in again.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '50',
        });
        if (filterRole) params.set('userRole', filterRole);
        if (filterAction) params.set('actionType', filterAction);
        if (filterStatus) params.set('status', filterStatus);
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (excludeSelfReads) params.set('excludeSelfReads', 'true');

        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/audit-logs?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json().catch(() => ({}));
        if (ignore) return;

        if (!response.ok) {
          setError(data.error || 'Failed to load audit logs.');
          setLogs([]);
        } else {
          setLogs(Array.isArray(data.logs) ? data.logs : []);
          if (data.pagination) setPagination(data.pagination);
          if (data.summary) setSummary(data.summary);
        }
      } catch {
        if (!ignore) {
          setError('Unable to reach the server while loading audit logs.');
          setLogs([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadAuditLogs();

    return () => {
      ignore = true;
    };
  }, [token, page, filterRole, filterAction, filterStatus, debouncedSearch, excludeSelfReads, refreshTick]);

  const formatRoleText = (role) => {
    if (!role) return 'UNKNOWN';
    return role.replace('_', ' ').toUpperCase();
  };

  const getRoleBadgeClass = (role) => {
    if (role === 'admin') return 'bg-danger';
    if (['academic_head', 'program_head'].includes(role)) return 'bg-primary';
    return 'bg-secondary';
  };

  const getActionBadgeClass = (actionType) => {
    switch (actionType) {
      case 'LOGIN':
        return 'bg-info text-dark';
      case 'EXPORT':
        return 'bg-warning text-dark';
      case 'DELETE':
        return 'bg-danger';
      case 'WRITE':
        return 'bg-success';
      case 'READ':
      default:
        return 'bg-secondary';
    }
  };

  const getStatusBadgeClass = (code) => {
    if (!code) return 'bg-secondary';
    if (code >= 400) return 'bg-danger';
    if (code >= 300) return 'bg-warning text-dark';
    return 'bg-success-subtle text-success border border-success-subtle';
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setFilterRole('');
    setFilterAction('');
    setFilterStatus('');
    setExcludeSelfReads(false);
    setPage(1);
  };

  return (
    <div>
      {/* --- HEADER --- */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
            <i className="bi bi-journal-check text-success me-2"></i>Security &amp; Audit History
          </h2>
          <p className="text-muted mb-0">
            Immutable forensic trail of logins, data access, exports, and account modifications across all roles—including administrators.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline-success fw-semibold shadow-sm d-flex align-items-center gap-2"
          onClick={() => setRefreshTick((t) => t + 1)}
          disabled={loading}
        >
          <i className={`bi ${loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'}`}></i>
          {loading ? 'Refreshing...' : 'Refresh Logs'}
        </button>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3">
          <div className="card shadow-sm border-0 h-100" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            <div className="card-body d-flex align-items-center justify-content-between p-3">
              <div>
                <div className="text-muted small fw-semibold text-uppercase">Total Events</div>
                <div className="fs-4 fw-bold" style={{ color: 'var(--text-main)' }}>
                  {summary.totalEvents.toLocaleString()}
                </div>
              </div>
              <i className="bi bi-activity fs-3 text-success opacity-75"></i>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div
            className="card shadow-sm border-0 h-100"
            style={{
              backgroundColor: 'var(--surface-neutral)',
              cursor: 'pointer',
              outline: filterRole === 'admin' ? '2px solid var(--bs-danger)' : 'none',
            }}
            onClick={() => {
              setFilterRole((prev) => (prev === 'admin' ? '' : 'admin'));
              setPage(1);
            }}
            title="Click to filter administrator events"
          >
            <div className="card-body d-flex align-items-center justify-content-between p-3">
              <div>
                <div className="text-muted small fw-semibold text-uppercase">Admin Actions</div>
                <div className="fs-4 fw-bold text-danger">
                  {summary.adminEvents.toLocaleString()}
                </div>
              </div>
              <i className="bi bi-shield-shaded fs-3 text-danger opacity-75"></i>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div
            className="card shadow-sm border-0 h-100"
            style={{
              backgroundColor: 'var(--surface-neutral)',
              cursor: 'pointer',
              outline: filterAction === 'EXPORT' ? '2px solid var(--bs-warning)' : 'none',
            }}
            onClick={() => {
              setFilterAction((prev) => (prev === 'EXPORT' ? '' : 'EXPORT'));
              setPage(1);
            }}
            title="Click to filter report exports"
          >
            <div className="card-body d-flex align-items-center justify-content-between p-3">
              <div>
                <div className="text-muted small fw-semibold text-uppercase">Data Exports</div>
                <div className="fs-4 fw-bold text-warning">
                  {summary.exportEvents.toLocaleString()}
                </div>
              </div>
              <i className="bi bi-file-earmark-arrow-down-fill fs-3 text-warning opacity-75"></i>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-xl-3">
          <div
            className="card shadow-sm border-0 h-100"
            style={{
              backgroundColor: 'var(--surface-neutral)',
              cursor: 'pointer',
              outline: filterStatus === 'error' ? '2px solid var(--bs-danger)' : 'none',
            }}
            onClick={() => {
              setFilterStatus((prev) => (prev === 'error' ? '' : 'error'));
              setPage(1);
            }}
            title="Click to filter denied or failed requests"
          >
            <div className="card-body d-flex align-items-center justify-content-between p-3">
              <div>
                <div className="text-muted small fw-semibold text-uppercase">Denied / Errors</div>
                <div className="fs-4 fw-bold" style={{ color: 'var(--text-main)' }}>
                  {summary.securityAlerts.toLocaleString()}
                </div>
              </div>
              <i className="bi bi-exclamation-octagon-fill fs-3 text-danger opacity-75"></i>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 shadow-sm border-0">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          {error}
        </div>
      )}

      {/* --- FILTER BAR --- */}
      <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            <div className="col-lg-4">
              <div className="input-group">
                <span className="input-group-text border-end-0" style={{ backgroundColor: 'transparent' }}>
                  <i className="bi bi-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 ps-0"
                  placeholder="Search user, endpoint, document ID, or IP..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="col-sm-4 col-lg-2">
              <select
                className="form-select"
                value={filterRole}
                onChange={(e) => {
                  setFilterRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="academic_head">Academic Head</option>
                <option value="program_head">Program Head</option>
                <option value="faculty">Faculty</option>
              </select>
            </div>

            <div className="col-sm-4 col-lg-2">
              <select
                className="form-select"
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Actions</option>
                <option value="LOGIN">LOGIN</option>
                <option value="READ">READ</option>
                <option value="WRITE">WRITE</option>
                <option value="DELETE">DELETE</option>
                <option value="EXPORT">EXPORT</option>
              </select>
            </div>

            <div className="col-sm-4 col-lg-2">
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Outcomes</option>
                <option value="success">Success (2xx)</option>
                <option value="error">Denied / Error (4xx-5xx)</option>
              </select>
            </div>

            <div className="col-lg-2 d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary w-100"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="form-check form-switch mt-2 pt-1">
            <input
              className="form-check-input"
              type="checkbox"
              id="excludeSelfReadsSwitch"
              checked={excludeSelfReads}
              onChange={(e) => {
                setExcludeSelfReads(e.target.checked);
                setPage(1);
              }}
            />
            <label className="form-check-label small text-muted" htmlFor="excludeSelfReadsSwitch">
              Hide <code>/api/audit-logs</code> viewer reads from list (still recorded in database)
            </label>
          </div>
        </div>
      </div>

      {/* --- AUDIT TABLE --- */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden" style={{ backgroundColor: 'var(--surface-neutral)' }}>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="text-secondary" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
              <tr>
                <th className="py-3 px-4 fw-semibold border-bottom-0">Timestamp</th>
                <th className="py-3 px-3 fw-semibold border-bottom-0">Account</th>
                <th className="py-3 px-3 fw-semibold border-bottom-0">Role</th>
                <th className="py-3 px-3 fw-semibold border-bottom-0">Action</th>
                <th className="py-3 px-3 fw-semibold border-bottom-0">Target Resource</th>
                <th className="py-3 px-3 fw-semibold border-bottom-0 text-center">HTTP</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted">
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted">
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((entry) => {
                  const isCurrentUser =
                    currentUser?.username && entry.username === currentUser.username;

                  return (
                    <tr key={entry._id}>
                      <td className="px-4 py-3 small text-nowrap" style={{ color: 'var(--text-main)' }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                      </td>

                      <td className="px-3 py-3">
                        <div className="fw-bold d-flex align-items-center gap-1" style={{ color: 'var(--text-main)' }}>
                          <span>{entry.actorName}</span>
                          {isCurrentUser && (
                            <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: '0.65rem' }}>
                              YOU
                            </span>
                          )}
                          {entry.isDeletedUser && (
                            <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                              DELETED
                            </span>
                          )}
                        </div>
                        <div className="text-muted small">@{entry.username}</div>
                      </td>

                      <td className="px-3 py-3">
                        <span className={`badge ${getRoleBadgeClass(entry.userRole)} px-2 py-1`}>
                          {formatRoleText(entry.userRole)}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className={`badge ${getActionBadgeClass(entry.actionType)} px-2 py-1`}>
                          {entry.actionType}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="badge bg-dark-subtle text-body me-2 font-monospace">
                          {entry.httpMethod}
                        </span>
                        <code className="small" style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>
                          {entry.targetResource}
                        </code>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span className={`badge ${getStatusBadgeClass(entry.statusCode)} font-monospace`}>
                          {entry.statusCode || '—'}
                        </span>
                      </td>

                      <td
                        className="px-4 py-3 small font-monospace text-muted text-nowrap"
                        title={entry.userAgent ? `User-Agent: ${entry.userAgent}` : ''}
                      >
                        {entry.ipAddress}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* --- PAGINATION FOOTER --- */}
        <div
          className="d-flex flex-wrap justify-content-between align-items-center px-4 py-3 border-top gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <small className="text-muted">
            Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total.toLocaleString()} matching records)
          </small>

          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <i className="bi bi-chevron-left me-1"></i>Previous
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next<i className="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuditLogs;

