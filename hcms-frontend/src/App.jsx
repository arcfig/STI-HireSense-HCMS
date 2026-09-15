import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { APP_NAME } from './config';
import { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
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
import ErrorBoundary from './ErrorBoundary';

const isAdmin = (role) => role === 'admin';
const isHeadOrAdmin = (role) => ['admin', 'academic_head', 'program_head'].includes(role);
const hasPortfolioAccess = (role) => role !== 'admin'; 

function Sidebar({ user, onLogout, isSidebarOpen, setIsSidebarOpen }) {
  const location = useLocation();
  const role = user?.role || 'faculty';

  const getLinkStyle = (path) => location.pathname === path 
    ? { backgroundColor: '#1b5e20', color: 'white', textDecoration: 'none' } 
    : { textDecoration: 'none' };
  
  const getLinkClass = (path) => `nav-link px-3 py-2 my-1 mx-2 rounded d-flex align-items-center ${location.pathname === path ? 'active' : 'text-light'}`;

  const iconStyle = { fontSize: '1.2rem', minWidth: '30px', textAlign: 'center' };
  const textStyle = { opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s', marginLeft: '12px', visibility: isSidebarOpen ? 'visible' : 'hidden' };

  return (
    <div className="sidebar shadow" style={{ width: '100%', height: '100%', backgroundColor: '#091f0c', color: 'white', paddingTop: '0', display: 'flex', flexDirection: 'column', zIndex: 1000, whiteSpace: 'nowrap', overflow: 'hidden', userSelect: 'none' }}>
      <div 
        className="sidebar-brand fw-bold fs-5 d-flex align-items-center" 
        style={{ borderBottom: '1px solid var(--border-subtle)', color: 'white', height: '70px', minHeight: '70px', boxSizing: 'border-box', marginBottom: '1rem', flexShrink: 0, cursor: 'pointer', padding: '0 26px' }}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title="Toggle Sidebar"
      >
        <i className="bi bi-list fs-3" style={{ minWidth: '30px', textAlign: 'center' }}></i>
        <span style={{ opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s', marginLeft: '12px', visibility: isSidebarOpen ? 'visible' : 'hidden' }}>{APP_NAME}</span>
      </div>
      
      <div className="nav flex-column flex-grow-1 overflow-x-hidden overflow-y-auto">
        <Link to="/" draggable="false" className={getLinkClass('/')} style={getLinkStyle('/')}>
          <i className="bi bi-house-door-fill" style={iconStyle}></i>
          <span style={textStyle}>Home Dashboard</span>
        </Link>
        <Link to="/upload" draggable="false" className={getLinkClass('/upload')} style={getLinkStyle('/upload')}>
          <i className="bi bi-cloud-arrow-up-fill" style={iconStyle}></i>
          <span style={textStyle}>Upload Credentials</span>
        </Link>
        
        {hasPortfolioAccess(role) && (
          <Link to="/portfolio" draggable="false" className={getLinkClass('/portfolio')} style={getLinkStyle('/portfolio')}>
            <i className="bi bi-person-badge-fill" style={iconStyle}></i>
            <span style={textStyle}>My Portfolio</span>
          </Link>
        )}
        
        {isHeadOrAdmin(role) && (
          <>
            <hr className="mx-2 my-3" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
            <div className="px-4 mb-2 small fw-bold text-uppercase" style={{ color: 'rgba(255,255,255,0.7)', opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s', visibility: isSidebarOpen ? 'visible' : 'hidden' }}>Management Tools</div>
            <Link to="/directory" draggable="false" className={getLinkClass('/directory')} style={getLinkStyle('/directory')}>
              <i className="bi bi-people-fill" style={iconStyle}></i>
              <span style={textStyle}>Faculty Directory</span>
            </Link>
            <Link to="/ai-matcher" draggable="false" className={getLinkClass('/ai-matcher')} style={getLinkStyle('/ai-matcher')}>
              <i className="bi bi-robot" style={iconStyle}></i>
              <span style={textStyle}>AI Matcher</span>
            </Link>
            <Link to="/hr-dashboard" draggable="false" className={`nav-link px-3 py-2 my-1 mx-2 rounded d-flex align-items-center ${location.pathname === '/hr-dashboard' ? 'active bg-warning text-dark' : 'text-warning'}`} style={{ textDecoration: 'none' }}>
              <i className="bi bi-shield-lock-fill" style={iconStyle}></i>
              <span style={textStyle}>HR Dashboard</span>
            </Link>
            <Link to="/subjects" draggable="false" className={getLinkClass('/subjects')} style={getLinkStyle('/subjects')}>
              <i className="bi bi-journal-bookmark-fill" style={iconStyle}></i>
              <span style={textStyle}>Manage Subjects</span>
            </Link>
          </>
        )}

        {isAdmin(role) && (
          <>
            <Link to="/manage-users" draggable="false" className={getLinkClass('/manage-users')} style={getLinkStyle('/manage-users')}>
              <i className="bi bi-person-lines-fill" style={iconStyle}></i>
              <span style={textStyle}>Manage Users</span>
            </Link>
            <Link to="/archived-users" draggable="false" className={getLinkClass('/archived-users')} style={getLinkStyle('/archived-users')}>
              <i className="bi bi-archive-fill" style={iconStyle}></i>
              <span style={textStyle}>Archived Accounts</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function MainLayout({ user, setUser, theme, toggleTheme }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return localStorage.getItem('hireSenseSidebarOpen') !== 'false'; // default true
  });

  useEffect(() => {
    localStorage.setItem('hireSenseSidebarOpen', isSidebarOpen);
  }, [isSidebarOpen]);

  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    if (user && user.token) {
      const fetchNotifications = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/notifications/${user.username}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json'
            }
          });
          if (res.ok) {
            const data = await res.json();
            setNotifications(data);
          }
        } catch (error) {
          console.error("Failed to fetch notifications:", error);
        }
      };
      
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);

      const sse = new EventSource(`${import.meta.env.VITE_API_BASE_URL}/api/verify-certificate/stream?token=${user.token}`);
      
      sse.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'verificationComplete') {
          if (data.status === 'verified') {
            toast.success(`Verification complete for ${data.facultyName}. Status: Verified!`);
          } else if (data.status === 'flagged') {
            toast.error(`Verification complete for ${data.facultyName}. Status: Flagged!`);
          } else {
            toast.error(`Verification failed for ${data.facultyName}.`);
          }
          fetchNotifications();
          window.dispatchEvent(new CustomEvent('verificationCompleted', { detail: data }));
        }
      };

      return () => {
        clearInterval(interval);
        sse.close();
      };
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotifClick = async () => {
    setShowNotifs(!showNotifs);
    if (!showNotifs && unreadCount > 0) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/notifications/${user.username}/read`, { 
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (res.ok) {
          setNotifications(notifications.map(n => ({ ...n, isRead: true })));
        }
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return (
      <div className="w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
        <Login onLogin={setUser} />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="d-flex app-background" style={{ height: '100vh', overflow: 'hidden', position: 'relative' }}>
        
        <div 
          style={{
            width: isSidebarOpen ? '260px' : '82px',
            flexShrink: 0,
            transition: 'width 0.3s ease',
            backgroundColor: '#091f0c',
            overflow: 'hidden'
          }}
        >
          <Sidebar 
            user={user} 
            onLogout={handleLogout} 
            isSidebarOpen={isSidebarOpen} 
            setIsSidebarOpen={setIsSidebarOpen} 
          />
        </div>
        
        <div className="d-flex flex-column flex-grow-1" style={{ width: `calc(100% - ${isSidebarOpen ? '260px' : '82px'})`, transition: 'width 0.3s ease' }}>
          
          <div className="shadow-sm px-4 d-flex justify-content-end align-items-center z-3" style={{ height: '70px', minHeight: '70px', backgroundColor: 'var(--surface-neutral)', borderBottom: '1px solid var(--border-subtle)', boxSizing: 'border-box', flexShrink: 0 }}>
            
            {/* --- THEME TOGGLE --- */}
            <button 
              className="btn btn-sm rounded-circle p-2 position-relative shadow-sm me-3"
              onClick={toggleTheme}
              title="Toggle Light/Dark Mode"
              style={{ backgroundColor: 'var(--bg-neutral-light)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {theme === 'light' ? <i className="bi bi-moon-fill"></i> : <i className="bi bi-sun-fill text-warning"></i>}
            </button>

            {/* --- NOTIFICATION BELL --- */}
            <div className="position-relative me-4" ref={notifRef}>
              <button 
                className="btn btn-sm rounded-circle p-2 position-relative shadow-sm"
                onClick={handleNotifClick}
                style={{ backgroundColor: 'var(--bg-neutral-light)', border: '1px solid var(--border-subtle)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i className="bi bi-bell-fill fs-5" style={{ color: 'var(--text-main)' }}></i>
                {unreadCount > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-light" style={{ fontSize: '0.65rem' }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              
              {/* Dropdown for notifications */}
              {showNotifs && (
                <div className="position-absolute shadow-lg rounded p-3" style={{ top: '50px', right: '0', width: '300px', zIndex: 1060, backgroundColor: 'var(--surface-neutral)', border: '1px solid var(--border-neutral)', color: 'var(--text-main)' }}>
                  <h6 className="fw-bold mb-3 border-bottom pb-2" style={{ borderColor: 'var(--border-subtle) !important' }}>Notifications</h6>
                  {notifications.length === 0 ? (
                    <p className="text-muted small mb-0">No new notifications</p>
                  ) : (
                    notifications.slice(0, 5).map((notif, idx) => {
                      // Determine color based on message content
                      let variant = 'primary';
                      let icon = 'bi-info-circle-fill';
                      if (notif.message.includes('VERIFIED')) {
                        variant = 'success';
                        icon = 'bi-check-circle-fill';
                      } else if (notif.message.includes('FLAGGED')) {
                        variant = 'danger';
                        icon = 'bi-exclamation-triangle-fill';
                      } else if (notif.message.includes('NEEDS REVIEW')) {
                        variant = 'warning';
                        icon = 'bi-exclamation-circle-fill';
                      }

                      // Safely grab the date
                      const notifDate = notif.timestamp || notif.date || notif.createdAt;

                      return (
                        <div key={idx} className="mb-2 p-2 rounded border-start border-4" style={{ borderLeftColor: `var(--bs-${variant}) !important`, backgroundColor: `rgba(var(--bs-${variant}-rgb), 0.05)` }}>
                          <div className="d-flex align-items-start">
                            <i className={`bi ${icon} text-${variant} me-2 mt-1`} style={{ fontSize: '0.85rem' }}></i>
                            <div>
                              <p className="small mb-1 fw-semibold" style={{ color: 'var(--text-main)', lineHeight: '1.3' }}>{notif.message}</p>
                              <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                {notifDate ? new Date(notifDate).toLocaleString() : 'Just now'}
                              </small>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* --- USER PROFILE --- */}
            <Link to="/profile" className="d-flex align-items-center text-decoration-none" style={{ cursor: 'pointer' }}>
              <div className="text-end me-3">
                <div className="fw-bold" style={{ color: 'var(--brand-glow-accent)', fontSize: '0.95rem', lineHeight: '1.2' }}>{user.name}</div>
                <div className="text-uppercase" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>{user.role.replace('_', ' ')}</div>
              </div>
              <div className="rounded-circle d-flex align-items-center justify-content-center shadow-sm hover-lift" style={{ width: '45px', height: '45px', backgroundColor: 'var(--bg-neutral-tint)', border: '2px solid var(--border-subtle)' }}>
                <i className="bi bi-person-circle fs-3 text-secondary"></i>
              </div>
            </Link>
          </div>

          <div className="p-4 overflow-y-auto overflow-x-hidden flex-grow-1 h-100" id="main-scroll-container">
            <ErrorBoundary>
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
            </ErrorBoundary>
          </div>

        </div>
      </div>
    </>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('hireSenseUser');
    if (!savedUser || savedUser === "undefined") return null;
    try { return JSON.parse(savedUser); } catch (error) { sessionStorage.removeItem('hireSenseUser'); return null; }
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('hireSenseTheme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('hireSenseTheme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSetUser = (userData) => {
    setUser(userData);
    if (userData) {
      sessionStorage.setItem('hireSenseUser', JSON.stringify(userData));
    } else {
      sessionStorage.removeItem('hireSenseUser');
    }
  };

  return (
    <Router>
      <MainLayout user={user} setUser={handleSetUser} theme={theme} toggleTheme={toggleTheme} />
    </Router>
  );
}

export default App;