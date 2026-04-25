import React, { useState, useEffect } from 'react';

const ArchivedUsers = () => {
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Retrieve the token once at the top
  const savedUser = JSON.parse(localStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  useEffect(() => {
    fetchArchivedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchArchivedUsers = async () => {
    try {
      // --- UPDATED: FETCH WITH TOKEN ---
      const response = await fetch('http://localhost:5000/api/users/archived', {
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
      const response = await fetch(`http://localhost:5000/api/users/${userId}/restore`, {
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
    <div className="container mt-4">
      <h2 className="fw-bold mb-1">Archived Accounts</h2>
      <p className="text-muted mb-4">Review and restore disabled system accounts.</p>

      <div className="card shadow-sm border-0">
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="px-4 py-3">Full Name</th>
                <th className="py-3">System Username</th>
                <th className="py-3">Access Role</th>
                <th className="text-end px-4 py-3">Administrative Actions</th>
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
                    <td className="px-4 py-3 fw-bold">{user.name}</td>
                    <td className="py-3">{user.username}</td>
                    <td className="py-3">
                      <span className="badge bg-secondary text-uppercase">{user.role}</span>
                    </td>
                    <td className="text-end px-4 py-3">
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
  );
};

export default ArchivedUsers;