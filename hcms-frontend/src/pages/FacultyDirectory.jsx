import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const FacultyDirectory = () => {
  // 1. Core State
  const [directoryData, setDirectoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 2. Filter State (NEW)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // 3. UI State
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [previewDoc, setPreviewDoc] = useState({ isOpen: false, url: '', title: '' });

  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/faculty/approved');
        const data = await response.json();

        if (data && data.length > 0) {
          const groupedProfiles = data.reduce((acc, doc) => {
            const fullName = `${doc.firstName} ${doc.lastName}`.toUpperCase();
            
            if (!acc[fullName]) {
              acc[fullName] = {
                fullName: `${doc.firstName} ${doc.lastName}`,
                firstName: doc.firstName,
                lastName: doc.lastName,
                department: doc.department,
                documentCount: 0,
                tags: new Set(),
                eligibleSubjects: new Set(),
                documents: []
              };
            }
            
            acc[fullName].documentCount += 1;
            
            if (doc.tags && Array.isArray(doc.tags)) {
              doc.tags.forEach(tag => acc[fullName].tags.add(tag));
            }

            if (doc.eligibleSubjects && Array.isArray(doc.eligibleSubjects)) {
              doc.eligibleSubjects.forEach(sub => acc[fullName].eligibleSubjects.add(sub));
            }
            
            acc[fullName].documents.push(doc);
            return acc;
          }, {});

          const formattedArray = Object.values(groupedProfiles).map(profile => ({
            ...profile,
            tags: Array.from(profile.tags),
            eligibleSubjects: Array.from(profile.eligibleSubjects)
          }));

          setDirectoryData(formattedArray);
        }
      } catch (error) {
        console.error("Error fetching directory:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDirectory();
  }, []);

  // --- Handlers ---
  const openViewer = (url, title) => url ? setPreviewDoc({ isOpen: true, url, title }) : alert("No file attached.");
  const closeViewer = () => setPreviewDoc({ isOpen: false, url: '', title: '' });
  const closeProfile = () => setSelectedFaculty(null);

  // --- UI Helpers ---
  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // --- Filter Logic ---
  const filteredData = directoryData.filter(faculty => {
    const matchesSearch = faculty.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          faculty.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDept = filterDept === '' || faculty.department === filterDept;
    return matchesSearch && matchesDept;
  });

  // Extract unique departments for the dropdown
  const departments = [...new Set(directoryData.map(item => item.department))].filter(Boolean);

  const radarData = [
    { metric: 'Learning Env.', rating: 4.2, fullMark: 5 },
    { metric: 'Instructional Facilitation', rating: 4.8, fullMark: 5 },
    { metric: 'Assessment', rating: 3.9, fullMark: 5 },
    { metric: 'Professionalism', rating: 4.5, fullMark: 5 },
  ];

  if (loading) return <div className="container mt-5 text-center"><div className="spinner-border text-primary" role="status"></div><h5 className="mt-3">Loading Directory...</h5></div>;
  if (directoryData.length === 0) return <div className="container mt-5 text-center"><h5>No verified faculty profiles available.</h5></div>;

  return (
    <div className="container mt-4 pb-5">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div>
          <h2 className="fw-bold text-primary mb-1">Faculty Directory</h2>
          <p className="text-muted mb-0">Browse and filter verified institutional competencies.</p>
        </div>
      </div>

      {/* --- SEARCH & FILTER CONTROLS --- */}
      <div className="card shadow-sm border-0 mb-4 bg-white">
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
      
      {/* --- MASTER VIEW: The Directory Grid --- */}
      <div className="row g-4">
        {filteredData.length > 0 ? filteredData.map((faculty, index) => {
          // Truncate tags to prevent vertical stretching
          const displayLimit = 5;
          const visibleTags = faculty.tags.slice(0, displayLimit);
          const extraTagsCount = faculty.tags.length - displayLimit;

          return (
            <div className="col-md-6 col-lg-4" key={index}>
              <div className="card shadow-sm h-100 border-0 d-flex flex-column hover-lift">
                <div className="card-body flex-grow-1">
                  
                  {/* Avatar & Header */}
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

                  {/* Truncated Skills List */}
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
                    onClick={() => setSelectedFaculty(faculty)}
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

      {/* --- DETAIL VIEW: Full Profile Modal (Unchanged) --- */}
      {selectedFaculty && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', overflowY: 'auto' }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-light border-0 shadow-lg">
              
              <div className="modal-header border-bottom px-4 py-3 bg-white">
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

              <div className="modal-body p-4">
                <div className="row mb-4 align-items-stretch">
                  <div className="col-md-6">
                    <div className="card shadow-sm h-100 border-0">
                      <div className="card-body text-center d-flex flex-column justify-content-center">
                        <h6 className="text-muted fw-bold mb-0">OVERALL RATING</h6>
                        <h2 className="display-4 fw-bold mb-0">4.35</h2>
                        <div className="text-warning mb-2 fs-5">★ ★ ★ ★ ☆</div>
                        <div style={{ width: '100%', height: 250 }}>
                          <ResponsiveContainer>
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                              <PolarGrid stroke="#e0e0e0" />
                              <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c757d', fontSize: 11, fontWeight: 'bold' }} />
                              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                              <Radar name="Rating" dataKey="rating" stroke="#0d6efd" fill="#0d6efd" fillOpacity={0.4} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="card shadow-sm h-100 border-0">
                      <div className="card-body">
                        <h6 className="text-muted fw-bold mb-3">ALL VERIFIED SKILLS</h6>
                        <div className="d-flex flex-wrap gap-2 mb-4">
                          {selectedFaculty.tags.map((tag, index) => (
                            <span key={index} className="badge bg-light text-dark border px-3 py-2">{tag}</span>
                          ))}
                        </div>
                        
                        <h6 className="text-muted fw-bold mb-3">ELIGIBLE COURSE COMPETENCIES</h6>
                        <div className="d-flex flex-wrap gap-2">
                          {selectedFaculty.eligibleSubjects.length > 0 ? (
                            selectedFaculty.eligibleSubjects.map((subject, index) => (
                              <span key={index} className="badge bg-primary text-white border px-3 py-2">{subject}</span>
                            ))
                          ) : (
                            <p className="text-muted font-italic text-sm">No explicit course eligibilities found.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <h5 className="text-secondary mb-3"><i className="bi bi-file-earmark-text me-2"></i>Attached Credentials</h5>
                <div className="row g-3">
                  {selectedFaculty.documents.map((doc, index) => (
                    <div className="col-md-6" key={index}>
                      <div className="card shadow-sm border-0 h-100">
                        <div className="card-body">
                          <h6 className="fw-bold mb-1">{doc.documentTitle}</h6>
                          <span className="badge bg-light text-secondary border mb-3">{doc.documentType}</span>
                          <p className="small mb-1"><strong>Issuer:</strong> {doc.issuingInstitution}</p>
                          <p className="small mb-3"><strong>Issued:</strong> {doc.dateReceived}</p>
                          
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
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-DETAIL VIEW: Native PDF Viewer Modal (Unchanged) --- */}
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