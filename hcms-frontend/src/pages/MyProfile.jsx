import { useState, useEffect } from 'react';

function MyProfile({ user }) {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showPasswords, setShowPasswords] = useState(false);

  // NEW: State for the Rating Scale feature
  const [uniqueSkills, setUniqueSkills] = useState([]);
  const [ratings, setRatings] = useState(user?.skillRatings || {});
  const [ratingMessage, setRatingMessage] = useState('');

  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || ''
  });
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });

  // 1. Fetch the user's approved documents to find their AI skills
  useEffect(() => {
    const fetchMySkills = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/faculty/approved');
        const allDocs = await response.json();
        
        // Filter strictly to the logged-in user
        const myDocs = allDocs.filter(doc => {
          const fullName = `${doc.firstName} ${doc.lastName}`.toLowerCase();
          const loggedInNameParts = user.name.toLowerCase().split(' ');
          return loggedInNameParts.every(part => fullName.includes(part));
        });

        // Extract and deduplicate all tags
        const allTags = myDocs.flatMap(doc => doc.tags);
        const uniqueTags = [...new Set(allTags)];
        setUniqueSkills(uniqueTags);
      } catch (error) {
        console.error('Error fetching skills:', error);
      }
    };
    if (user) fetchMySkills();
  }, [user]);

  // 2. Handle clicking a star
  const handleRatingChange = (skill, value) => {
    setRatings(prev => ({ ...prev, [skill]: value }));
  };

  // 3. Save the ratings to the database
  const handleSaveRatings = async () => {
    setRatingMessage('');
    try {
      const response = await fetch(`http://localhost:5000/api/users/${user.id || user._id}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillRatings: ratings })
      });

      if (response.ok) {
        setRatingMessage('Proficiency ratings saved successfully!');
        setTimeout(() => setRatingMessage(''), 3000);
      } else {
        setRatingMessage('Failed to save ratings.');
      }
    } catch (error) {
      setRatingMessage('Server error while saving ratings.');
    }
  };

  // --- PASSWORD FUNCTIONS (Unchanged) ---
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
        <span className="text-muted">Manage your account details, security, and skill proficiency.</span>
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

        {/* Card 2 & 3 Column */}
        <div className="col-md-7">
          
          {/* NEW: Skill Self-Assessment Card */}
          <div className="card shadow-sm border-0 rounded-3 p-4 mb-4 bg-white border-start border-4 border-warning">
            <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
              <h5 className="fw-bold text-dark mb-0"><i className="bi bi-star-half text-warning me-2"></i> Skill Proficiency Scale</h5>
            </div>
            
            <p className="text-muted small mb-4">Please rate your proficiency (1 = Beginner, 5 = Expert) for the skills extracted from your verified credentials.</p>

            {ratingMessage && (
              <div className={`alert ${ratingMessage.includes('successfully') ? 'alert-success' : 'alert-danger'} py-2 border-0 shadow-sm`}>
                <i className="bi bi-info-circle-fill me-2"></i>{ratingMessage}
              </div>
            )}

            {uniqueSkills.length > 0 ? (
              <div className="mb-4">
                {uniqueSkills.map((skill, index) => (
                  <div key={index} className="d-flex justify-content-between align-items-center p-2 border-bottom">
                    <span className="fw-semibold text-secondary">{skill}</span>
                    <div className="text-warning fs-5" style={{ cursor: 'pointer' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <i 
                          key={star} 
                          className={`bi bi-star${ratings[skill] >= star ? '-fill' : ''} ms-1`}
                          onClick={() => handleRatingChange(skill, star)}
                        ></i>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={handleSaveRatings} className="btn w-100 fw-bold shadow-sm mt-4" style={{ backgroundColor: '#ffd700', color: '#0033a0' }}>
                  Save Proficiency Ratings
                </button>
              </div>
            ) : (
              <div className="text-center p-4 bg-light rounded text-muted">
                <i className="bi bi-inbox fs-3 d-block mb-2"></i>
                <small>No verified skills found. Upload credentials to generate skills.</small>
              </div>
            )}
          </div>

          {/* Card 3: Security Settings (Change Password) */}
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