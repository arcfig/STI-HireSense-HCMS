import { useState, useEffect } from 'react';

function ManageUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [filterRole, setFilterRole] = useState('');

  // 1. Retrieve the token once at the top
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  useEffect(() => {
    const fetchUsers = async () => {
      // Safety check: prevent unauthorized fetch attempts
      if (!token) {
        console.error("No authentication token found.");
        return;
      }

      try {
        // --- UPDATED: FETCH WITH TOKEN ---
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/active`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (response.ok && Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error("Failed to load users:", data.error);
          setUsers([]);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        setUsers([]);
      }
    };

    fetchUsers();
  }, [token]); // Added token as a dependency

  const handleRoleChange = async (userId, newRole) => {
    try {
      // --- UPDATED: PUT WITH TOKEN ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        setMessage({ text: 'User role updated successfully.', type: 'success' });
        
        // Refresh active users
        const fetchUpdatedUsers = async () => {
           const refreshResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/active`, {
             method: 'GET',
             headers: { 
               'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
               'Content-Type': 'application/json'
             }
           });
           const data = await refreshResponse.json();
           if (refreshResponse.ok && Array.isArray(data)) setUsers(data);
        };
        fetchUpdatedUsers();
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      } else {
        setMessage({ text: 'Failed to update role.', type: 'danger' });
      }
    } catch (error) {
      setMessage({ text: 'Server error.', type: 'danger' });
    }
  };

  const handleArchive = async (userId, username) => {
    if (username === 'main.admin') {
      return setMessage({ text: 'Security override: Cannot archive the master admin.', type: 'danger' });
    }
    
    if (!window.confirm(`Are you sure you want to archive the account for ${username}?`)) return;

    try {
      // --- UPDATED: PUT WITH TOKEN ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/${userId}/archive`, { 
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setMessage({ text: 'User account successfully archived.', type: 'success' });
        
        // Remove the archived user from the active UI state immediately
        setUsers(users.filter(user => user._id !== userId));
        
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      } else {
        const data = await response.json();
        setMessage({ text: data.error || 'Failed to archive user.', type: 'danger' });
      }
    } catch (error) {
      setMessage({ text: 'Server error.', type: 'danger' });
    }
  };

  // Helper function to format role text (e.g., "academic_head" -> "ACADEMIC HEAD")
  const formatRoleText = (role) => {
    if (!role) return '';
    return role.replace('_', ' ').toUpperCase();
  };

  // Helper function for visual distinction of roles
  const getBadgeColor = (role) => {
    if (role === 'admin') return 'bg-danger';
    if (['academic_head', 'program_head'].includes(role)) return 'bg-primary';
    return 'bg-secondary';
  };

  // Processed users (Filter + Sort)
  const processedUsers = users
    .filter(user => {
      if (filterRole && user.role !== filterRole) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        user.name?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'username') return (a.username || '').localeCompare(b.username || '');
      if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
      return 0;
    });

  return (
    <div>
      <div className="mb-4 flex-shrink-0">
        <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
          <i className="bi bi-person-lines-fill text-primary me-2"></i>System User Management
        </h2>
        <p className="text-muted mb-0">Control access levels and manage registered accounts.</p>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type} py-2 shadow-sm border-0`}>
          <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i> 
          {message.text}
        </div>
      )}

      {/* --- SEARCH & FILTER BAR --- */}
      <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
        <div className="card-body p-3">
          <div className="row g-2">
            <div className="col-md-5">
              <div className="input-group">
                <span className="input-group-text border-end-0" style={{ backgroundColor: 'transparent' }}><i className="bi bi-search text-muted"></i></span>
                <input 
                  type="text" 
                  className="form-control border-start-0 ps-0" 
                  placeholder="Search by name or username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-4">
              <select 
                className="form-select"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
              >
                <option value="">All Access Roles</option>
                <option value="faculty">Faculty</option>
                <option value="academic_head">Academic Head</option>
                <option value="program_head">Program Head</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-md-3">
              <select 
                className="form-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort by Name</option>
                <option value="username">Sort by Username</option>
                <option value="role">Sort by Role</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="text-secondary" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
              <tr>
                <th className="py-3 px-4 fw-semibold border-bottom-0">Full Name</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0">System Username</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0">Access Role</th>
                <th className="py-3 px-4 fw-semibold border-bottom-0 text-center">Administrative Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedUsers.map((user) => (
                <tr key={user._id}>
                  <td className="px-4 py-3 fw-bold" style={{ color: 'var(--text-main)' }}>{user.name}</td>
                  <td className="px-4 py-3 text-muted">{user.username}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${getBadgeColor(user.role)} px-3 py-2`}>
                      {formatRoleText(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {/* Prevent the logged-in user from altering themselves */}
                    {user.username !== currentUser.username && user.username !== 'main.admin' ? (
                      <div className="d-flex justify-content-center align-items-center gap-2">
                        
                        {/* --- NEW: Scalable Role Selection Dropdown --- */}
                        <select 
                          className="form-select form-select-sm shadow-sm" 
                          style={{ width: '150px', cursor: 'pointer' }}
                          value={user.role}
                          onChange={(e) => handleRoleChange(user._id, e.target.value)}
                        >
                          <option value="faculty">Faculty</option>
                          <option value="academic_head">Academic Head</option>
                          <option value="program_head">Program Head</option>
                          <option value="admin">Admin</option>
                        </select>
                        
                        <button 
                          onClick={() => handleArchive(user._id, user.username)} 
                          className="btn btn-sm btn-warning text-dark fw-bold px-3 shadow-sm"
                          title="Archive Account"
                        >
                          <i className="bi bi-archive-fill"></i>
                        </button>
                        
                      </div>
                    ) : (
                      <span className="text-muted small fst-italic">System Protected</span>
                    )}
                  </td>
                </tr>
              ))}
              
              {processedUsers.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-4 text-muted">No active user accounts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ManageUsers;