import React from 'react';
import { Link } from 'react-router-dom';

const FacultyPortal = ({ user }) => {
  // Retrieve user details, defaulting to local storage or safe fallbacks
  const role = user?.role || localStorage.getItem('role') || 'faculty';
  const name = user?.name || localStorage.getItem('name') || 'User';

  // Define access level
  const isHeadOrAdmin = ['admin', 'academic_head', 'program_head'].includes(role);

  return (
    <div className="container mt-5">
      <div className="card shadow-sm border-0">
        <div className="card-body p-5 text-center">
          <h2 className="fw-bold text-primary mb-3">Welcome to the STI Human Capital System</h2>
          <p className="lead text-muted mb-5">
            Hello, <strong>{name}</strong>. You are currently logged in as: <span className="badge bg-secondary text-uppercase">{role.replace('_', ' ')}</span>
          </p>

          <div className="row justify-content-center g-4">
            
            {/* --- DYNAMIC LEFT CARD --- */}
            <div className="col-md-4">
              {isHeadOrAdmin ? (
                /* Admin/Head View: Directory */
                <div className="card h-100 border-light bg-light shadow-sm">
                  <div className="card-body py-4">
                    <i className="bi bi-people-fill text-primary fs-1 mb-3 d-block"></i>
                    <h5 className="card-title fw-bold">Faculty Directory</h5>
                    <p className="card-text small text-muted mb-4">View aggregated credentials and skills across all departments.</p>
                    <Link to="/directory" className="btn btn-outline-primary w-100">Go to Directory</Link>
                  </div>
                </div>
              ) : (
                /* Faculty View: Personal Portfolio */
                <div className="card h-100 border-light bg-light shadow-sm">
                  <div className="card-body py-4">
                    <i className="bi bi-person-badge-fill text-primary fs-1 mb-3 d-block"></i>
                    <h5 className="card-title fw-bold">My Portfolio</h5>
                    <p className="card-text small text-muted mb-4">Review your approved credentials, eligible subjects, and verified skills.</p>
                    <Link to="/portfolio" className="btn btn-outline-primary w-100">View Portfolio</Link>
                  </div>
                </div>
              )}
            </div>

            {/* --- UNIVERSAL RIGHT CARD --- */}
            <div className="col-md-4">
              <div className="card h-100 border-light bg-light shadow-sm">
                <div className="card-body py-4">
                  <i className="bi bi-cloud-arrow-up-fill text-success fs-1 mb-3 d-block"></i>
                  <h5 className="card-title fw-bold">Submit Credentials</h5>
                  <p className="card-text small text-muted mb-4">Upload new certificates and have our AI automatically extract your skills.</p>
                  <Link to="/upload" className="btn btn-outline-success w-100">Upload Now</Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultyPortal;