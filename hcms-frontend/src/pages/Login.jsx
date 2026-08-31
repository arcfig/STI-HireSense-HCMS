import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { APP_NAME } from '../config';
import placeholderImage from '../assets/placeholder.jpg';

function Login({ onLogin }) {
  // Initialize navigation to prevent crashes after login
  const navigate = useNavigate();

  // 'view' can be 'login', 'register', or 'forgot'
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

  const handleBiometricLogin = async () => {
    if (!credentials.username) {
      setError("Please enter your System Username first.");
      return;
    }
    
    setError('');
    setIsBiometricLogin(true);
    
    try {
      // 1. Get options
      const optRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/webauthn/login/generate-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: credentials.username })
      });
      const options = await optRes.json();
      
      if (!optRes.ok) {
        throw new Error(options.error || 'Failed to get authentication options.');
      }
      
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
        body: JSON.stringify({ username: credentials.username, response: asseResp })
      });
      
      const data = await verifyRes.json();
      
      if (verifyRes.ok && data.user && data.token) {
        setSuccessMsg("Biometric login successful!");
        const secureUserData = {
          ...data.user,
          token: data.token
        };
        onLogin(secureUserData);
        navigate(['hr', 'admin'].includes(data.user.role) ? '/hr-dashboard' : '/');
      } else {
        throw new Error(data.error || 'Failed to verify biometric login.');
      }
    } catch (error) {
      console.error(error);
      setError(error.message || 'Error during biometric login.');
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

        // Auto-fill the credentials state!
        setCredentials(prev => ({
          ...prev,
          name: extractedName || prev.name,
          department: data.department || prev.department,
          username: generatedUsername || prev.username
        }));
        
        setScanMessage({ text: 'Scan complete! Form auto-filled.', type: 'success' });
      } else {
        setScanMessage({ text: 'AI could not read the document clearly.', type: 'warning' });
      }
    } catch (err) {
      setScanMessage({ text: 'Scanner connection failed.', type: 'danger' });
    } finally {
      setIsScanning(false);
      e.target.value = null; // Clear the input
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
      if (credentials.password.length < 6) {
        return setError("Password must be at least 6 characters long.");
      }
    }

    // Determine the correct backend endpoint
    let endpoint = '/api/auth/login';
    if (view === 'register') endpoint = '/api/auth/register';
    if (view === 'forgot') endpoint = '/api/auth/forgot-password';

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok) {
        if (view === 'register') {
          setSuccessMsg("Account created! You can now sign in.");
          switchView('login');
        } else if (view === 'forgot') {
          setSuccessMsg(data.message); 
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
            navigate(['hr', 'admin'].includes(data.user.role) ? '/hr-dashboard' : '/');
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
    <div className="container-fluid p-0">
      <div className="row g-0 vh-100">
        
        {/* Left Column - Media Pane */}
        <div className="col-lg-7 d-none d-lg-block position-relative h-100">
          <div 
            className="w-100 h-100"
            style={{
              backgroundImage: `url(${placeholderImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Overlay with primary brand variable */}
            <div 
              className="position-absolute top-0 start-0 w-100 h-100"
              style={{
                background: 'linear-gradient(135deg, var(--brand-primary, #0056b3) 0%, rgba(0, 0, 0, 0.6) 100%)',
                opacity: 0.85
              }}
            ></div>
          </div>
        </div>

        {/* Right Column - Interaction Pane */}
        <div className="col-lg-5 col-12 d-flex flex-column position-relative overflow-auto h-100" style={{ backgroundColor: '#f8fafc' }}>
          
          <div className="flex-grow-1 d-flex align-items-center justify-content-center p-3 p-md-4">
            {/* Dynamic Card Width: Wider for Register, Compact for Login */}
            <div 
              className="card rounded-4 w-100" 
              style={{ 
                maxWidth: view === 'register' ? '800px' : '450px', 
                transition: 'max-width 0.3s ease-in-out',
                border: '1px solid var(--border-subtle, #dee2e6)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
                overflow: 'hidden'
              }}
            >
              
              {/* STI Branded Header */}
              <div className="text-center py-4" style={{ backgroundColor: 'var(--brand-primary-bg)' }}>
                <h3 className="fw-bold mb-0" style={{ color: 'var(--brand-primary-text)' }}>
                  <i className="bi bi-buildings-fill me-2"></i>{APP_NAME}
                </h3>
                <p className="text-white-50 small mb-0 mt-1">
                  {view === 'register' ? "Create your faculty account" : view === 'forgot' ? "Reset your password" : "Sign in to your account"}
                </p>
              </div>

              <div className="p-4 p-md-5 bg-white">
                {error && <div className="alert alert-danger py-2 border-0 shadow-sm"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</div>}
                {successMsg && <div className="alert alert-success py-2 border-0 shadow-sm"><i className="bi bi-check-circle-fill me-2"></i>{successMsg}</div>}

                <form onSubmit={handleSubmit}>
                  {/* 1. AI SCANNER - ONLY ON REGISTER */}
                  {view === 'register' && (
                    <div className="card border-primary border-2 border-dashed bg-white shadow-sm mb-4 position-relative">
                      <div className="card-body text-center p-3">
                        <h6 className="fw-bold text-primary mb-1">
                          <i className="bi bi-robot me-2"></i>AI Fast-Track Setup
                        </h6>
                        <p className="text-muted small mb-3">
                          Upload your STI ID or a certificate. AI will auto-fill your details!
                        </p>
                        <input 
                          type="file" 
                          className="form-control form-control-sm mb-2" 
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
                        <label className="form-label small fw-bold text-muted">Full Name</label>
                        <input type="text" className="form-control" name="name" value={credentials.name} onChange={handleChange} required />
                      </div>
                    )}

                    {/* Username (Full width on Login, Half width on Register) */}
                    <div className={view === 'register' ? "col-md-6" : "col-12"}>
                      <label className="form-label small fw-bold text-muted text-uppercase">System Username</label>
                      <input type="text" className="form-control" name="username" value={credentials.username} onChange={handleChange} required />
                    </div>

                    {/* Extra Details (Register Only) */}
                    {view === 'register' && (
                      <>
                        <div className="col-md-12">
                          <label className="form-label small fw-bold text-muted">Department</label>
                          <input type="text" className="form-control" name="department" value={credentials.department} onChange={handleChange} placeholder="e.g., Information Technology" required />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label small fw-bold text-muted">Email (Optional)</label>
                          <input type="email" className="form-control" name="email" value={credentials.email} onChange={handleChange} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label small fw-bold text-muted">Phone Number</label>
                          <input type="text" className="form-control" name="phoneNumber" value={credentials.phoneNumber} onChange={handleChange} />
                        </div>
                      </>
                    )}

                    {/* Password (Full width on Login, Half width on Register) */}
                    <div className={view === 'register' ? "col-md-6" : "col-12"}>
                      <label className="form-label small fw-bold text-muted text-uppercase">Password</label>
                      <div className="d-flex gap-2">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          className="form-control" 
                          name="password" 
                          value={credentials.password} 
                          onChange={handleChange} 
                          required 
                        />
                        <button 
                          type="button" 
                          className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3" 
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
                        <label className="form-label small fw-bold text-muted text-uppercase">Confirm Password</label>
                        <div className="d-flex gap-2">
                          <input 
                            type={showPassword ? "text" : "password"} 
                            className="form-control" 
                            name="confirmPassword" 
                            value={credentials.confirmPassword} 
                            onChange={handleChange} 
                            required 
                          />
                          <button 
                            type="button" 
                            className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3" 
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

                  <button type="submit" className="btn btn-warning w-100 fw-bold py-2 shadow-sm text-dark fs-5 mt-4">
                    {view === 'register' ? 'Create Secure Account' : 'Sign In'}
                  </button>
                  
                  {view === 'login' && (
                    <button 
                      type="button" 
                      onClick={handleBiometricLogin}
                      disabled={isBiometricLogin}
                      className="btn btn-outline-primary w-100 fw-bold py-2 shadow-sm fs-5 mt-2 d-flex align-items-center justify-content-center"
                    >
                      {isBiometricLogin ? (
                        <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Authenticating...</>
                      ) : (
                        <><i className="bi bi-fingerprint me-2"></i>Login with Biometrics</>
                      )}
                    </button>
                  )}
                  
                </form>

                {/* Navigation Toggles */}
                <div className="mt-4 text-center">
                  {view === 'login' ? (
                    <span className="text-muted small">Don't have an account? <a href="#" className="fw-bold text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('register'); }} style={{ color: 'var(--brand-primary-bg)' }}>Sign up here</a></span>
                  ) : (
                    <span className="text-muted small">Return to <a href="#" className="fw-bold text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('login'); }} style={{ color: 'var(--brand-primary-bg)' }}>Sign In</a></span>
                  )}
                </div>
                
              </div>
            </div>
          </div>
          
          {/* Utility Footer */}
          <div 
            className="w-100 p-3 text-center d-flex justify-content-between px-4" 
            style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6c757d)' }}
          >
            <span>Authorized Personnel Only</span>
            <a href="#" className="text-decoration-none" style={{ color: 'var(--text-muted, #6c757d)' }}>IT Support</a>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Login;