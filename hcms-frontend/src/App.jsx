import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import ManageUsers from './pages/ManageUsers';
import FacultyPortal from './pages/FacultyPortal';
import HRDashboard from './pages/HRDashboard';
import MyPortfolio from './pages/MyPortfolio';
import MyProfile from './pages/MyProfile';
import Login from './pages/Login';
import CandidateMatcher from './pages/CandidateMatcher';
import FacultyDirectory from './pages/FacultyDirectory';
import UploadCredential from './pages/UploadCredential';
import './App.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import SubjectManager from './pages/SubjectManager';
import ArchivedUsers from './pages/ArchivedUsers';

// --- RBAC HELPER FUNCTIONS ---
const isAdmin = (role) => role === 'admin';
const isHeadOrAdmin = (role) => ['admin', 'academic_head', 'program_head'].includes(role);
const hasPortfolioAccess = (role) => role !== 'admin'; 

// --- INLINE SIDEBAR COMPONENT ---
function Sidebar({ user, onLogout }) {
  const location = useLocation();
  const role = user?.role || 'faculty';

  // Helper for active styling
  const getLinkStyle = (path) => location.pathname === path 
    ? { backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none' } 
    : { textDecoration: 'none' };
  
  const getLinkClass = (path) => `nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === path ? 'active' : 'text-light'}`;

  return (
    <div className="sidebar bg-dark" style={{ width: '260px', color: 'white', paddingTop: '20px', display: 'flex', flexDirection: 'column' }}>
      
      <div className="sidebar-brand px-4 py-3 mb-3 fw-bold border-bottom border-secondary fs-5" style={{ color: '#ffd700' }}>
        <i className="bi bi-buildings-fill me-2" style={{ color: '#0033a0' }}></i>
        STI Human Capital System
      </div>
      
      <div className="nav flex-column flex-grow-1">
        
        {/* UNIVERSAL LINKS (Everyone sees these) */}
        <Link to="/" className={getLinkClass('/')} style={getLinkStyle('/')}>
          <i className="bi bi-house-door-fill me-2"></i> Home Dashboard
        </Link>
        <Link to="/upload" className={getLinkClass('/upload')} style={getLinkStyle('/upload')}>
          <i className="bi bi-cloud-arrow-up-fill me-2"></i> Upload Credentials
        </Link>
        
        {/* RESTRICTED: Hidden from Admin (Faculty & Heads see this) */}
        {hasPortfolioAccess(role) && (
          <Link to="/portfolio" className={getLinkClass('/portfolio')} style={getLinkStyle('/portfolio')}>
            <i className="bi bi-person-badge-fill me-2"></i> My Portfolio
          </Link>
        )}
        
        {/* UNIVERSAL */}
        <Link to="/profile" className={getLinkClass('/profile')} style={getLinkStyle('/profile')}>
          <i className="bi bi-gear-fill me-2"></i> My Profile
        </Link>
        
        {/* HEAD & ADMIN ONLY LINKS (Strictly hidden from standard faculty) */}
        {isHeadOrAdmin(role) && (
          <>
            <hr className="text-secondary mx-3 my-3" />
            <div className="px-4 mb-2 text-secondary small fw-bold text-uppercase">Management Tools</div>
            
            <Link to="/directory" className={getLinkClass('/directory')} style={getLinkStyle('/directory')}>
              <i className="bi bi-people-fill me-2"></i> Faculty Directory
            </Link>
            
            <Link to="/ai-matcher" className={getLinkClass('/ai-matcher')} style={getLinkStyle('/ai-matcher')}>
              <i className="bi bi-robot me-2"></i> AI Matcher
            </Link>
            
            <Link to="/hr-dashboard" className={`nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === '/hr-dashboard' ? 'active bg-warning text-dark' : 'text-warning'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-shield-lock-fill me-2"></i> HR Dashboard
            </Link>
            <Link to="/subjects" className={getLinkClass('/subjects')} style={getLinkStyle('/subjects')}>
              <i className="bi bi-journal-bookmark-fill me-2"></i> Manage Subjects
            </Link>
          </>
        )}

        {/* ADMIN ONLY LINKS */}
        {isAdmin(role) && (
          <>
            <Link to="/manage-users" className={getLinkClass('/manage-users')} style={getLinkStyle('/manage-users')}>
              <i className="bi bi-person-lines-fill me-2"></i> Manage Users
            </Link>
            
            {/* NEW: Archived Accounts Route Link */}
            <Link to="/archived-users" className={getLinkClass('/archived-users')} style={getLinkStyle('/archived-users')}>
              <i className="bi bi-archive-fill me-2"></i> Archived Accounts
            </Link>
          </>
        )}
      </div>

      <div className="p-3 mt-auto border-top border-secondary">
        <button className="btn btn-outline-light w-100" onClick={onLogout}>
          <i className="bi bi-box-arrow-left me-2"></i> Sign Out
        </button>
      </div>
    </div>
  );
}

// --- MAIN APP COMPONENT ---
function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('hireSenseUser');
    
    // Safety Check 1: Reject literal "undefined" strings
    if (!savedUser || savedUser === "undefined") {
      return null;
    }
    
    // Safety Check 2: Try/Catch block for parsing errors
    try {
      return JSON.parse(savedUser);
    } catch (error) {
      console.error("Local storage corrupted. Clearing session.");
      localStorage.removeItem('hireSenseUser');
      return null;
    }
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
                
                {/* UNIVERSAL ROUTES */}
                <Route path="/" element={<FacultyPortal user={user} />} />
                <Route path="/upload" element={<UploadCredential />} />
                <Route path="/profile" element={<MyProfile user={user} />} />
                
                {/* PROTECTED ROUTE: Block Admins from Portfolio */}
                <Route 
                  path="/portfolio" 
                  element={hasPortfolioAccess(user.role) ? <MyPortfolio user={user} viewAll={false} /> : <Navigate to="/directory" />} 
                />
                
                {/* PROTECTED ROUTES: Heads and Admins Only */}
                <Route 
                  path="/directory" 
                  element={isHeadOrAdmin(user.role) ? <FacultyDirectory /> : <Navigate to="/" />} 
                />
                <Route 
                  path="/ai-matcher" 
                  element={isHeadOrAdmin(user.role) ? <CandidateMatcher /> : <Navigate to="/" />} 
                />
                <Route 
                  path="/hr-dashboard" 
                  element={isHeadOrAdmin(user.role) ? <HRDashboard user={user} /> : <Navigate to="/" />} 
                />
                <Route 
                  path="/subjects" 
                  element={isHeadOrAdmin(user.role) ? <SubjectManager /> : <Navigate to="/" />} 
                />
                
                {/* PROTECTED ROUTE: Admin Only */}
                <Route 
                  path="/manage-users" 
                  element={isAdmin(user.role) ? <ManageUsers currentUser={user} /> : <Navigate to="/" />} 
                />
                
                {/* NEW PROTECTED ROUTE: Admin Only - Archived Accounts */}
                <Route 
                  path="/archived-users" 
                  element={isAdmin(user.role) ? <ArchivedUsers /> : <Navigate to="/" />} 
                />
                
                {/* FALLBACK */}
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