import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin }) {
  // 'view' can be 'login', 'register', or 'forgot'
  const [view, setView] = useState('login'); 
  
  // Added confirmPassword to the state
  const [credentials, setCredentials] = useState({ name: '', username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setCredentials({ ...credentials, [e.target.name]: e.target.value });

  const switchView = (newView) => {
    setView(newView);
    setError('');
    setSuccessMsg('');
    setCredentials({ name: '', username: '', password: '', confirmPassword: '' });
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
          onLogin(data.user);
          navigate(data.user.role === 'hr' ? '/hr-dashboard' : '/');
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
      <div className="card shadow border-0 rounded-4 overflow-hidden" style={{ width: '450px' }}>
        
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
            
            {/* FULL NAME (Only for Registration) */}
            {view === 'register' && (
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small text-uppercase">Full Name</label>
                <input type="text" className="form-control bg-light focus-ring" name="name" value={credentials.name} onChange={handleChange} required />
              </div>
            )}
            
            {/* USERNAME (Used in all 3 views) */}
            <div className="mb-3">
              <label className="form-label fw-semibold text-secondary small text-uppercase">System Username</label>
              <input type="text" className="form-control bg-light focus-ring" name="username" value={credentials.username} onChange={handleChange} required />
            </div>
            
            {/* PASSWORDS (Hidden during Forgot Password view) */}
            {view !== 'forgot' && (
              <>
                <div className="mb-3">
                  <div className="d-flex justify-content-between">
                    <label className="form-label fw-semibold text-secondary small text-uppercase">Password</label>
                    {view === 'login' && (
                      <a href="#" className="text-decoration-none small" onClick={() => switchView('forgot')} style={{ color: '#0033a0' }}>Forgot password?</a>
                    )}
                  </div>
                  <div className="input-group">
                    <input type={showPassword ? "text" : "password"} className="form-control bg-light border-end-0 focus-ring" name="password" value={credentials.password} onChange={handleChange} required />
                    <button className="btn btn-outline-secondary bg-light border-start-0" type="button" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide" : "Show"}>
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                    </button>
                  </div>
                </div>

                {/* CONFIRM PASSWORD (Only for Registration) */}
                {view === 'register' && (
                  <div className="mb-4">
                    <label className="form-label fw-semibold text-secondary small text-uppercase">Confirm Password</label>
                    <input type={showPassword ? "text" : "password"} className="form-control bg-light focus-ring" name="confirmPassword" value={credentials.confirmPassword} onChange={handleChange} required />
                  </div>
                )}
              </>
            )}

            <button type="submit" className="btn fw-bold w-100 shadow-sm py-2 mt-2" style={{ backgroundColor: '#ffd700', color: '#0033a0' }}>
              {view === 'register' ? "Register Account" : view === 'forgot' ? "Reset Password" : "Sign In"}
            </button>
          </form>

          {/* Navigation Toggles */}
          <div className="mt-4 text-center">
            {view === 'login' ? (
              <span className="text-muted small">Don't have an account? <a href="#" className="fw-bold text-decoration-none" onClick={() => switchView('register')} style={{ color: '#0033a0' }}>Sign up here</a></span>
            ) : (
              <span className="text-muted small">Return to <a href="#" className="fw-bold text-decoration-none" onClick={() => switchView('login')} style={{ color: '#0033a0' }}>Sign In</a></span>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}

export default Login;