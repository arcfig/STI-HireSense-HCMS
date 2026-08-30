import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../config';

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
  const [loading, setLoading] = useState(true);

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
            // Fetch pending documents ONLY if user is an Admin or Head
            const pendingRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/pending`, { headers });
            const pendingData = pendingRes.ok ? await pendingRes.json() : [];
            setPendingDocs(pendingData);

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
      <div className="card border-0 mb-4" style={{ backgroundColor: 'var(--brand-primary-bg)', color: 'var(--brand-primary-text)', borderRadius: '12px' }}>
        <div className="card-body py-4 px-4 d-flex justify-content-between align-items-center">
          <div>
            <h3 className="fw-bold mb-1" style={{ color: 'var(--brand-primary-text)' }}>Welcome, {name}</h3>
            <p className="mb-0 opacity-75" style={{ color: '#ffffff' }}>{APP_NAME}</p>
          </div>
          <span className="badge bg-white px-3 py-2 shadow-sm" style={{ color: 'var(--brand-primary-bg)' }}>
            {role.replace('_', ' ')}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-3 text-muted">Loading analytics...</p>
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
                        <Link to="/directory" className="btn btn-sm fw-bold px-3 mt-1" style={{ backgroundColor: 'var(--brand-primary-bg)', color: '#ffffff', border: 'none' }}>Open Directory</Link>
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
                        <Link to="/portfolio" className="btn btn-sm fw-bold px-3 mt-1" style={{ backgroundColor: 'var(--brand-primary-bg)', color: '#ffffff', border: 'none' }}>View Portfolio</Link>
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
                      <Link to="/upload" className="btn btn-sm fw-bold px-3 mt-1" style={{ backgroundColor: 'var(--brand-primary-bg)', color: '#ffffff', border: 'none' }}>Upload Now</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isHeadOrAdmin && pendingDocs.length > 0 && (
              <>
                <h5 className="text-secondary fw-bold mb-3 mt-5">Action Center</h5>
                <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Faculty Name</th>
                          <th>Document Title / Credential Type</th>
                          <th>Submission Date</th>
                          <th>Department</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingDocs.slice(0, 5).map(doc => (
                          <tr key={doc._id}>
                            <td>{doc.firstName} {doc.lastName}</td>
                            <td>
                              <span className="fw-semibold">{doc.documentTitle}</span>
                              <br/>
                              <small className="text-muted">{doc.documentType}</small>
                            </td>
                            <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                            <td>{doc.department || 'Unassigned'}</td>
                            <td>
                              <Link to="/hr-dashboard" className="btn btn-sm btn-outline-primary fw-bold">Review</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
                    <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Pending Approvals</h6>
                          <div style={{ backgroundColor: 'rgba(255, 105, 0, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-inbox-fill" style={{ color: 'var(--semantic-warning)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.admin.pendingApprovals}</h2>
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
                    <div className="card h-100" style={{ borderRadius: '12px', border: '1px solid var(--border-neutral)', boxShadow: 'none' }}>
                      <div className="card-body p-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-uppercase" style={{ fontSize: '0.75rem' }}>Approved Docs</h6>
                          <div style={{ backgroundColor: 'rgba(8, 97, 47, 0.1)', borderRadius: '8px' }} className="px-2 py-1">
                            <i className="bi bi-file-earmark-check-fill" style={{ color: 'var(--brand-primary-bg)' }}></i>
                          </div>
                        </div>
                        <h2 className="fs-4 fw-semibold text-dark mb-0">{metrics.faculty.docCount}</h2>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyPortal;