import React, { useState, useEffect } from 'react';

const SubjectManager = () => {
  const [hierarchy, setHierarchy] = useState({});
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [eligibleFaculty, setEligibleFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingFaculty, setFetchingFaculty] = useState(false);
  
  // Tracks which department folder is currently open
  const [openDept, setOpenDept] = useState(null);

  // 1. Retrieve the token once at the top
  const savedUser = JSON.parse(localStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        // --- UPDATED: FETCH WITH TOKEN ---
        const response = await fetch('http://localhost:5000/api/faculty/subjects/hierarchy', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setHierarchy(data);
          
          // Auto-open the first department when the page loads
          if (Object.keys(data).length > 0) {
            setOpenDept(Object.keys(data)[0]);
          }
        } else {
          console.error("Backend refused the request. Token may be invalid or expired.");
        }
      } catch (error) {
        console.error("Failed to fetch hierarchy:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchHierarchy();
  }, [token]); // Added token as dependency

  const handleSubjectClick = async (subject) => {
    setSelectedSubject(subject);
    setFetchingFaculty(true);
    setEligibleFaculty([]);

    try {
      // --- UPDATED: FETCH WITH TOKEN ---
      const response = await fetch(`http://localhost:5000/api/faculty/subjects/${subject.courseCode}/faculty`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEligibleFaculty(data);
      } else {
        console.error("Backend refused the request. Token may be invalid or expired.");
      }
    } catch (error) {
      console.error("Failed to fetch eligible faculty:", error);
    } finally {
      setFetchingFaculty(false);
    }
  };

  // Toggles the accordion state natively in React
  const toggleDept = (deptName) => {
    setOpenDept(openDept === deptName ? null : deptName);
  };

  if (loading) {
    return <div className="container mt-5 text-center"><h5>Loading Subject Hierarchy...</h5></div>;
  }

  return (
    <div className="container mt-4 pb-5">
      <div className="mb-4">
        <h2 className="fw-bold text-primary mb-1"><i className="bi bi-journal-bookmark-fill me-2"></i>Subject Eligibility Manager</h2>
        <p className="text-muted">Browse institutional subjects and verify faculty teaching eligibilities.</p>
      </div>

      <div className="row g-4">
        {/* LEFT COLUMN: The Hierarchy Tree */}
        <div className="col-md-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-dark text-white fw-bold py-3">
              Institutional Hierarchy
            </div>
            <div className="card-body p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <div className="accordion accordion-flush">
                
                {Object.keys(hierarchy).map((dept, deptIndex) => {
                  const isOpen = openDept === dept; 
                  
                  return (
                    <div className="accordion-item border-bottom" key={deptIndex}>
                      <h2 className="accordion-header">
                        <button 
                          className={`accordion-button fw-bold bg-light ${isOpen ? '' : 'collapsed'}`} 
                          type="button" 
                          onClick={() => toggleDept(dept)}
                          style={{ boxShadow: 'none' }}
                        >
                          <i className="bi bi-building me-2 text-primary"></i> Department: {dept}
                        </button>
                      </h2>
                      
                      <div className={`accordion-collapse collapse ${isOpen ? 'show' : ''}`}>
                        <div className="accordion-body p-0">
                          
                          {Object.keys(hierarchy[dept]).map((prog, progIndex) => (
                            <div className="border-bottom" key={progIndex}>
                              <div className="bg-white px-4 py-2 fw-semibold text-secondary border-bottom">
                                <i className="bi bi-diagram-2 me-2 text-success"></i> Program: {prog}
                              </div>
                              
                              <div className="list-group list-group-flush rounded-0">
                                {hierarchy[dept][prog].map((sub, subIndex) => (
                                  <button 
                                    key={subIndex}
                                    className={`list-group-item list-group-item-action px-5 py-3 ${selectedSubject?.courseCode === sub.courseCode ? 'active bg-primary text-white border-primary' : ''}`}
                                    onClick={() => handleSubjectClick(sub)}
                                  >
                                    <div className="d-flex w-100 justify-content-between">
                                      <h6 className="mb-1 fw-bold">{sub.courseCode}</h6>
                                    </div>
                                    <small className={selectedSubject?.courseCode === sub.courseCode ? 'text-white-50' : 'text-muted'}>
                                      {sub.subjectName}
                                    </small>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                        </div>
                      </div>
                    </div>
                  );
                })}
                
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: The Faculty Results */}
        <div className="col-md-7">
          <div className="card shadow-sm border-0 h-100 bg-white">
            <div className="card-body p-4">
              
              {!selectedSubject ? (
                <div className="text-center text-muted mt-5 pt-5">
                  <i className="bi bi-hand-index text-primary opacity-50" style={{ fontSize: '3rem' }}></i>
                  <h5 className="mt-3">Select a subject from the hierarchy</h5>
                  <p>Click on any course code on the left to view eligible faculty members.</p>
                </div>
              ) : (
                <>
                  <div className="border-bottom pb-3 mb-4">
                    <span className="badge bg-primary mb-2">Selected Subject</span>
                    <h3 className="fw-bold mb-0">{selectedSubject.courseCode}</h3>
                    <h5 className="text-muted">{selectedSubject.subjectName}</h5>
                  </div>

                  <h5 className="fw-bold mb-3"><i className="bi bi-person-check-fill text-success me-2"></i>Eligible Faculty</h5>
                  
                  {fetchingFaculty ? (
                    <div className="text-center my-4"><div className="spinner-border text-primary"></div></div>
                  ) : eligibleFaculty.length === 0 ? (
                    <div className="alert alert-warning border-0 shadow-sm">
                      <i className="bi bi-exclamation-triangle-fill me-2"></i> No verified faculty members are currently eligible to teach this subject.
                    </div>
                  ) : (
                    <div className="row g-3">
                      {eligibleFaculty.map((faculty, index) => (
                        <div className="col-12" key={index}>
                          <div className="card border-light shadow-sm bg-light hover-lift">
                            <div className="card-body d-flex align-items-center">
                              <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-3" style={{ width: '45px', height: '45px' }}>
                                {faculty.firstName[0]}{faculty.lastName[0]}
                              </div>
                              <div className="flex-grow-1">
                                <h6 className="fw-bold mb-0">{faculty.firstName} {faculty.lastName}</h6>
                                <p className="text-muted small mb-0">{faculty.department}</p>
                              </div>
                              <div>
                                <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-2">
                                  Approved
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SubjectManager;