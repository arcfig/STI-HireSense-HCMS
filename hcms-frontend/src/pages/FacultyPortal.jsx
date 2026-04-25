import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const FacultyPortal = ({ user }) => {
  const storedUser = JSON.parse(localStorage.getItem('hireSenseUser') || '{}');
  const token = storedUser?.token;
  const role = user?.role || storedUser?.role || 'faculty';
  const name = user?.name || storedUser?.name || 'User';
  
  const isHeadOrAdmin = ['admin', 'academic_head', 'program_head'].includes(role);

  const [metrics, setMetrics] = useState({
    admin: { totalFaculty: 0, pendingApprovals: 0, totalSkills: 0 },
    faculty: { docCount: 0, skillCount: 0, rating: 'N/A' }
  });
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
        const approvedRes = await fetch('http://localhost:5000/api/faculty/approved', { headers });
        
        if (approvedRes.ok) {
          const approvedData = await approvedRes.json();

          if (isHeadOrAdmin) {
            // Fetch pending documents ONLY if user is an Admin or Head
            const pendingRes = await fetch('http://localhost:5000/api/faculty/pending', { headers });
            const pendingData = pendingRes.ok ? await pendingRes.json() : [];

            const uniqueFaculty = new Set(approvedData.map(doc => `${doc.firstName} ${doc.lastName}`.toLowerCase())).size;
            const allSkills = new Set(approvedData.flatMap(doc => doc.tags || [])).size;
            
            setMetrics(prev => ({
              ...prev,
              admin: {
                totalFaculty: uniqueFaculty,
                pendingApprovals: pendingData.length || 0,
                totalSkills: allSkills
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
      <div className="card shadow-sm border-0 mb-4 bg-primary text-white" style={{ background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)' }}>
        <div className="card-body p-4 d-flex justify-content-between align-items-center">
          <div>
            <h3 className="fw-bold mb-1">Welcome, {name}</h3>
            <p className="mb-0 opacity-75">STI Human Capital Management System</p>
          </div>
          <span className="badge bg-white text-primary text-uppercase px-3 py-2 shadow-sm">
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
        <>
          <div className="row g-4 mb-5">
            {isHeadOrAdmin ? (
              <>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-primary border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Verified Faculty</h6>
                        <div className="bg-primary bg-opacity-10 text-primary rounded px-2 py-1"><i className="bi bi-people-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.admin.totalFaculty}</h2>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-warning border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Pending Approvals</h6>
                        <div className="bg-warning bg-opacity-10 text-warning rounded px-2 py-1"><i className="bi bi-inbox-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.admin.pendingApprovals}</h2>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-success border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Skills Indexed</h6>
                        <div className="bg-success bg-opacity-10 text-success rounded px-2 py-1"><i className="bi bi-tags-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.admin.totalSkills}</h2>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-primary border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Approved Documents</h6>
                        <div className="bg-primary bg-opacity-10 text-primary rounded px-2 py-1"><i className="bi bi-file-earmark-check-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.faculty.docCount}</h2>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-success border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Verified Skills</h6>
                        <div className="bg-success bg-opacity-10 text-success rounded px-2 py-1"><i className="bi bi-patch-check-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.faculty.skillCount}</h2>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100 border-bottom border-info border-4">
                    <div className="card-body p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="text-muted fw-bold mb-0 text-uppercase">Latest Rating</h6>
                        <div className="bg-info bg-opacity-10 text-info rounded px-2 py-1"><i className="bi bi-star-fill"></i></div>
                      </div>
                      <h2 className="display-5 fw-bold text-dark mb-0">{metrics.faculty.rating}</h2>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <h5 className="text-secondary fw-bold mb-3">Quick Actions</h5>
          <div className="row g-4">
            <div className="col-md-6">
              {isHeadOrAdmin ? (
                <div className="card h-100 border-0 bg-white shadow-sm hover-lift transition-all">
                  <div className="card-body p-4 d-flex align-items-center">
                    <div className="bg-primary bg-opacity-10 p-3 rounded-circle me-4">
                      <i className="bi bi-people-fill text-primary fs-3"></i>
                    </div>
                    <div>
                      <h5 className="fw-bold mb-1">Faculty Directory</h5>
                      <p className="small text-muted mb-3">Browse the aggregated institutional competency database.</p>
                      <Link to="/directory" className="btn btn-sm btn-outline-primary fw-bold px-4">Open Directory</Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card h-100 border-0 bg-white shadow-sm hover-lift transition-all">
                  <div className="card-body p-4 d-flex align-items-center">
                    <div className="bg-primary bg-opacity-10 p-3 rounded-circle me-4">
                      <i className="bi bi-person-badge-fill text-primary fs-3"></i>
                    </div>
                    <div>
                      <h5 className="fw-bold mb-1">My Portfolio</h5>
                      <p className="small text-muted mb-3">Review your approved credentials and verified skills.</p>
                      <Link to="/portfolio" className="btn btn-sm btn-outline-primary fw-bold px-4">View Portfolio</Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="col-md-6">
              <div className="card h-100 border-0 bg-white shadow-sm hover-lift transition-all">
                <div className="card-body p-4 d-flex align-items-center">
                  <div className="bg-success bg-opacity-10 p-3 rounded-circle me-4">
                    <i className="bi bi-cloud-arrow-up-fill text-success fs-3"></i>
                  </div>
                  <div>
                    <h5 className="fw-bold mb-1">Submit Credentials</h5>
                    <p className="small text-muted mb-3">Upload new documents for AI extraction and HR review.</p>
                    <Link to="/upload" className="btn btn-sm btn-outline-success fw-bold px-4">Upload Now</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FacultyPortal;