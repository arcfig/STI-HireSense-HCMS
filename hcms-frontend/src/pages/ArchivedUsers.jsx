import React, { useState, useEffect } from 'react';

const ArchivedUsers = () => {
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Retrieve the token once at the top
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  useEffect(() => {
    fetchArchivedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchArchivedUsers = async () => {
    try {
      // --- UPDATED: FETCH WITH TOKEN ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/archived`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setArchivedUsers(data);
      } else {
        console.error("Backend refused the request. Token may be invalid or expired.");
      }
    } catch (error) {
      console.error("Error fetching archived users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (userId) => {
    try {
      // --- UPDATED: PUT WITH TOKEN ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/${userId}/restore`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setArchivedUsers(archivedUsers.filter(user => user._id !== userId));
      } else {
        console.error("Failed to restore account. Backend refused the request.");
      }
    } catch (error) {
      console.error("Error restoring user:", error);
    }
  };

  if (loading) return <div className="container mt-5 text-center">Loading Archived Data...</div>;

  return (
    <div className="d-flex flex-column">
      <div className="mb-4 flex-shrink-0">
        <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
          <i className="bi bi-archive-fill text-primary me-2"></i>Archived Accounts
        </h2>
        <p className="text-muted mb-0">Review and restore disabled system accounts.</p>
      </div>

      {/* Mobile Archived Cards (< 768px) — Restore button always visible */}
      <div className="d-md-none d-flex flex-column gap-3 pb-3">
        {archivedUsers.length === 0 ? (
          <div className="card shadow-sm border-0 rounded-3 text-center py-4 text-muted" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            No archived accounts found.
          </div>
        ) : (
          archivedUsers.map((user) => (
            <div key={user._id} className="mobile-review-card">
              <div className="p-3 d-flex justify-content-between align-items-start gap-2">
                <div className="min-w-0">
                  <p className="fw-bold mb-0 text-truncate" style={{ color: 'var(--text-main)' }}>{user.name}</p>
                  <small className="text-muted">@{user.username}</small>
                </div>
                <span className="badge bg-secondary text-uppercase flex-shrink-0">{user.role}</span>
              </div>
              <div className="mobile-review-card__actions">
                <button
                  className="btn btn-success btn-sm fw-bold shadow-sm w-100"
                  onClick={() => handleRestore(user._id)}
                >
                  <i className="bi bi-arrow-counterclockwise me-1"></i> Restore Account
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Archived Table (>= 768px) */}
      <div className="card shadow-sm border-0 d-none d-md-block">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="text-secondary" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                <tr>
                  <th className="px-4 py-3 text-nowrap">Full Name</th>
                  <th className="py-3 text-nowrap">System Username</th>
                  <th className="py-3 text-nowrap">Access Role</th>
                  <th className="text-end px-4 py-3 text-nowrap">Administrative Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-muted">No archived accounts found.</td>
                  </tr>
                ) : (
                  archivedUsers.map((user) => (
                    <tr key={user._id} className="align-middle text-muted opacity-75">
                      <td className="px-4 py-3 fw-bold text-nowrap" style={{ color: 'var(--text-main)' }}>{user.name}</td>
                      <td className="py-3 text-nowrap">{user.username}</td>
                      <td className="py-3 text-nowrap">
                        <span className="badge bg-secondary text-uppercase">{user.role}</span>
                      </td>
                      <td className="text-end px-4 py-3 text-nowrap">
                        <button 
                          className="btn btn-success btn-sm fw-bold shadow-sm"
                          onClick={() => handleRestore(user._id)}
                        >
                          <i className="bi bi-arrow-counterclockwise me-1"></i> Restore Account
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchivedUsers;