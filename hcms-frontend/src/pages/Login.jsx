import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { APP_NAME } from '../config';
import backgroundImage from '../assets/trinitycollege10.jpg';

function Login({ onLogin }) {
  // Initialize navigation to prevent crashes after login
  const navigate = useNavigate();

  // 'view' can be 'login', 'register', 'forgot', or '2fa'
  const [view, setView] = useState('login');

  // 1. Expanded credentials to hold the new AI and 2FA data
  const [credentials, setCredentials] = useState({
    name: '', username: '', password: '', confirmPassword: '',
    department: '', email: '', phoneNumber: ''
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2. State for the AI Scanner
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState({ text: '', type: '' });

  const [isBiometricLogin, setIsBiometricLogin] = useState(false);

  // 3. State for Email 6-Digit OTP Two-Factor Authentication (2FA)
  const [twoFactorData, setTwoFactorData] = useState({
    username: '',
    maskedEmail: '',
    code: '',
    deliveryMode: 'smtp'
  });
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [isResending2FA, setIsResending2FA] = useState(false);

  // 4. State for Self-Service Forgot Password via Email OTP
  const [forgotStep, setForgotStep] = useState('request'); // 'request' | 'verify'
  const [forgotData, setForgotData] = useState({
    identifier: '',
    username: '',
    maskedEmail: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
    deliveryMode: 'smtp'
  });
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  const handleRequestResetCode = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsForgotSubmitting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotData.identifier.trim() || forgotData.username })
      });
      const data = await response.json();

      if (response.ok) {
        setForgotData((prev) => ({
          ...prev,
          username: data.username,
          maskedEmail: data.maskedEmail || 'your email',
          code: '',
          deliveryMode: data.deliveryMode || 'smtp'
        }));
        setForgotStep('verify');
        setSuccessMsg(data.message || 'Password reset code sent to your email.');
      } else {
        setError(data.error || 'Could not send password reset code.');
      }
    } catch {
      setError('Server error while requesting password reset code.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  const handleConfirmPasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (forgotData.newPassword !== forgotData.confirmPassword) {
      return setError('New passwords do not match.');
    }
    if (forgotData.newPassword.length < 8 || !/\S/.test(forgotData.newPassword)) {
      return setError('New password must be at least 8 characters and contain at least one non-whitespace character.');
    }

    setIsForgotSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: forgotData.username,
          code: forgotData.code.trim(),
          newPassword: forgotData.newPassword
        })
      });
      const data = await response.json();

      if (response.ok) {
        setView('login');
        setForgotStep('request');
        setCredentials((prev) => ({ ...prev, username: forgotData.username, password: '' }));
        setSuccessMsg(data.message || 'Password reset successful! You can now sign in.');
      } else {
        setError(data.error || 'Failed to reset password.');
      }
    } catch {
      setError('Server error during password reset.');
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsVerifying2FA(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/login/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: twoFactorData.username,
          code: twoFactorData.code.trim()
        })
      });
      const data = await response.json();

      if (response.ok && data.user && data.token) {
        onLogin({
          ...data.user,
          token: data.token
        });
        navigate('/');
      } else {
        setError(data.error || 'Failed to verify 6-digit code.');
      }
    } catch {
      setError('Server error during 2FA verification.');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleResend2FA = async () => {
    setError('');
    setSuccessMsg('');
    setIsResending2FA(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/login/resend-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: twoFactorData.username })
      });
      const data = await response.json();

      if (response.ok) {
        setSuccessMsg(data.message || 'A new 6-digit verification code has been sent.');
      } else {
        setError(data.error || 'Could not resend verification code.');
      }
    } catch {
      setError('Server error while resending code.');
    } finally {
      setIsResending2FA(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError('');
    setSuccessMsg('');
    setIsBiometricLogin(true);

    const trimmedUsername = credentials.username.trim();

    try {
      // 1. Get options (works both with a typed username and username-less One-Tap discoverable passkeys)
      const optRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/login/generate-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername })
      });
      const optionsPayload = await optRes.json();

      if (!optRes.ok) {
        throw new Error(optionsPayload.error || 'Failed to get authentication options.');
      }

      const { challengeToken, ...options } = optionsPayload;

      // 2. Call WebAuthn API
      let asseResp;
      try {
        asseResp = await startAuthentication({ optionsJSON: options });
      } catch (error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Authentication cancelled or timed out.');
        }
        throw error;
      }

      // 3. Verify with server
      const verifyRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          response: asseResp,
          challengeToken
        })
      });

      const data = await verifyRes.json();

      if (verifyRes.ok && data.user && data.token) {
        setSuccessMsg("Passkey login successful!");
        const secureUserData = {
          ...data.user,
          token: data.token
        };
        onLogin(secureUserData);
        navigate('/');
      } else {
        throw new Error(data.error || 'Failed to verify Passkey login.');
      }
    } catch (error) {
      console.error(error);
      setError(error.message || 'Error during Passkey login.');
    } finally {
      setIsBiometricLogin(false);
    }
  };

  // Using 'prev' ensures React always has the latest state when typing fast!
  const handleChange = (e) => {
    setCredentials(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const switchView = (newView) => {
    setView(newView);
    setError('');
    setSuccessMsg('');
    setShowPassword(false);
    setForgotStep('request');
    setForgotData({
      identifier: '',
      username: '',
      maskedEmail: '',
      code: '',
      newPassword: '',
      confirmPassword: '',
      deliveryMode: 'smtp'
    });
    setCredentials({ name: '', username: '', password: '', confirmPassword: '', department: '', email: '', phoneNumber: '' });
  };

  const handleAIScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanning(true);
    setScanMessage({ text: 'AI is analyzing your document...', type: 'info' });

    const scanData = new FormData();
    scanData.append('document', file);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/extract`, {
        method: 'POST',
        body: scanData
      });

      const data = await response.json();

      if (response.ok) {
        // Build the name and a clean username
        const extractedName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
        const generatedUsername = `${data.firstName?.toLowerCase() || ''}.${data.lastName?.toLowerCase() || ''}`.replace(/\s+/g, '');

        const validDepts = ['Information Technology', 'General Education', 'Tourism & Hospitality'];
        let matchedDept = validDepts.find(d => d.toLowerCase() === String(data.department || '').toLowerCase()) || '';
        if (!matchedDept && data.department) {
          if (/it|computer|software|tech|info/i.test(data.department)) matchedDept = 'Information Technology';
          else if (/tour|hosp|culinary|hotel/i.test(data.department)) matchedDept = 'Tourism & Hospitality';
          else matchedDept = 'General Education';
        }

        // Auto-fill the credentials state!
        setCredentials(prev => ({
          ...prev,
          name: extractedName || prev.name,
          department: matchedDept || prev.department,
          username: generatedUsername || prev.username
        }));

        setScanMessage({ text: `Scan complete (${file.name})! Form auto-filled.`, type: 'success' });
      } else {
        setScanMessage({ text: data.error || 'AI could not read the document clearly.', type: 'warning' });
        e.target.value = null;
      }
    } catch {
      setScanMessage({ text: 'Scanner connection failed.', type: 'danger' });
      e.target.value = null;
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // --- REGISTRATION VALIDATION ---
    if (view === 'register') {
      if (credentials.password !== credentials.confirmPassword) {
        return setError("Passwords do not match. Please try again.");
      }
      if (credentials.password.length < 8 || !/\S/.test(credentials.password)) {
        return setError("Password must be at least 8 characters and contain at least one non-whitespace character.");
      }
    }

    // Determine the correct backend endpoint
    let endpoint = '/api/auth/login';
    if (view === 'register') endpoint = '/api/auth/register';

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok) {
        if (view === 'register') {
          const createdUsername = credentials.username;
          switchView('login');
          setCredentials(prev => ({ ...prev, username: createdUsername }));
          setSuccessMsg("Account created! You can now sign in.");
        } else if (data.requiresTwoFactor) {
          setTwoFactorData({
            username: data.username || credentials.username,
            maskedEmail: data.maskedEmail || 'your email',
            code: '',
            deliveryMode: data.deliveryMode || 'smtp'
          });
          setView('2fa');
          setSuccessMsg(data.message || 'Verification code sent to your email.');
        } else {
          // --- NEW: JWT SECURITY DATA HANDLING ---
          // Ensure both the user object and the security token exist in the response
          if (data.user && data.token) {

            // Merge the token into the user object so it gets saved to sessionStorage together
            const secureUserData = {
              ...data.user,
              token: data.token
            };

            onLogin(secureUserData); // This triggers sessionStorage.setItem in App.jsx
            navigate('/');
          } else {
            setError('Authentication succeeded, but server returned an invalid security token. Try refreshing.');
          }
        }
      } else {
        setError(data.error || 'Request failed.');
      }
    } catch (err) {
      console.error("Login exception:", err);
      setError(err.message || 'Server error. Is the backend running?');
    }
  };

  return (
    <div 
      className="login-viewport d-flex align-items-center justify-content-center px-3 py-4 pb-5 position-relative"
      style={{
        backgroundImage: `linear-gradient(110deg, rgba(24, 115, 84, 0.65) 0%, rgba(10, 45, 32, 0.85) 45%, rgba(4, 15, 12, 0.95) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Centralized Card */}
      <div
        className="card rounded-4 glass-panel w-100"
        style={{
          maxWidth: view === 'register' ? '800px' : '450px',
          transition: 'max-width 0.3s ease-in-out',
          overflow: 'hidden'
        }}
      >

        {/* STI Branded Header */}
        <div className="text-center py-4 border-bottom" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <h3 className="fw-bold mb-0 text-white">
            <i className="bi bi-buildings-fill me-2"></i>{APP_NAME}
          </h3>
          <p className="text-white-50 small mb-0 mt-1">
            {view === 'register'
              ? "Create your faculty account"
              : view === 'forgot'
                ? "Reset your account password"
                : view === '2fa'
                  ? "Two-Factor Security Verification"
                  : "Sign in to your account"}
          </p>
        </div>

        <div className="p-4 p-md-5">
          {error && <div className="alert alert-danger py-2 border-0 shadow-sm"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</div>}
          {successMsg && <div className="alert alert-success py-2 border-0 shadow-sm"><i className="bi bi-check-circle-fill me-2"></i>{successMsg}</div>}

          {view === '2fa' ? (
            <form onSubmit={handleVerify2FA}>
              <div className="text-center mb-4">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                  style={{ width: '56px', height: '56px', backgroundColor: 'rgba(41, 176, 90, 0.15)', color: '#4ade80' }}
                >
                  <i className="bi bi-envelope-lock-fill fs-3"></i>
                </div>
                <p className="text-white-50 small mb-1">
                  Enter the 6-digit verification code sent to
                </p>
                <p className="text-white fw-bold mb-0">{twoFactorData.maskedEmail}</p>
                {twoFactorData.deliveryMode === 'console' && (
                  <small className="text-warning d-block mt-2">
                    <i className="bi bi-terminal me-1"></i>Local Dev Mode: check the backend server terminal for your 6-digit code.
                  </small>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label small fw-bold text-white-50 text-uppercase">6-Digit Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="form-control glass-input text-center fw-bold font-monospace py-2"
                  style={{ letterSpacing: '0.45em', fontSize: '1.4rem' }}
                  placeholder="000000"
                  value={twoFactorData.code}
                  onChange={(e) =>
                    setTwoFactorData((prev) => ({
                      ...prev,
                      code: e.target.value.replace(/\D/g, '').slice(0, 6)
                    }))
                  }
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying2FA || twoFactorData.code.length !== 6}
                className="btn btn-primary w-100 fw-bold py-2 shadow-sm fs-5 mt-2"
              >
                {isVerifying2FA ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Verifying...</>
                ) : (
                  <><i className="bi bi-shield-check me-2"></i>Verify & Sign In</>
                )}
              </button>

              <button
                type="button"
                onClick={handleResend2FA}
                disabled={isResending2FA}
                className="btn glass-btn-outline w-100 fw-semibold py-2 shadow-sm mt-2"
              >
                {isResending2FA ? 'Sending new code...' : 'Resend 6-Digit Code'}
              </button>
            </form>
          ) : view === 'forgot' ? (
            forgotStep === 'request' ? (
              <form onSubmit={handleRequestResetCode}>
                <div className="text-center mb-3">
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
                    style={{ width: '52px', height: '52px', backgroundColor: 'rgba(41, 176, 90, 0.15)', color: '#4ade80' }}
                  >
                    <i className="bi bi-key-fill fs-3"></i>
                  </div>
                  <p className="text-white-50 small mb-0">
                    Enter your System Username or registered Email Address to receive a 6-digit password reset code.
                  </p>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-white-50 text-uppercase">
                    Username or Email Address
                  </label>
                  <input
                    type="text"
                    className="form-control glass-input"
                    placeholder="e.g., faculty.user or faculty@sti.edu"
                    value={forgotData.identifier}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, identifier: e.target.value }))}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isForgotSubmitting || !forgotData.identifier.trim()}
                  className="btn btn-primary w-100 fw-bold py-2 shadow-sm fs-5 mt-2"
                >
                  {isForgotSubmitting ? (
                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending Code...</>
                  ) : (
                    <><i className="bi bi-envelope-paper-fill me-2"></i>Send 6-Digit Reset Code</>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmPasswordReset}>
                <div className="text-center mb-3">
                  <p className="text-white-50 small mb-1">
                    Enter the 6-digit reset code sent to
                  </p>
                  <p className="text-white fw-bold mb-0">{forgotData.maskedEmail}</p>
                  {forgotData.deliveryMode === 'console' && (
                    <small className="text-warning d-block mt-1">
                      <i className="bi bi-terminal me-1"></i>Local Dev Mode: check the backend terminal for your 6-digit code.
                    </small>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-white-50 text-uppercase">6-Digit Reset Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="form-control glass-input text-center fw-bold font-monospace py-2"
                    style={{ letterSpacing: '0.45em', fontSize: '1.3rem' }}
                    placeholder="000000"
                    value={forgotData.code}
                    onChange={(e) =>
                      setForgotData((prev) => ({
                        ...prev,
                        code: e.target.value.replace(/\D/g, '').slice(0, 6)
                      }))
                    }
                    autoFocus
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-white-50 text-uppercase">New Password</label>
                  <div className="d-flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="form-control glass-input"
                      placeholder="At least 8 characters"
                      value={forgotData.newPassword}
                      onChange={(e) => setForgotData((prev) => ({ ...prev, newPassword: e.target.value }))}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="btn glass-btn-outline d-flex align-items-center justify-content-center px-3"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide Password" : "Show Password"}
                    >
                      <i className={`bi ${showPassword ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-white-50 text-uppercase">Confirm New Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control glass-input"
                    placeholder="Re-enter new password"
                    value={forgotData.confirmPassword}
                    onChange={(e) => setForgotData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    minLength={8}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isForgotSubmitting || forgotData.code.length !== 6 || forgotData.newPassword.length < 8}
                  className="btn btn-primary w-100 fw-bold py-2 shadow-sm fs-5 mt-2"
                >
                  {isForgotSubmitting ? (
                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting Password...</>
                  ) : (
                    <><i className="bi bi-check2-circle me-2"></i>Reset Password</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRequestResetCode()}
                  disabled={isForgotSubmitting}
                  className="btn glass-btn-outline w-100 fw-semibold py-2 shadow-sm mt-2"
                >
                  Resend 6-Digit Code
                </button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit}>
            {/* 1. AI SCANNER - ONLY ON REGISTER */}
            {view === 'register' && (
              <div className="card border-primary border-2 border-dashed shadow-sm mb-4 position-relative" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                <div className="card-body text-center p-3">
                  <h6 className="fw-bold text-white mb-1">
                    <i className="bi bi-robot me-2 text-primary"></i>AI Fast-Track Setup
                  </h6>
                  <p className="text-white-50 small mb-3">
                    Upload your STI ID or a certificate. AI will auto-fill your details!
                  </p>
                  <input
                    type="file"
                    className="form-control form-control-sm glass-input mb-2"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleAIScan}
                    disabled={isScanning}
                  />
                  {isScanning && (
                    <div className="spinner-border text-primary spinner-border-sm mt-1" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  )}
                  {scanMessage.text && (
                    <div className={`text-${scanMessage.type} small fw-bold mt-1`}>
                      {scanMessage.text}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- START OF RESPONSIVE GRID --- */}
            <div className="row g-3">

              {/* Full Name (Register Only) */}
              {view === 'register' && (
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-white-50">Full Name</label>
                  <input type="text" className="form-control glass-input" name="name" value={credentials.name} onChange={handleChange} required />
                </div>
              )}

              {/* Username (Full width on Login, Half width on Register) */}
              <div className={view === 'register' ? "col-md-6" : "col-12"}>
                <label className="form-label small fw-bold text-white-50 text-uppercase">System Username</label>
                <input type="text" className="form-control glass-input" name="username" value={credentials.username} onChange={handleChange} required />
              </div>

              {/* Extra Details (Register Only) */}
              {view === 'register' && (
                <>
                  <div className="col-md-12">
                    <label className="form-label small fw-bold text-white-50">Department</label>
                    <select className="form-select glass-input" name="department" value={credentials.department} onChange={handleChange} required>
                      <option value="" disabled>Select Department</option>
                      <option value="Information Technology">Information Technology</option>
                      <option value="General Education">General Education</option>
                      <option value="Tourism & Hospitality">Tourism & Hospitality</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-white-50">Email (For 2FA & Recovery)</label>
                    <input type="email" className="form-control glass-input" name="email" value={credentials.email} onChange={handleChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-white-50">Phone Number</label>
                    <input type="text" className="form-control glass-input" name="phoneNumber" value={credentials.phoneNumber} onChange={handleChange} />
                  </div>
                </>
              )}

              {/* Password (Full width on Login, Half width on Register) */}
              <div className={view === 'register' ? "col-md-6" : "col-12"}>
                <div className="d-flex justify-content-between align-items-center">
                  <label className="form-label small fw-bold text-white-50 text-uppercase mb-1">Password</label>
                  {view === 'login' && (
                    <a
                      href="#"
                      className="small text-white-50 text-decoration-none hover-white mb-1"
                      onClick={(e) => { e.preventDefault(); switchView('forgot'); }}
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control glass-input"
                    name="password"
                    value={credentials.password}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="btn glass-btn-outline d-flex align-items-center justify-content-center px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide Password" : "Show Password"}
                  >
                    <i className={`bi ${showPassword ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
                  </button>
                </div>
              </div>

              {/* Confirm Password (Register Only) */}
              {view === 'register' && (
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-white-50 text-uppercase mb-1">Confirm Password</label>
                  <div className="d-flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="form-control glass-input"
                      name="confirmPassword"
                      value={credentials.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      className="btn glass-btn-outline d-flex align-items-center justify-content-center px-3"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide Password" : "Show Password"}
                    >
                      <i className={`bi ${showPassword ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
                    </button>
                  </div>
                </div>
              )}

            </div>
            {/* --- END OF RESPONSIVE GRID --- */}

            <button type="submit" className="btn btn-primary w-100 fw-bold py-2 shadow-sm fs-5 mt-4">
              {view === 'register' ? 'Create Secure Account' : 'Sign In'}
            </button>

            {view === 'login' && (
              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={isBiometricLogin}
                className="btn glass-btn-outline w-100 fw-bold py-2 shadow-sm fs-5 mt-2 d-flex align-items-center justify-content-center"
              >
                {isBiometricLogin ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Authenticating...</>
                ) : (
                  <><i className="bi bi-key-fill me-2"></i>Sign in with a Passkey</>
                )}
              </button>
            )}

          </form>
          )}

          {/* Navigation Toggles */}
          <div className="mt-4 text-center">
            {view === 'login' ? (
              <span className="text-white-50 small">Don&apos;t have an account? <a href="#" className="fw-bold text-white text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('register'); }}>Sign up here</a></span>
            ) : (
              <span className="text-white-50 small">Return to <a href="#" className="fw-bold text-white text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('login'); }}>Sign In</a></span>
            )}
          </div>

        </div>
      </div>

      {/* Utility Footer Repositioning */}
      <div className="position-fixed bottom-0 w-100 d-flex justify-content-between px-4 py-3 text-white-50" style={{ fontSize: '0.85rem', zIndex: 10 }}>
        <span>Authorized Personnel Only</span>
        <a href="#" className="text-white-50 text-decoration-none hover-white">IT Support</a>
      </div>
    </div>
  );
}

export default Login;
