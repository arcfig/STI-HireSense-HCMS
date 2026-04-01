import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import ManageUsers from './pages/ManageUsers';
import FacultyPortal from './pages/FacultyPortal';
import HRDashboard from './pages/HRDashboard';
import MyPortfolio from './pages/MyPortfolio';
import MyProfile from './pages/MyProfile';
import Login from './pages/Login';
import './App.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import CandidateMatcher from './pages/CandidateMatcher';


function Sidebar({ user, onLogout }) {
  const location = useLocation();

  return (
    <div className="sidebar bg-dark" style={{ width: '260px', color: 'white', paddingTop: '20px', display: 'flex', flexDirection: 'column' }}>
      
   <div className="sidebar-brand px-4 py-3 mb-3 fw-bold border-bottom border-secondary fs-5" style={{ color: '#ffd700' }}>
     <i className="bi bi-buildings-fill me-2" style={{ color: '#0033a0' }}></i>
     STI Human Capital System
   </div>
      
      <div className="nav flex-column flex-grow-1">
        <Link to="/" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/' ? 'active' : 'text-light'}`} style={location.pathname === '/' ? { backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none' } : { textDecoration: 'none' }}>
          <i className="bi bi-cloud-arrow-up-fill me-2"></i> Upload Credentials
        </Link>
        <Link to="/portfolio" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/portfolio' ? 'active' : 'text-light'}`} style={location.pathname === '/portfolio' ? { backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none' } : { textDecoration: 'none' }}>
          <i className="bi bi-person-badge-fill me-2"></i> My Portfolio
        </Link>
        <Link to="/profile" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/profile' ? 'active' : 'text-light'}`} style={location.pathname === '/profile' ? { backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none' } : { textDecoration: 'none' }}>
          <i className="bi bi-gear-fill me-2"></i> My Profile
        </Link>
        
        {/* HR ONLY LINKS */}
        {user?.role === 'hr' && (
          <>
            <hr className="text-secondary mx-3" />
            <Link to="/directory" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/directory' ? 'active bg-primary text-white' : 'text-light'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-people-fill me-2"></i> Faculty Directory
            </Link>
            <Link to="/manage-users" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/manage-users' ? 'active  bg-primary text-white' : 'text-light'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-person-lines-fill me-2"></i> Manage Users
            </Link>
            <Link to="/ai-matcher" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/ai-matcher' ? 'active bg-primary text-white' : 'text-light'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-robot me-2"></i> AI Candidate Matcher
            </Link>
            <Link to="/hr-dashboard" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/hr-dashboard' ? 'active bg-warning text-dark' : 'text-warning'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-shield-lock-fill me-2"></i> HR Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('hireSenseUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('hireSenseUser', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('hireSenseUser');
  };

  return (
    <Router>
      <div className="d-flex" style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
        {user ? (
          <>
            <Sidebar user={user} onLogout={handleLogout} />
            <div className="main-content flex-grow-1 p-5">
              <Routes>
                <Route path="/ai-matcher" element={user.role === 'hr' ? <CandidateMatcher /> : <Navigate to="/" />} />
                <Route path="/" element={<FacultyPortal user={user} />} />
                
                {/* Faculty Personal Portfolio (viewAll = false) */}
                <Route path="/portfolio" element={<MyPortfolio user={user} viewAll={false} />} />
                
                <Route path="/profile" element={<MyProfile user={user} />} />
                
                {/* HR Only Global Directory (viewAll = true) */}
                
                <Route path="/directory" element={user.role === 'hr' ? <MyPortfolio user={user} viewAll={true} /> : <Navigate to="/" />} />
                
                <Route path="/manage-users" element={user.role === 'hr' ? <ManageUsers currentUser={user} /> : <Navigate to="/" />} />
                <Route path="/hr-dashboard" element={user.role === 'hr' ? <HRDashboard user={user} /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </div>
          </>
        ) : (
          <Routes>
            <Route path="*" element={<Login onLogin={handleLogin} />} />
          </Routes>
        )}
      </div>
    </Router>
  );
}

export default App;