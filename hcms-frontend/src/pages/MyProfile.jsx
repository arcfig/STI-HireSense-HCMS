import { useState, useEffect } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

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

  // Passkey Device Management state
  const [passkeys, setPasskeys] = useState([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [removingPasskeyId, setRemovingPasskeyId] = useState(null);
  const [webauthnMessage, setWebauthnMessage] = useState({ text: '', type: '' });
  const [isRegisteringBiometrics, setIsRegisteringBiometrics] = useState(false);

  // Email 6-Digit OTP Two-Factor Authentication (2FA) state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user?.twoFactorEnabled));
  const [twoFactorStep, setTwoFactorStep] = useState('idle'); // 'idle' | 'verifying'
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorMaskedEmail, setTwoFactorMaskedEmail] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    let ignore = false;
    const loadSecuritySettings = async () => {
      if (!user?.token) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/credentials`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok || ignore) return;
        const data = await res.json();
        if (ignore) return;

        setPasskeys(Array.isArray(data.credentials) ? data.credentials : []);
        setTwoFactorEnabled(Boolean(data.twoFactorEnabled));
        setProfileData(prev => ({
          ...prev,
          email: data.email || prev.email,
          phoneNumber: data.phoneNumber || prev.phoneNumber
        }));
      } catch (error) {
        if (!ignore) console.error('Failed to load security settings:', error);
      } finally {
        if (!ignore) setLoadingPasskeys(false);
      }
    };
    loadSecuritySettings();
    return () => { ignore = true; };
  }, [user?.token]);

  const syncUserSession = (updatedUserFields) => {
    try {
      const existing = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
      sessionStorage.setItem('hireSenseUser', JSON.stringify({
        ...existing,
        ...updatedUserFields,
        token: user.token
      }));
    } catch {
      // Ignore storage serialization errors
    }
  };

  const handleRegisterBiometrics = async () => {
    setWebauthnMessage({ text: '', type: '' });
    setIsRegisteringBiometrics(true);
    try {
      // 1. Get options from server
      const optRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/register/generate-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ username: user.username })
      });
      const options = await optRes.json();

      if (!optRes.ok) {
        throw new Error(options.error || 'Failed to get registration options');
      }

      // 2. Call WebAuthn API
      let asseResp;
      try {
        asseResp = await startRegistration({ optionsJSON: options });
      } catch (error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Registration cancelled or timed out.');
        }
        throw error;
      }

      // 3. Verify with server
      const verifyRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/register/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          username: user.username,
          response: asseResp,
          deviceName: customDeviceName.trim()
        })
      });

      const verification = await verifyRes.json();

      if (verifyRes.ok && verification.verified) {
        if (Array.isArray(verification.credentials)) {
          setPasskeys(verification.credentials);
        }
        setCustomDeviceName('');
        setWebauthnMessage({ text: 'Passkey registered successfully!', type: 'success' });
      } else {
        throw new Error(verification.error || 'Failed to verify Passkey registration');
      }
    } catch (error) {
      console.error(error);
      setWebauthnMessage({ text: error.message || 'Error during Passkey registration', type: 'danger' });
    } finally {
      setIsRegisteringBiometrics(false);
    }
  };

  const handleRemovePasskey = async (credentialId, deviceName) => {
    if (!window.confirm(`Remove "${deviceName}" from your registered Passkeys?`)) return;
    setWebauthnMessage({ text: '', type: '' });
    setRemovingPasskeyId(credentialId);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const data = await res.json();
      if (res.ok) {
        setPasskeys(Array.isArray(data.credentials) ? data.credentials : []);
        setWebauthnMessage({ text: data.message || 'Passkey removed.', type: 'success' });
      } else {
        setWebauthnMessage({ text: data.error || 'Failed to remove passkey.', type: 'danger' });
      }
    } catch {
      setWebauthnMessage({ text: 'Server error while removing passkey.', type: 'danger' });
    } finally {
      setRemovingPasskeyId(null);
    }
  };

  // --- EMAIL 2FA HANDLERS ---
  const handleSend2FASetupCode = async () => {
    setTwoFactorMessage({ text: '', type: '' });
    if (!profileData.email.trim()) {
      setTwoFactorMessage({
        text: 'Please enter your Email Address (For 2FA) in Account Details first.',
        type: 'danger'
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/2fa/send-setup-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ email: profileData.email.trim() })
      });
      const data = await res.json();

      if (res.ok) {
        setTwoFactorStep('verifying');
        setTwoFactorCode('');
        setTwoFactorMaskedEmail(data.maskedEmail || profileData.email.trim());
        if (data.user) syncUserSession(data.user);
        const modeHint = data.deliveryMode === 'console'
          ? ' (Local Dev Mode: check the backend server terminal for the 6-digit code).'
          : '';
        setTwoFactorMessage({
          text: `${data.message}${modeHint}`,
          type: 'info'
        });
      } else {
        setTwoFactorMessage({ text: data.error || 'Failed to send verification code.', type: 'danger' });
      }
    } catch {
      setTwoFactorMessage({ text: 'Server error while requesting verification code.', type: 'danger' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerify2FASetup = async (e) => {
    e.preventDefault();
    setTwoFactorMessage({ text: '', type: '' });
    setTwoFactorLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/2fa/verify-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ code: twoFactorCode.trim() })
      });
      const data = await res.json();

      if (res.ok && data.twoFactorEnabled) {
        setTwoFactorEnabled(true);
        setTwoFactorStep('idle');
        setTwoFactorCode('');
        if (data.user) syncUserSession(data.user);
        setTwoFactorMessage({ text: data.message || 'Email 2FA enabled!', type: 'success' });
      } else {
        setTwoFactorMessage({ text: data.error || 'Invalid verification code.', type: 'danger' });
      }
    } catch {
      setTwoFactorMessage({ text: 'Server error while verifying 2FA code.', type: 'danger' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!window.confirm('Disable Email Two-Factor Authentication on your account?')) return;
    setTwoFactorMessage({ text: '', type: '' });
    setTwoFactorLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        }
      });
      const data = await res.json();

      if (res.ok) {
        setTwoFactorEnabled(false);
        setTwoFactorStep('idle');
        setTwoFactorCode('');
        if (data.user) syncUserSession(data.user);
        setTwoFactorMessage({ text: data.message || 'Two-Factor Authentication disabled.', type: 'success' });
      } else {
        setTwoFactorMessage({ text: data.error || 'Failed to disable 2FA.', type: 'danger' });
      }
    } catch {
      setTwoFactorMessage({ text: 'Server error while disabling 2FA.', type: 'danger' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // --- PASSWORD & PROFILE FUNCTIONS ---
  const handleLogout = () => {
    sessionStorage.removeItem('hireSenseUser');
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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/change-password`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
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
    } catch {
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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/${user.id || user._id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify(profileData)
      });
      const data = await response.json();

      if (response.ok) {
        setProfileMessage({ text: "Profile details updated!", type: "success" });
        if (data.user) syncUserSession(data.user);
        setTimeout(() => setProfileMessage({ text: '', type: '' }), 4000);
      } else {
        setProfileMessage({ text: data.error || "Failed to update profile.", type: "danger" });
      }
    } catch {
      setProfileMessage({ text: "Server error.", type: "danger" });
    }
  };

  return (
    <div>
      <div className="mb-4 flex-shrink-0">
        <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
          <i className="bi bi-person-fill-gear text-primary me-2"></i>My Profile
        </h2>
        <p className="text-muted mb-0">Manage your account details and security.</p>
      </div>

      <div className="row g-4">

        {/* Card 1: Account Details & Email 2FA */}
        <div className="col-md-5">
          <div className="card shadow-sm border-0 rounded-3 p-4 mb-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            <h5 className="fw-bold text-secondary mb-4 border-bottom pb-2">
              <i className="bi bi-person-badge text-primary me-2"></i> Account Details
            </h5>

            <div className="mb-3">
              <label className="text-muted small fw-bold text-uppercase">Full Name</label>
              <p className="fs-5 fw-semibold mb-0" style={{ color: 'var(--text-main)' }}>{user?.name}</p>
            </div>

            {profileMessage.text && (
              <div className={`alert alert-${profileMessage.type} py-2 small border-0 shadow-sm`}>
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit}>
              <div className="mb-3">
                <label className="text-muted small fw-bold text-uppercase">System Username</label>
                <input type="text" className="form-control" name="username" value={profileData.username} onChange={handleProfileChange} required />
              </div>

              <div className="mb-3">
                <label className="text-muted small fw-bold text-uppercase">Email Address (For 2FA)</label>
                <input type="email" className="form-control" name="email" value={profileData.email} onChange={handleProfileChange} placeholder="e.g., faculty@sti.edu" />
              </div>

              <div className="mb-4">
                <label className="text-muted small fw-bold text-uppercase">SMS Number (Optional)</label>
                <input type="text" className="form-control" name="phoneNumber" value={profileData.phoneNumber} onChange={handleProfileChange} placeholder="e.g., 09123456789" />
              </div>

              <button type="submit" className="btn btn-primary btn-sm w-100 fw-bold shadow-sm mb-4">
                <i className="bi bi-save me-2"></i> Save Profile Details
              </button>
            </form>

            {/* Email 6-Digit OTP Two-Factor Authentication Section */}
            <div className="pt-3 mb-4 border-top">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <span className="text-muted small fw-bold text-uppercase d-block">Two-Factor Auth (Email OTP)</span>
                  <small className="text-muted">Require a 6-digit email code when signing in with a password.</small>
                </div>
                <span className={`badge ${twoFactorEnabled ? 'bg-success' : 'bg-secondary'} px-2 py-1 flex-shrink-0 ms-2`}>
                  {twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>

              {twoFactorMessage.text && (
                <div className={`alert alert-${twoFactorMessage.type} py-2 small border-0 shadow-sm mt-2 mb-2`}>
                  {twoFactorMessage.text}
                </div>
              )}

              {twoFactorEnabled ? (
                <div className="mt-2">
                  <div className="small text-muted mb-2">
                    <i className="bi bi-envelope-check-fill text-success me-1"></i>
                    Active on <strong>{profileData.email}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisable2FA}
                    disabled={twoFactorLoading}
                    className="btn btn-outline-danger btn-sm w-100 fw-bold"
                  >
                    {twoFactorLoading ? 'Updating...' : 'Disable Email 2FA'}
                  </button>
                </div>
              ) : twoFactorStep === 'verifying' ? (
                <form onSubmit={handleVerify2FASetup} className="mt-2">
                  <label className="form-label small fw-semibold text-secondary mb-1">
                    Enter 6-digit code sent to {twoFactorMaskedEmail}
                  </label>
                  <div className="d-flex gap-2 mb-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      className="form-control form-control-sm text-center fw-bold font-monospace"
                      style={{ letterSpacing: '0.25em', fontSize: '1rem' }}
                      placeholder="000000"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                    />
                    <button
                      type="submit"
                      disabled={twoFactorLoading || twoFactorCode.length !== 6}
                      className="btn btn-success btn-sm fw-bold px-3 flex-shrink-0"
                    >
                      {twoFactorLoading ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                  <div className="d-flex justify-content-between">
                    <button
                      type="button"
                      onClick={handleSend2FASetupCode}
                      disabled={twoFactorLoading}
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                    >
                      Resend Code
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTwoFactorStep('idle'); setTwoFactorMessage({ text: '', type: '' }); }}
                      className="btn btn-link btn-sm p-0 text-muted text-decoration-none"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={handleSend2FASetupCode}
                  disabled={twoFactorLoading}
                  className="btn btn-outline-primary btn-sm w-100 fw-bold mt-2"
                >
                  {twoFactorLoading ? (
                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending Code...</>
                  ) : (
                    <><i className="bi bi-shield-check me-1"></i> Enable Email 2FA</>
                  )}
                </button>
              )}
            </div>

            <div className="mb-4">
              <label className="text-muted small fw-bold text-uppercase">Access Level</label>
              <div><span className={`badge ${['hr', 'admin'].includes(user?.role) ? 'bg-primary' : 'bg-secondary'} px-3 py-2 text-uppercase`}>{user?.role}</span></div>
            </div>

            <div className="mt-auto pt-4 border-top">
              <button onClick={handleLogout} className="btn btn-outline-danger fw-bold w-100 shadow-sm"><i className="bi bi-box-arrow-right me-2"></i> Logout</button>
            </div>
          </div>
        </div>

        {/* Card 2 Column (Security Settings & Passkeys) */}
        <div className="col-md-7">

          {/* Security Settings (Change Password) */}
          <div className="card shadow-sm border-0 rounded-3 p-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            <h5 className="fw-bold text-secondary mb-4 border-bottom pb-2"><i className="bi bi-shield-lock text-primary me-2"></i> Security Settings</h5>
            {message.text && <div className={`alert alert-${message.type} py-2 border-0 shadow-sm`}><i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>{message.text}</div>}
            <form onSubmit={handlePasswordSubmit}>
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary">Current Password</label>
                <div className="input-group">
                  <input type={showPasswords ? "text" : "password"} className="form-control border-end-0 focus-ring" name="currentPassword" value={passwords.currentPassword} onChange={handlePasswordChange} required />
                  <button className="btn btn-outline-secondary border-start-0" type="button" onClick={() => setShowPasswords(!showPasswords)}><i className={`bi ${showPasswords ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-semibold text-secondary">New Password</label>
                  <input type={showPasswords ? "text" : "password"} className="form-control focus-ring" name="newPassword" value={passwords.newPassword} onChange={handlePasswordChange} required minLength="6" />
                </div>
                <div className="col-md-6 mb-4">
                  <label className="form-label fw-semibold text-secondary">Confirm Password</label>
                  <input type={showPasswords ? "text" : "password"} className="form-control focus-ring" name="confirmPassword" value={passwords.confirmPassword} onChange={handlePasswordChange} required minLength="6" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-100 fw-bold px-4 shadow-sm" disabled={!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword}>Update Password</button>
            </form>
          </div>

          {/* Passkeys (WebAuthn / FIDO2 + Device Management) */}
          <div className="card shadow-sm border-0 rounded-3 p-4 mt-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            <div className="d-flex align-items-start gap-3 mb-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: 'rgba(8, 97, 47, 0.1)',
                  color: 'var(--brand-primary-bg)'
                }}
              >
                <i className="bi bi-person-fill-lock fs-4"></i>
              </div>
              <div>
                <div className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
                  Security
                </div>
                <h5 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>Passkeys</h5>
                <p className="text-muted small mb-0">
                  Sign in securely using your device&apos;s fingerprint, face, PIN, or screen lock.
                </p>
              </div>
            </div>

            <div
              className="d-flex align-items-start gap-2 p-3 rounded-3 mb-3"
              style={{
                backgroundColor: 'rgba(8, 97, 47, 0.06)',
                border: '1px solid rgba(8, 97, 47, 0.2)'
              }}
            >
              <i className="bi bi-shield-check text-success fs-5 flex-shrink-0" style={{ marginTop: '-1px' }}></i>
              <p className="small mb-0" style={{ color: 'var(--text-main)', lineHeight: '1.45' }}>
                Your biometric information stays on your device. HireSense only stores the cryptographic credential required for Passkey authentication.
              </p>
            </div>

            {/* Registered Passkey Devices List */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted small fw-bold text-uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                  Registered Devices ({passkeys.length})
                </span>
              </div>

              {loadingPasskeys ? (
                <div className="text-muted small py-2">
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Loading passkeys...
                </div>
              ) : passkeys.length === 0 ? (
                <div className="p-3 rounded-3 text-center text-muted small border" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                  No passkeys registered yet on this account.
                </div>
              ) : (
                <ul className="list-group list-group-flush border rounded-3 overflow-hidden">
                  {passkeys.map((cred) => (
                    <li
                      key={cred.id}
                      className="list-group-item px-3 py-2 d-flex justify-content-between align-items-center gap-2"
                      style={{ backgroundColor: 'var(--bg-neutral-light)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="d-flex align-items-center gap-2 min-w-0">
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: '34px', height: '34px', backgroundColor: 'rgba(8, 97, 47, 0.12)', color: 'var(--brand-primary-bg)' }}
                        >
                          <i className="bi bi-key-fill"></i>
                        </div>
                        <div className="min-w-0">
                          <div className="fw-semibold small text-truncate" style={{ color: 'var(--text-main)' }}>
                            {cred.deviceName}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                            Added {cred.createdAt ? new Date(cred.createdAt).toLocaleDateString() : 'Recently'}
                            {cred.lastUsedAt ? ` • Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePasskey(cred.id, cred.deviceName)}
                        disabled={removingPasskeyId === cred.id}
                        className="btn btn-sm btn-outline-danger fw-semibold px-2 py-1 flex-shrink-0"
                        title="Remove Passkey"
                      >
                        {removingPasskeyId === cred.id ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                          <><i className="bi bi-trash3 me-1"></i>Remove</>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {webauthnMessage.text && (
              <div className={`alert alert-${webauthnMessage.type} py-2 border-0 shadow-sm mb-3`}>
                <i className={`bi ${webauthnMessage.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>
                {webauthnMessage.text}
              </div>
            )}

            <div className="d-flex flex-column flex-sm-row gap-2">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Optional device label (e.g., My Laptop, Android Phone)"
                value={customDeviceName}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                maxLength={50}
              />
              <button
                type="button"
                onClick={handleRegisterBiometrics}
                disabled={isRegisteringBiometrics}
                className="btn btn-primary fw-bold px-4 shadow-sm flex-shrink-0"
              >
                {isRegisteringBiometrics ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Registering...</>
                ) : (
                  <><i className="bi bi-key-fill me-2"></i>Add a Passkey</>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default MyProfile;
