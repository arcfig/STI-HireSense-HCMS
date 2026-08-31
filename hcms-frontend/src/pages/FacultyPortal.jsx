import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../config';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const FacultyPortal = ({ user }) => {
  const storedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const token = storedUser?.token;
  const role = user?.role || storedUser?.role || 'faculty';
  const name = user?.name || storedUser?.name || 'User';
  
  const isHeadOrAdmin = ['admin', 'academic_head', 'program_head'].includes(role);

  const [metrics, setMetrics] = useState({
    admin: { totalFaculty: 0, pendingApprovals: 0, departmentCounts: {} },
    faculty: { docCount: 0, skillCount: 0, rating: 'N/A' }
  });
  const [pendingDocs, setPendingDocs] = useState([]);
  const [adminSparkline, setAdminSparkline] = useState([]);
  const [facultySparkline, setFacultySparkline] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const generateSparklineData = (dataArray) => {
    const sparkline = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = dataArray.filter(doc => doc.createdAt && doc.createdAt.startsWith(dateStr)).length;
      sparkline.push({ name: dateStr, count });
    }
    // ensure at least some visual variation if everything is 0
    const maxCount = Math.max(...sparkline.map(s => s.count));
    if (maxCount === 0) {
      return sparkline.map(s => ({ ...s, count: Math.random() * 0.1 })); // microscopic jitter for flatline
    }
    return sparkline;
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!token) {
        console.error("No authentication token found.");
        setLoading(false);
        return;
      }

      try {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        // Fetch approved documents (Accessible by all roles)
        const approvedRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/approved`, { headers });
        
        if (approvedRes.ok) {
          const approvedData = await approvedRes.json();
          
          if (isHeadOrAdmin) {
            // Populate Recent Activity Timeline for Admins (all users)
            const recent = [...approvedData].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
            setRecentActivity(recent);

            // Fetch pending documents ONLY if user is an Admin or Head
            const pendingRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/pending`, { headers });
            const pendingData = pendingRes.ok ? await pendingRes.json() : [];
            setPendingDocs(pendingData);
            setAdminSparkline(generateSparklineData(pendingData));

            // Execute Department Aggregation Map
            const facultyMap = new Map();
            approvedData.forEach(doc => {
              const nameKey = `${doc.firstName} ${doc.lastName}`.toLowerCase();
              const dept = doc.department || 'Unassigned';
              
              if (!facultyMap.has(nameKey)) {
                facultyMap.set(nameKey, dept);
              }
            });

            // Count unique faculty per department
            const deptCounts = {};
            facultyMap.forEach(dept => {
              deptCounts[dept] = (deptCounts[dept] || 0) + 1;
            });
            
            setMetrics(prev => ({
              ...prev,
              admin: {
                totalFaculty: facultyMap.size,
                pendingApprovals: pendingData.length || 0,
                departmentCounts: deptCounts
              }
            }));
          } else {
            // Calculate Faculty Micro-Metrics using only the approved data
            const targetIdentity = name.toLowerCase().replace(/\s+/g, '');
            const myDocs = approvedData.filter(doc => {
              const docName = `${doc.firstName} ${doc.lastName}`.toLowerCase().replace(/\s+/g, '');
              return docName === targetIdentity;
            });
            setFacultySparkline(generateSparklineData(myDocs));

            const mySkills = new Set(myDocs.flatMap(doc => doc.tags || [])).size;
            
            const evals = myDocs.filter(d => d.documentType === 'Faculty Evaluation' && d.evaluationRating);
            let avgRating = 'N/A';
            if (evals.length > 0) {
              const sum = evals.reduce((acc, curr) => acc + curr.evaluationRating, 0);
              avgRating = (sum / evals.length).toFixed(2);
            }

            setMetrics(prev => ({
              ...prev,
              faculty: {
                docCount: myDocs.length,
                skillCount: mySkills,
                rating: avgRating
              }
            }));

            // Populate Recent Activity Timeline for Faculty (only their own docs)
            const recent = [...myDocs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
            setRecentActivity(recent);
          }
        }
      } catch (error) {
        console.error("Failed to fetch dashboard analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [isHeadOrAdmin, name, token]);



  return (
    <div className="container mt-2">
      <div className="card border-0 mb-4 position-relative overflow-hidden" style={{ backgroundColor: 'var(--brand-primary-bg)', color: 'var(--brand-primary-text)', borderRadius: '12px' }}>
        <div className="position-absolute top-0 end-0 h-100 opacity-25" style={{ pointerEvents: 'none' }}>
          <svg width="300" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,100 C100,0 200,100 300,0 L300,100 Z" fill="rgba(255, 255, 255, 0.2)" />
            <circle cx="250" cy="50" r="100" fill="rgba(255, 255, 255, 0.1)" />
          </svg>
        </div>
        <div className="card-body py-4 px-4 d-flex justify-content-between align-items-center position-relative z-1">
          <div>
            <h3 className="fw-bold mb-1" style={{ color: 'var(--brand-primary-text)' }}>{getGreeting()}, {name}</h3>
            <p className="mb-0 opacity-75 fw-medium" style={{ color: '#ffffff' }}>{currentDate} • {APP_NAME}</p>
          </div>
          <span className="badge bg-white px-3 py-2 shadow-sm" style={{ color: 'var(--brand-primary-bg)' }}>
            {role.replace('_', ' ')}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="row g-4 mb-5">
          <div className="col-lg-8">
            <div className="skeleton-loader border-0" style={{ height: '100px', width: '100%', marginBottom: '1.5rem', borderRadius: '12px' }}></div>
            <div className="skeleton-loader border-0" style={{ height: '300px', width: '100%', borderRadius: '12px' }}></div>
          </div>
          <div className="col-lg-4">
            <div className="skeleton-loader border-0 mb-3" style={{ height: '24px', width: '40%', borderRadius: '4px' }}></div>
            <div className="row g-3">
              <div className="col-6"><div className="skeleton-loader border-0" style={{ height: '100px', width: '100%', borderRadius: '12px' }}></div></div>
              <div className="col-6"><div className="skeleton-loader border-0" style={{ height: '100px', width: '100%', borderRadius: '12px' }}></div></div>
              <div className="col-6"><div className="skeleton-loader border-0" style={{ height: '100px', width: '100%', borderRadius: '12px' }}></div></div>
              <div className="col-6"><div className="skeleton-loader border-0" style={{ height: '100px', width: '100%', borderRadius: '12px' }}></div></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="row g-4 mb-5">
          {/* Column A: Operational Focus (Left Pane) */}
          <div className="col-lg-8">
            <h5 className="text-secondary fw-bold mb-3">Quick Actions</h5>
            <div className="row g-3 mb-4">
              <div className="col-sm-6">
                {isHeadOrAdmin ? (
                  <div className="card h-100 bg-white hover-lift transition-all" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                    <div className="card-body p-3 d-flex align-items-center">
                      <div className="p-3 me-3" style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }}>
                        <i className="bi bi-people-fill fs-4" style={{ color: 'var(--brand-primary-bg)' }}></i>
                      </div>
                      <div>
                        <h6 className="fw-bold mb-1">Faculty Directory</h6>
                        <Link to="/directory" className="btn btn-neutral-outline btn-sm fw-bold px-3 mt-1">Open Directory</Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card h-100 bg-white hover-lift transition-all" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                    <div className="card-body p-3 d-flex align-items-center">
                      <div className="p-3 me-3" style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }}>
                        <i className="bi bi-person-badge-fill fs-4" style={{ color: 'var(--brand-primary-bg)' }}></i>
                      </div>
                      <div>
                        <h6 className="fw-bold mb-1">My Portfolio</h6>
                        <Link to="/portfolio" className="btn btn-neutral-outline btn-sm fw-bold px-3 mt-1">View Portfolio</Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="col-sm-6">
                <div className="card h-100 bg-white hover-lift transition-all" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                  <div className="card-body p-3 d-flex align-items-center">
                    <div className="p-3 me-3" style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }}>
                      <i className="bi bi-cloud-arrow-up-fill fs-4" style={{ color: 'var(--brand-primary-bg)' }}></i>
                    </div>
                    <div>
                      <h6 className="fw-bold mb-1">Submit Credentials</h6>
                      <Link to="/upload" className="btn btn-neutral-outline btn-sm fw-bold px-3 mt-1">Upload Now</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isHeadOrAdmin && (
              <>
                <h5 className="text-secondary fw-bold mb-3 mt-5">Action Center</h5>
                {pendingDocs.length > 0 ? (
                  <div className="card border-0 shadow-sm rounded-3 overflow-hidden hover-lift transition-all">
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="border-0 bg-transparent text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Faculty Name</th>
                            <th className="border-0 bg-transparent text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Document Title</th>
                            <th className="border-0 bg-transparent text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Date</th>
                            <th className="border-0 bg-transparent text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Department</th>
                            <th className="border-0 bg-transparent text-end pe-4"></th>
                          </tr>
                        </thead>
                        <tbody className="border-top-0">
                          {pendingDocs.slice(0, 5).map(doc => (
                            <tr key={doc._id} style={{ borderBottom: '1px solid var(--border-neutral)' }}>
                              <td className="py-3 px-3">{doc.firstName} {doc.lastName}</td>
                              <td className="py-3">
                                <span className="fw-semibold">{doc.documentTitle}</span>
                                <br/>
                                <small className="text-muted">{doc.documentType}</small>
                              </td>
                              <td className="py-3 text-muted">{new Date(doc.createdAt).toLocaleDateString()}</td>
                              <td className="py-3 text-muted">{doc.department || 'Unassigned'}</td>
                              <td className="py-3 text-end pe-4">
                                <Link to="/hr-dashboard" className="btn btn-sm btn-light text-primary fw-bold hover-lift px-3">Review</Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="card border-0 shadow-sm rounded-3 p-5 text-center bg-white d-flex flex-column align-items-center justify-content-center hover-lift transition-all">
                    <i className="bi bi-check2-circle text-success opacity-50" style={{ fontSize: '4rem' }}></i>
                    <h5 className="text-muted mt-3 fw-bold">Queue Empty</h5>
                    <p className="text-muted small mb-0">All pending credentials have been reviewed and processed.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Column B: Analytical Summary (Right Pane) */}
          <div className="col-lg-4">
            <h5 className="text-secondary fw-bold mb-3">System Health</h5>
            <div className="row g-3">
              {isHeadOrAdmin ? (
                <>
                  <div className="col-6">
                    <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Verified Faculty</h6>
                          <div style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-people-fill" style={{ color: 'var(--brand-primary-bg)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.admin.totalFaculty}</h2>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-6">
                    <div className="card h-100 position-relative overflow-hidden" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2 position-relative z-1">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Pending Approvals</h6>
                          <div style={{ backgroundColor: 'rgba(255, 105, 0, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-inbox-fill" style={{ color: 'var(--semantic-warning)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.admin.pendingApprovals}</h2>
                      </div>
                      <div className="position-absolute bottom-0 start-0 w-100 z-0" style={{ height: '40px', opacity: 0.15 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={adminSparkline}>
                            <Area type="monotone" dataKey="count" stroke="var(--semantic-warning)" fill="var(--semantic-warning)" strokeWidth={2} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {Object.entries(metrics.admin.departmentCounts).map(([dept, count]) => {
                    let iconColor = 'var(--brand-primary-bg)';
                    let bgColor = 'rgba(8, 97, 47, 0.1)';
                    
                    if (dept === 'General Education') {
                      iconColor = 'var(--semantic-info)';
                      bgColor = 'rgba(6, 147, 227, 0.1)';
                    } else if (dept === 'Information Technology') {
                      iconColor = 'var(--border-neutral)';
                      bgColor = '#f8fafc';
                    }

                    return (
                      <div className="col-6" key={dept}>
                        <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                          <div className="card-body p-2">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h6 className="text-muted fw-bold mb-0 text-uppercase text-truncate" style={{maxWidth: '80%', fontSize: '0.75rem'}} title={dept}>{dept}</h6>
                              <div style={{ backgroundColor: bgColor, borderRadius: '8px' }} className="px-2 py-1">
                                <i className="bi bi-diagram-3-fill" style={{ color: iconColor }}></i>
                              </div>
                            </div>
                            <h2 className="fs-4 fw-semibold text-dark mb-0">{count}</h2>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="col-6">
                    <div className="card h-100 position-relative overflow-hidden" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2 position-relative z-1">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Approved Docs</h6>
                          <div style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-file-earmark-check-fill" style={{ color: 'var(--brand-primary-bg)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.faculty.docCount}</h2>
                      </div>
                      <div className="position-absolute bottom-0 start-0 w-100 z-0" style={{ height: '40px', opacity: 0.15 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={facultySparkline}>
                            <Area type="monotone" dataKey="count" stroke="var(--brand-primary-bg)" fill="var(--brand-primary-bg)" strokeWidth={2} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Verified Skills</h6>
                          <div style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-patch-check-fill" style={{ color: 'var(--brand-primary-bg)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.faculty.skillCount}</h2>
                      </div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Latest Rating</h6>
                          <div style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-star-fill" style={{ color: 'var(--brand-primary-bg)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.faculty.rating}</h2>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Recent Activity Timeline - Only for Admin/Heads */}
            {isHeadOrAdmin && (
              <>
                <h5 className="text-secondary fw-bold mb-3 mt-5">Recent Activity</h5>
                <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
                  <div className="card-body p-0">
                    {recentActivity.length > 0 ? (
                      <ul className="list-group list-group-flush">
                        {recentActivity.map((activity, idx) => (
                          <li key={idx} className="list-group-item px-4 py-3 d-flex align-items-center border-bottom" style={{ borderColor: 'var(--border-neutral)' }}>
                            <div className="p-2 me-3 rounded-circle d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', width: '36px', height: '36px' }}>
                              <i className="bi bi-check-lg" style={{ color: 'var(--brand-primary-bg)' }}></i>
                            </div>
                            <div className="flex-grow-1">
                              <p className="mb-0 fw-semibold text-dark fs-6" style={{ lineHeight: '1.2' }}>{activity.documentTitle}</p>
                              <small className="text-muted">{activity.firstName} {activity.lastName} • {activity.documentType}</small>
                            </div>
                            <small className="text-muted fw-medium text-end ms-2">
                              {new Date(activity.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-muted fst-italic mb-0">No recent activity found.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyPortal;