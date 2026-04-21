import { useState } from 'react';

function MyProfile({ user }) {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showPasswords, setShowPasswords] = useState(false);

  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || ''
  });
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });

  // --- PASSWORD & PROFILE FUNCTIONS ---
  const handleLogout = () => {
    localStorage.removeItem('hireSenseUser');
    window.location.href = '/'; 
  };

  const handlePasswordChange = (e) => setPasswords({ ...passwords, [e.target.name]: e.target.value });

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (passwords.newPassword !== passwords.confirmPassword) {
      return setMessage({ text: "New passwords do not match.", type: "danger" });
    }
    if (passwords.newPassword.length < 6) {
      return setMessage({ text: "Password must be at least 6 characters.", type: "danger" });
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/change-password', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, currentPassword: passwords.currentPassword, newPassword: passwords.newPassword })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage({ text: "Password updated successfully!", type: "success" });
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); 
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
      } else {
        setMessage({ text: data.error || "Failed to update password.", type: "danger" });
      }
    } catch (error) {
      setMessage({ text: "Server error. Could not connect to backend.", type: "danger" });
    }
  };

  const handleProfileChange = (e) => {
    setProfileData({ ...profileData, [e.target.name]: e.target.value });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMessage({ text: '', type: '' });

    try {
      const response = await fetch(`http://localhost:5000/api/users/${user.id || user._id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      const data = await response.json();

      if (response.ok) {
        setProfileMessage({ text: "Profile details updated! Please log in again to see changes.", type: "success" });
        // Update local storage so the UI doesn't break
        localStorage.setItem('hireSenseUser', JSON.stringify(data.user));
        setTimeout(() => setProfileMessage({ text: '', type: '' }), 4000);
      } else {
        setProfileMessage({ text: data.error || "Failed to update profile.", type: "danger" });
      }
    } catch (error) {
      setProfileMessage({ text: "Server error.", type: "danger" });
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="fw-bold text-dark mb-1">My Profile</h2>
        <span className="text-muted">Manage your account details and security.</span>
      </div>

      <div className="row g-4">
        
        {/* Card 1: Account Details & Logout */}
        <div className="col-md-5">
          <div className="card shadow-sm border-0 rounded-3 p-4 mb-4 bg-white">
            <h5 className="fw-bold text-secondary mb-4 border-bottom pb-2">
              <i className="bi bi-person-badge text-primary me-2"></i> Account Details
            </h5>
            
            <div className="mb-3">
              <label className="text-muted small fw-bold text-uppercase">Full Name</label>
              <p className="fs-5 text-dark fw-semibold mb-0">{user?.name}</p>
            </div>

            {profileMessage.text && (
              <div className={`alert alert-${profileMessage.type} py-2 small border-0 shadow-sm`}>
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit}>
              <div className="mb-3">
                <label className="text-muted small fw-bold text-uppercase">System Username</label>
                <input type="text" className="form-control bg-light" name="username" value={profileData.username} onChange={handleProfileChange} required />
              </div>
              
              <div className="mb-3">
                <label className="text-muted small fw-bold text-uppercase">Email Address (For 2FA)</label>
                <input type="email" className="form-control bg-light" name="email" value={profileData.email} onChange={handleProfileChange} placeholder="e.g., faculty@sti.edu" />
              </div>

              <div className="mb-4">
                <label className="text-muted small fw-bold text-uppercase">SMS Number (For 2FA)</label>
                <input type="text" className="form-control bg-light" name="phoneNumber" value={profileData.phoneNumber} onChange={handleProfileChange} placeholder="e.g., 09123456789" />
              </div>

              <button type="submit" className="btn btn-outline-primary btn-sm w-100 fw-bold shadow-sm mb-4">
                <i className="bi bi-save me-2"></i> Save Profile Details
              </button>
            </form>

            <div className="mb-4">
              <label className="text-muted small fw-bold text-uppercase">Access Level</label>
              <div><span className={`badge ${['hr', 'admin'].includes(user?.role) ? 'bg-primary' : 'bg-secondary'} px-3 py-2 text-uppercase`}>{user?.role}</span></div>
            </div>

            <div className="mt-auto pt-4 border-top">
              <button onClick={handleLogout} className="btn btn-outline-danger fw-bold w-100 shadow-sm"><i className="bi bi-box-arrow-right me-2"></i> Secure Logout</button>
            </div>
          </div>
        </div>

        {/* Card 2 Column (Security Settings) */}
        <div className="col-md-7">
          
          {/* Security Settings (Change Password) */}
          <div className="card shadow-sm border-0 rounded-3 p-4 bg-white">
            <h5 className="fw-bold text-secondary mb-4 border-bottom pb-2"><i className="bi bi-shield-lock text-primary me-2"></i> Security Settings</h5>
            {message.text && <div className={`alert alert-${message.type} py-2 border-0 shadow-sm`}><i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>{message.text}</div>}
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary">Current Password</label>
                <div className="input-group">
                  <input type={showPasswords ? "text" : "password"} className="form-control bg-light border-end-0 focus-ring" name="currentPassword" value={passwords.currentPassword} onChange={handlePasswordChange} required />
                  <button className="btn btn-outline-secondary bg-light border-start-0" type="button" onClick={() => setShowPasswords(!showPasswords)}><i className={`bi ${showPasswords ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-semibold text-secondary">New Password</label>
                  <input type={showPasswords ? "text" : "password"} className="form-control bg-light focus-ring" name="newPassword" value={passwords.newPassword} onChange={handlePasswordChange} required minLength="6" />
                </div>
                <div className="col-md-6 mb-4">
                  <label className="form-label fw-semibold text-secondary">Confirm Password</label>
                  <input type={showPasswords ? "text" : "password"} className="form-control bg-light focus-ring" name="confirmPassword" value={passwords.confirmPassword} onChange={handlePasswordChange} required minLength="6" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary fw-bold px-4 shadow-sm" disabled={!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword}>Update Password</button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default MyProfile;