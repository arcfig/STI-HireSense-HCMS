import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
      const response = await fetch('http://localhost:5000/api/faculty/extract', {
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
      const response = await fetch(`http://localhost:5000${endpoint}`, {
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
          setSuccessMsg(data.message); // Shows the temporary password
        } else {
          // DEFENSE-PROOF LOGIN DATA HANDLING
          const userData = data.user || data; // Adapts to either nested or flat JSON responses

          if (userData && userData.username && userData.role) {
            onLogin(userData);
            navigate(['hr', 'admin'].includes(userData.role) ? '/hr-dashboard' : '/');
          } else {
            setError('Authentication succeeded, but server returned incomplete data. Try refreshing.');
          }
        }
      } else {
        setError(data.error || 'Request failed.');
      }
    } catch (err) {
      setError('Server error. Is the backend running?');
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh', backgroundColor: '#f8fafc', width: '100vw' }}>
      {/* Dynamic Card Width: Wider for Register, Compact for Login */}
      <div 
        className="card shadow-lg border-0 rounded-4 w-100" 
        style={{ 
          maxWidth: view === 'register' ? '800px' : '450px', 
          transition: 'max-width 0.3s ease-in-out' 
        }}
      >
        
        {/* STI Branded Header */}
        <div className="text-center py-4" style={{ backgroundColor: '#0033a0' }}>
          <h3 className="fw-bold mb-0" style={{ color: '#ffd700' }}>
            <i className="bi bi-buildings-fill me-2"></i>STI Human Capital System
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
            
          </form>

          {/* Navigation Toggles */}
          <div className="mt-4 text-center">
            {view === 'login' ? (
              <span className="text-muted small">Don't have an account? <a href="#" className="fw-bold text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('register'); }} style={{ color: '#0033a0' }}>Sign up here</a></span>
            ) : (
              <span className="text-muted small">Return to <a href="#" className="fw-bold text-decoration-none" onClick={(e) => { e.preventDefault(); switchView('login'); }} style={{ color: '#0033a0' }}>Sign In</a></span>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}

export default Login;