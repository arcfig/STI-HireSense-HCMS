import { useState, useEffect } from 'react';

function ManageUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const response = await fetch(`http://localhost:5000/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        setMessage({ text: 'User role updated successfully.', type: 'success' });
        fetchUsers();
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      } else {
        setMessage({ text: 'Failed to update role.', type: 'danger' });
      }
    } catch (error) {
      setMessage({ text: 'Server error.', type: 'danger' });
    }
  };

  const handleDelete = async (userId, username) => {
    if (username === 'main.admin') {
      return setMessage({ text: 'Security override: Cannot delete the master admin.', type: 'danger' });
    }
    
    if (!window.confirm(`Are you sure you want to permanently delete the account for ${username}?`)) return;

    try {
      const response = await fetch(`http://localhost:5000/api/users/${userId}`, { method: 'DELETE' });
      
      if (response.ok) {
        setMessage({ text: 'User account deleted.', type: 'success' });
        fetchUsers();
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      } else {
        const data = await response.json();
        setMessage({ text: data.error || 'Failed to delete user.', type: 'danger' });
      }
    } catch (error) {
      setMessage({ text: 'Server error.', type: 'danger' });
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1">System User Management</h2>
          <span className="text-muted">Control access levels and manage registered accounts.</span>
        </div>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type} py-2 shadow-sm border-0`}>
          <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i> 
          {message.text}
        </div>
      )}

      <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light text-secondary">
              <tr>
                <th className="py-3 px-4 fw-semibold border-bottom-0">Full Name</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0">System Username</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0">Access Role</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0 text-center">Administrative Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td className="px-4 py-3 fw-bold text-dark">{user.name}</td>
                  <td className="px-4 py-3 text-muted">{user.username}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${user.role === 'hr' ? 'bg-primary' : 'bg-secondary'} px-3 py-2 text-uppercase`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {/* Prevent the logged-in user from deleting or demoting themselves */}
                    {user.username !== currentUser.username && user.username !== 'main.admin' ? (
                      <div className="d-flex justify-content-center gap-2">
                        {user.role === 'faculty' ? (
                          <button onClick={() => handleRoleChange(user._id, 'hr')} className="btn btn-sm btn-outline-primary fw-bold px-3">
                            <i className="bi bi-shield-arrow-up me-1"></i> Make HR
                          </button>
                        ) : (
                          <button onClick={() => handleRoleChange(user._id, 'faculty')} className="btn btn-sm btn-outline-secondary fw-bold px-3">
                            <i className="bi bi-shield-arrow-down me-1"></i> Make Faculty
                          </button>
                        )}
                        <button onClick={() => handleDelete(user._id, user.username)} className="btn btn-sm btn-danger fw-bold px-3 shadow-sm">
                          <i className="bi bi-trash3-fill"></i>
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted small fst-italic">System Protected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ManageUsers;