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

  const getLinkStyle = (path) => location.pathname === path 
    ? { backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none' } 
    : { textDecoration: 'none' };
  
  const getLinkClass = (path) => `nav-link px-4 py-2 my-1 mx-3 rounded ${location.pathname === path ? 'active' : 'text-light'}`;

  return (
    <div className="sidebar bg-dark shadow" style={{ width: '260px', color: 'white', paddingTop: '20px', display: 'flex', flexDirection: 'column', zIndex: 1000 }}>
      <div className="sidebar-brand px-4 py-3 mb-3 fw-bold border-bottom border-secondary fs-5" style={{ color: '#ffd700' }}>
        <i className="bi bi-buildings-fill me-2" style={{ color: '#0033a0' }}></i>
        STI Human Capital
      </div>
      
      <div className="nav flex-column flex-grow-1 overflow-auto">
        <Link to="/" className={getLinkClass('/')} style={getLinkStyle('/')}>
          <i className="bi bi-house-door-fill me-2"></i> Home Dashboard
        </Link>
        <Link to="/upload" className={getLinkClass('/upload')} style={getLinkStyle('/upload')}>
          <i className="bi bi-cloud-arrow-up-fill me-2"></i> Upload Credentials
        </Link>
        
        {hasPortfolioAccess(role) && (
          <Link to="/portfolio" className={getLinkClass('/portfolio')} style={getLinkStyle('/portfolio')}>
            <i className="bi bi-person-badge-fill me-2"></i> My Portfolio
          </Link>
        )}
        
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

        {isAdmin(role) && (
          <>
            <Link to="/manage-users" className={getLinkClass('/manage-users')} style={getLinkStyle('/manage-users')}>
              <i className="bi bi-person-lines-fill me-2"></i> Manage Users
            </Link>
            <Link to="/archived-users" className={getLinkClass('/archived-users')} style={getLinkStyle('/archived-users')}>
              <i className="bi bi-archive-fill me-2"></i> Archived Accounts
            </Link>
          </>
        )}
      </div>

      <div className="p-3 mt-auto border-top border-secondary">
        <button className="btn btn-outline-light w-100 fw-bold" onClick={onLogout}>
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
    if (!savedUser || savedUser === "undefined") return null;
    try {
      return JSON.parse(savedUser);
    } catch (error) {
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
      {/* UI FIX: Locked viewport height to enable internal scrolling */}
      <div className="d-flex" style={{ backgroundColor: '#f8fafc', height: '100vh', overflow: 'hidden' }}>
        {user ? (
          <>
            <Sidebar user={user} onLogout={handleLogout} />
            
            <div className="d-flex flex-column flex-grow-1" style={{ width: 'calc(100% - 260px)' }}>
              
              {/* UI FIX: Reduced padding and component sizes for a thinner top bar */}
              <div className="bg-white shadow-sm px-4 py-2 d-flex justify-content-end align-items-center border-bottom z-3">
                <Link to="/profile" className="text-decoration-none text-dark d-flex align-items-center btn btn-light border py-1 px-3 rounded-pill shadow-sm transition-all" style={{ cursor: 'pointer' }}>
                  <div className="text-end me-3">
                    <div className="fw-bold lh-1 text-primary" style={{ fontSize: '0.9rem' }}>{user.name}</div>
                    <small className="text-muted text-uppercase fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                      {user.role.replace('_', ' ')}
                    </small>
                  </div>
                  <i className="bi bi-person-circle fs-3 text-secondary"></i>
                </Link>
              </div>

              {/* PAGE CONTENT: Now handles its own scroll boundary */}
              <div className="p-4 overflow-y-auto overflow-x-hidden flex-grow-1 h-100">
                <Routes>
                  <Route path="/" element={<FacultyPortal user={user} />} />
                  <Route path="/upload" element={<UploadCredential />} />
                  <Route path="/profile" element={<MyProfile user={user} />} />
                  <Route path="/portfolio" element={hasPortfolioAccess(user.role) ? <MyPortfolio user={user} viewAll={false} /> : <Navigate to="/directory" />} />
                  <Route path="/directory" element={isHeadOrAdmin(user.role) ? <FacultyDirectory /> : <Navigate to="/" />} />
                  <Route path="/ai-matcher" element={isHeadOrAdmin(user.role) ? <CandidateMatcher /> : <Navigate to="/" />} />
                  <Route path="/hr-dashboard" element={isHeadOrAdmin(user.role) ? <HRDashboard user={user} /> : <Navigate to="/" />} />
                  <Route path="/subjects" element={isHeadOrAdmin(user.role) ? <SubjectManager /> : <Navigate to="/" />} />
                  <Route path="/manage-users" element={isAdmin(user.role) ? <ManageUsers currentUser={user} /> : <Navigate to="/" />} />
                  <Route path="/archived-users" element={isAdmin(user.role) ? <ArchivedUsers /> : <Navigate to="/" />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>

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