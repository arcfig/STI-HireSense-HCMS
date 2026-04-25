import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const FacultyDirectory = () => {
  const [directoryData, setDirectoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [previewDoc, setPreviewDoc] = useState({ isOpen: false, url: '', title: '' });

  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [activeTab, setActiveTab] = useState('Certificates');
  const [selectedEvalTerm, setSelectedEvalTerm] = useState('Overall');

  const VISIBLE_SKILLS_LIMIT = 8;
  const VISIBLE_SUBJECTS_LIMIT = 5;

  // 1. Retrieve the token from the session object
  const savedUser = JSON.parse(localStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  useEffect(() => {
    const fetchDirectory = async () => {
      // 2. Safety check: prevent unauthorized fetch attempts
      if (!token) {
        console.error("No authentication token found.");
        setLoading(false);
        return;
      }

      try {
        // 3. UPDATED: Fetch with Authorization Header
        const response = await fetch('http://localhost:5000/api/faculty/approved', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();

          if (data && data.length > 0) {
            const normalizeNameKey = (fName, lName) => {
              const firstWord = fName.trim().split(/\s+/)[0].toLowerCase();
              const lastWords = lName.trim().split(/\s+/);
              const lastWord = lastWords[lastWords.length - 1].toLowerCase();
              return `${firstWord}_${lastWord}`;
            };

            const groupedProfiles = data.reduce((acc, doc) => {
              const normalizedKey = normalizeNameKey(doc.firstName, doc.lastName);
              
              if (!acc[normalizedKey]) {
                acc[normalizedKey] = {
                  fullName: `${doc.firstName} ${doc.lastName}`,
                  firstName: doc.firstName,
                  lastName: doc.lastName,
                  department: doc.department || '',
                  documentCount: 0,
                  tags: new Set(),
                  eligibleSubjects: new Set(),
                  documents: []
                };
              } else {
                const existingLength = acc[normalizedKey].fullName.replace(/\s+/g, '').length;
                const newLength = `${doc.firstName} ${doc.lastName}`.replace(/\s+/g, '').length;
                if (newLength > existingLength) {
                  acc[normalizedKey].fullName = `${doc.firstName} ${doc.lastName}`;
                }

                const existingDeptLen = acc[normalizedKey].department.length;
                const newDeptLen = (doc.department || '').length;
                if (newDeptLen > existingDeptLen) {
                  acc[normalizedKey].department = doc.department;
                }
              }
              
              acc[normalizedKey].documentCount += 1;
              
              if (doc.tags && Array.isArray(doc.tags)) {
                doc.tags.forEach(tag => acc[normalizedKey].tags.add(tag));
              }

              if (doc.eligibleSubjects && Array.isArray(doc.eligibleSubjects)) {
                doc.eligibleSubjects.forEach(sub => acc[normalizedKey].eligibleSubjects.add(sub));
              }
              
              acc[normalizedKey].documents.push(doc);
              return acc;
            }, {});

            const formattedArray = Object.values(groupedProfiles).map(profile => ({
              ...profile,
              tags: Array.from(profile.tags).filter(Boolean),
              eligibleSubjects: Array.from(profile.eligibleSubjects).filter(Boolean)
            }));

            setDirectoryData(formattedArray);
          }
        } else {
          console.error("Backend refused the request. Token might be expired.");
        }
      } catch (error) {
        console.error("Error fetching directory:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDirectory();
  }, [token]); // Added token as a dependency

  const openViewer = (url, title) => url ? setPreviewDoc({ isOpen: true, url, title }) : alert("No file attached.");
  const closeViewer = () => setPreviewDoc({ isOpen: false, url: '', title: '' });
  const closeProfile = () => setSelectedFaculty(null);

  const handleOpenProfile = (faculty) => {
    setSelectedFaculty(faculty);
    setShowAllSkills(false);
    setShowAllSubjects(false);
    setActiveTab('Certificates');
    setSelectedEvalTerm('Overall');
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const filteredData = directoryData.filter(faculty => {
    const matchesSearch = faculty.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          faculty.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDept = filterDept === '' || faculty.department === filterDept;
    return matchesSearch && matchesDept;
  });

  const departments = [...new Set(directoryData.map(item => item.department))].filter(Boolean);

  let displayedRating = 0;
  let dynamicRadarData = [];
  let categories = {};
  let availableTerms = [];
  let evaluations = [];

  if (selectedFaculty) {
    evaluations = selectedFaculty.documents.filter(d => d.documentType === 'Faculty Evaluation' && d.evaluationRating);
    availableTerms = [...new Set(evaluations.map(e => `${e.academicYear} ${e.term}`.trim()))].filter(Boolean).sort((a, b) => b.localeCompare(a));

    if (evaluations.length > 0) {
      if (selectedEvalTerm === 'Overall') {
        const sum = evaluations.reduce((acc, curr) => acc + curr.evaluationRating, 0);
        displayedRating = (sum / evaluations.length).toFixed(2);
      } else {
        const termEvals = evaluations.filter(e => `${e.academicYear} ${e.term}`.trim() === selectedEvalTerm);
        const sum = termEvals.reduce((acc, curr) => acc + curr.evaluationRating, 0);
        displayedRating = termEvals.length ? (sum / termEvals.length).toFixed(2) : 0;
      }
    }

    dynamicRadarData = [
      { metric: 'Learning Env.', rating: parseFloat(displayedRating), fullMark: 5 },
      { metric: 'Instructional Facilitation', rating: parseFloat(displayedRating), fullMark: 5 },
      { metric: 'Assessment', rating: parseFloat(displayedRating), fullMark: 5 },
      { metric: 'Professionalism', rating: parseFloat(displayedRating), fullMark: 5 },
    ];

    categories = {
      'Certificates': selectedFaculty.documents.filter(d => d.documentType?.includes('Certificate') || d.documentType?.includes('Degree') || d.documentType?.includes('License')),
      '201 Files': selectedFaculty.documents.filter(d => d.documentType === '201 File'),
      'Evaluations': selectedFaculty.documents.filter(d => d.documentType === 'Faculty Evaluation'),
      'Contracts': selectedFaculty.documents.filter(d => ['Contract', 'Letter of Intent', 'Non-Renewal Contract'].includes(d.documentType))
    };
  }

  if (loading) return <div className="container mt-5 text-center"><div className="spinner-border text-primary" role="status"></div><h5 className="mt-3">Loading Directory...</h5></div>;

  return (
    <div className="d-flex flex-column h-100">
      
      <div className="flex-shrink-0">
        <div className="d-flex justify-content-between align-items-end mb-3">
          <div>
            <h2 className="fw-bold text-primary mb-1">Faculty Directory</h2>
            <p className="text-muted mb-0">Browse and filter verified institutional competencies.</p>
          </div>
        </div>

        <div className="card shadow-sm border-0 mb-3 bg-white">
          <div className="card-body p-3">
            <div className="row g-2">
              <div className="col-md-8">
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0"><i className="bi bi-search text-muted"></i></span>
                  <input 
                    type="text" 
                    className="form-control border-start-0 ps-0" 
                    placeholder="Search by faculty name or specific skill..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="col-md-4">
                <select 
                  className="form-select" 
                  value={filterDept} 
                  onChange={(e) => setFilterDept(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments.map((dept, index) => (
                    <option key={index} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-grow-1 overflow-y-auto overflow-x-hidden pe-2 px-1" style={{ minHeight: 0 }}>
        {directoryData.length === 0 ? (
          <div className="text-center py-5">
            <h5 className="text-muted">No verified faculty profiles available.</h5>
          </div>
        ) : (
          <div className="row g-4 pb-4">
            {filteredData.length > 0 ? filteredData.map((faculty, index) => {
              const displayLimit = 5;
              const visibleTags = faculty.tags.slice(0, displayLimit);
              const extraTagsCount = faculty.tags.length - displayLimit;

              return (
                <div className="col-md-6 col-lg-4" key={index}>
                  <div className="card shadow-sm h-100 border-0 d-flex flex-column hover-lift">
                    <div className="card-body flex-grow-1">
                      
                      <div className="d-flex align-items-center mb-3">
                        <div 
                          className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-3 shadow-sm" 
                          style={{ width: '50px', height: '50px', fontSize: '1.2rem' }}
                        >
                          {getInitials(faculty.fullName)}
                        </div>
                        <div>
                          <h5 className="fw-bold mb-0 text-dark">{faculty.fullName}</h5>
                          <p className="text-muted small mb-0">{faculty.department}</p>
                        </div>
                      </div>
                      
                      <div className="mb-3 border-bottom pb-3">
                        <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-2">
                          <i className="bi bi-patch-check-fill me-1"></i> {faculty.documentCount} Verified Credential{faculty.documentCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <p className="small fw-bold text-muted mb-2 text-uppercase" style={{ letterSpacing: '0.5px' }}>Top Skills</p>
                      <div className="d-flex flex-wrap gap-1 mb-3">
                        {visibleTags.length > 0 ? (
                          <>
                            {visibleTags.map((tag, i) => (
                              <span key={i} className="badge bg-light text-secondary border px-2 py-1" style={{fontSize: '0.75rem'}}>{tag}</span>
                            ))}
                            {extraTagsCount > 0 && (
                              <span className="badge bg-secondary bg-opacity-10 text-secondary border px-2 py-1" style={{fontSize: '0.75rem'}}>
                                +{extraTagsCount} more
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted small font-italic">No skills indexed</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="card-footer bg-transparent border-top-0 pt-0 pb-3 px-3">
                      <button 
                        className="btn btn-outline-primary w-100 fw-bold" 
                        onClick={() => handleOpenProfile(faculty)}
                      >
                        View Full Profile
                      </button>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="col-12 text-center py-5">
                <h5 className="text-muted">No faculty members match your search criteria.</h5>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedFaculty && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', overflowY: 'auto', zIndex: 1050 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-light border-0 shadow-lg my-4">
              
              <div className="modal-header border-bottom px-4 py-3 bg-white sticky-top">
                <div className="d-flex align-items-center">
                  <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-3" style={{ width: '50px', height: '50px', fontSize: '1.2rem' }}>
                      {getInitials(selectedFaculty.fullName)}
                  </div>
                  <div>
                    <h4 className="modal-title fw-bold text-primary mb-0">{selectedFaculty.fullName}</h4>
                    <p className="text-muted mb-0 small">Department: <strong>{selectedFaculty.department}</strong></p>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={closeProfile}></button>
              </div>

              <div className="modal-body p-4 bg-light">
                <div className="row mb-4 align-items-stretch">
                  <div className="col-md-5">
                    <div className="card shadow-sm h-100 border-0">
                      <div className="card-body text-center d-flex flex-column justify-content-center">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="text-muted fw-bold mb-0 text-start">PERFORMANCE SCORE</h6>
                          {evaluations.length > 0 && (
                            <select 
                              className="form-select form-select-sm w-auto shadow-sm"
                              value={selectedEvalTerm}
                              onChange={(e) => setSelectedEvalTerm(e.target.value)}
                            >
                              <option value="Overall">Overall Average</option>
                              {availableTerms.map((term, idx) => (
                                <option key={idx} value={term}>{term}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {evaluations.length > 0 ? (
                          <>
                            <h2 className="display-4 fw-bold mb-0 text-primary">{displayedRating}</h2>
                            <div className="text-warning mb-2 fs-5">
                              {'★'.repeat(Math.round(displayedRating))}{'☆'.repeat(5 - Math.round(displayedRating))}
                            </div>
                            <div style={{ width: '100%', height: 220 }}>
                              <ResponsiveContainer>
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={dynamicRadarData}>
                                  <PolarGrid stroke="#e0e0e0" />
                                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c757d', fontSize: 10, fontWeight: 'bold' }} />
                                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                  <Radar name="Rating" dataKey="rating" stroke="#0d6efd" fill="#0d6efd" fillOpacity={0.4} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          </>
                        ) : (
                          <div className="py-5 my-4">
                            <i className="bi bi-bar-chart text-muted opacity-25 display-1"></i>
                            <p className="text-muted mt-3 fst-italic">No evaluation records available.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-md-7">
                    <div className="card shadow-sm h-100 border-0">
                      <div className="card-body">
                        <h6 className="text-muted fw-bold mb-3"><i className="bi bi-patch-check-fill text-primary me-2"></i>VERIFIED SKILL PROFICIENCIES</h6>
                        <div className="d-flex flex-wrap gap-2 mb-3">
                          {selectedFaculty.tags.length > 0 ? (
                            (showAllSkills ? selectedFaculty.tags : selectedFaculty.tags.slice(0, VISIBLE_SKILLS_LIMIT)).map((tag, index) => (
                              <span key={index} className="badge bg-light text-dark border px-3 py-2">{tag}</span>
                            ))
                          ) : (
                            <p className="text-muted font-italic">No verified skills extracted yet.</p>
                          )}
                        </div>
                        {selectedFaculty.tags.length > VISIBLE_SKILLS_LIMIT && (
                          <button 
                            className="btn btn-sm btn-link text-decoration-none p-0 fw-bold"
                            onClick={() => setShowAllSkills(!showAllSkills)}
                          >
                            {showAllSkills ? 'Show Less' : `+ ${selectedFaculty.tags.length - VISIBLE_SKILLS_LIMIT} More Skills...`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card shadow-sm border-0 mb-4">
                  <div className="card-body p-4">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                      <h5 className="fw-bold text-secondary mb-0">
                        <i className="bi bi-card-checklist text-success me-2"></i>Approved Teaching Eligibilities
                      </h5>
                      {selectedFaculty.eligibleSubjects?.length > VISIBLE_SUBJECTS_LIMIT && (
                        <button 
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setShowAllSubjects(!showAllSubjects)}
                        >
                          {showAllSubjects ? 'Collapse List' : 'Expand All'}
                        </button>
                      )}
                    </div>
                    
                    <div className="d-flex flex-wrap gap-2">
                      {selectedFaculty.eligibleSubjects.length > 0 ? (
                        (showAllSubjects ? selectedFaculty.eligibleSubjects : selectedFaculty.eligibleSubjects.slice(0, VISIBLE_SUBJECTS_LIMIT)).map((subject, index) => (
                          <span key={index} className="badge bg-primary text-white fs-6 px-3 py-2 shadow-sm">
                            <i className="bi bi-book-half me-2"></i>{subject}
                          </span>
                        ))
                      ) : (
                        <p className="text-muted fst-italic mb-0">No course eligibilities have been verified for this account yet.</p>
                      )}
                      {!showAllSubjects && selectedFaculty.eligibleSubjects?.length > VISIBLE_SUBJECTS_LIMIT && (
                        <span className="badge bg-light text-secondary border fs-6 px-3 py-2">...</span>
                      )}
                    </div>
                  </div>
                </div>

                <h5 className="text-secondary mb-3 mt-5"><i className="bi bi-folder2-open me-2"></i>Document Portfolio</h5>
                
                <ul className="nav nav-tabs mb-4">
                  {Object.keys(categories).map(tabName => (
                    <li className="nav-item" key={tabName}>
                      <button 
                        className={`nav-link ${activeTab === tabName ? 'border-bottom-0 shadow-sm' : 'border-0'}`}
                        onClick={() => setActiveTab(tabName)}
                        style={{ 
                          backgroundColor: activeTab === tabName ? '#ffffff' : 'transparent',
                          color: activeTab === tabName ? '#0d6efd' : '#6c757d',
                          cursor: 'pointer'
                        }}
                      >
                        <span className="fw-bold">
                          {tabName} ({categories[tabName].length})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="tab-content">
                  <div className="row g-3">
                    {categories[activeTab].length > 0 ? categories[activeTab].map((doc, index) => (
                      <div className="col-md-6" key={index}>
                        <div className="card shadow-sm border-0 h-100">
                          <div className="card-body d-flex flex-column">
                            <h6 className="fw-bold mb-1">{doc.documentTitle}</h6>
                            <span className="badge bg-light text-secondary border mb-3 align-self-start">{doc.documentType}</span>
                            
                            {doc.issuingInstitution && <p className="small mb-1"><strong>Issuer:</strong> {doc.issuingInstitution}</p>}
                            {doc.academicYear && <p className="small mb-1"><strong>Period:</strong> {doc.academicYear} {doc.term}</p>}
                            {doc.evaluationRating && <p className="small mb-1"><strong>Overall Rating:</strong> {doc.evaluationRating}</p>}
                            {doc.intent && <p className="small mb-1"><strong>Intent to Continue:</strong> {doc.intent}</p>}
                            {doc.offenseType && <p className="small mb-1 text-danger"><strong>Reason:</strong> {doc.offenseType}</p>}
                            
                            <p className={`small ${doc.expirationDate ? 'mb-1' : 'mb-3'}`}>
                              <strong>Issued/Added:</strong> {doc.dateReceived ? doc.dateReceived.split('T')[0] : new Date(doc.createdAt).toLocaleDateString()}
                            </p>

                            {doc.expirationDate && (
                              <p className="small mb-3 text-danger fw-bold">
                                <strong>Expires:</strong> {doc.expirationDate.split('T')[0]}
                              </p>
                            )}

                            {doc.tags && doc.tags.length > 0 && (
                              <>
                                <p className="small fw-bold text-muted mb-1 mt-auto">Extracted Data Points</p>
                                <div className="d-flex flex-wrap gap-1 mb-3">
                                  {doc.tags.map((tag, i) => (
                                    <span key={i} className="badge bg-light text-secondary border" style={{fontSize: '0.75rem'}}>{tag}</span>
                                  ))}
                                </div>
                              </>
                            )}

                            <div className="mt-auto pt-2">
                              {doc.documentUrl ? (
                                <button className="btn btn-outline-primary btn-sm w-100 fw-bold" onClick={() => openViewer(doc.documentUrl, doc.documentTitle)}>
                                  View Attached Document
                                </button>
                              ) : (
                                <button className="btn btn-outline-secondary btn-sm w-100" disabled>No File Attached</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="col-12 text-center py-5 text-muted fst-italic bg-white border rounded">
                        No documents found for this category.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {previewDoc.isOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1060 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-dark border-0 shadow-lg">
              <div className="modal-header border-bottom border-secondary px-4 py-3">
                <h5 className="modal-title text-white"><i className="bi bi-file-earmark-text text-primary me-2"></i>{previewDoc.title}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeViewer}></button>
              </div>
              <div className="modal-body p-0 d-flex justify-content-center align-items-center" style={{ height: '75vh', backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
                {previewDoc.url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                  <img src={previewDoc.url} alt="Document Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <object data={previewDoc.url} type="application/pdf" width="100%" height="100%" style={{ border: 'none' }}>
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-white">
                      <p className="mb-3">Browser native PDF viewer is disabled.</p>
                      <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">Open Externally</a>
                    </div>
                  </object>
                )}
              </div>
              <div className="modal-footer border-top border-secondary px-4 py-3 bg-dark d-flex justify-content-between">
                <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-sm">Fallback: Open in New Tab</a>
                <button type="button" className="btn btn-primary fw-bold" onClick={closeViewer}>Close Viewer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyDirectory;