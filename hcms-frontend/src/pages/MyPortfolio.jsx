import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const MyPortfolio = ({ user }) => {
  // 1. State Management
  const [facultyData, setFacultyData] = useState(null);
  const [userDocuments, setUserDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState({ isOpen: false, url: '', title: '' });

  // UI Optimization States (Truncation)
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  
  // Categorization State
  const [activeTab, setActiveTab] = useState('Certificates');
  
  // Evaluation Timeline State
  const [selectedEvalTerm, setSelectedEvalTerm] = useState('Overall');

  // 2. Fetch Data
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/faculty/approved');
        const data = await response.json();
        
        let storedIdentity = user?.name;
        if (!storedIdentity) {
          const localUser = JSON.parse(localStorage.getItem('hireSenseUser'));
          storedIdentity = localUser?.name;
        }

        if (storedIdentity && data && data.length > 0) {
          const filteredDocs = data.filter(doc => {
            const docFullName = `${doc.firstName} ${doc.lastName}`.toLowerCase().replace(/\s+/g, '');
            const targetIdentity = storedIdentity.toLowerCase().replace(/\s+/g, '');
            return docFullName === targetIdentity;
          });

          if (filteredDocs.length > 0) {
            setFacultyData(filteredDocs[0]); 
            setUserDocuments(filteredDocs);  
          } else {
            setFacultyData(null); 
            setUserDocuments([]);
          }
        }
      } catch (error) {
        console.error("Error fetching portfolio:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();
  }, [user]); 

  // 3. UI Handlers
  const openViewer = (url, title) => {
    if (url) {
      setPreviewDoc({ isOpen: true, url, title });
    } else {
      alert("No file attached to this credential.");
    }
  };

  const closeViewer = () => {
    setPreviewDoc({ isOpen: false, url: '', title: '' });
  };

  // 4. Loading & Null States
  if (loading) {
    return <div className="container mt-5 text-center"><h5>Loading Portfolio...</h5></div>;
  }

  if (!facultyData || userDocuments.length === 0) {
    return <div className="container mt-5 text-center"><h5>No approved portfolio data found for this account.</h5></div>;
  }

  // --- Dynamic Evaluation Data Processing ---
  const evaluations = userDocuments.filter(d => d.documentType === 'Faculty Evaluation' && d.evaluationRating);
  const availableTerms = [...new Set(evaluations.map(e => `${e.academicYear} ${e.term}`.trim()))].filter(Boolean).sort((a, b) => b.localeCompare(a));

  let displayedRating = 0;
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

  // Uses the overall rating to dynamically size the radar chart until granular sub-scores are added to the DB
  const dynamicRadarData = [
    { metric: 'Learning Env.', rating: parseFloat(displayedRating), fullMark: 5 },
    { metric: 'Instructional Facilitation', rating: parseFloat(displayedRating), fullMark: 5 },
    { metric: 'Assessment', rating: parseFloat(displayedRating), fullMark: 5 },
    { metric: 'Professionalism', rating: parseFloat(displayedRating), fullMark: 5 },
  ];

  // --- Data Processing & Aggregation ---
  const allVerifiedSkills = [...new Set(userDocuments.flatMap(doc => doc.tags || []))].filter(t => t);
  const VISIBLE_SKILLS_LIMIT = 8;
  const VISIBLE_SUBJECTS_LIMIT = 5;

  // Categorize Documents (Timeline Removed)
  const categories = {
    'Certificates': userDocuments.filter(d => d.documentType?.includes('Certificate') || d.documentType?.includes('Degree') || d.documentType?.includes('License')),
    '201 Files': userDocuments.filter(d => d.documentType === '201 File'),
    'Evaluations': userDocuments.filter(d => d.documentType === 'Faculty Evaluation'),
    'Contracts': userDocuments.filter(d => ['Contract', 'Letter of Intent', 'Non-Renewal Contract'].includes(d.documentType))
  };

  return (
    <div className="container mt-4 pb-5">
      {/* Header Section */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-primary mb-0">{facultyData.firstName} {facultyData.lastName}</h2>
          <p className="text-muted mb-0">Department: <strong>{facultyData.department}</strong></p>
        </div>
        <div className="text-end text-muted small">
          Report Generated<br/>
          <strong>{new Date().toLocaleDateString()}</strong>
        </div>
      </div>

      {/* Analytics & Skills Row */}
      <div className="row mb-4 align-items-stretch">
        
        {/* Left Column: Overall Rating (Dynamic Radar Chart) */}
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
                    {/* Render star visually based on rating */}
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

        {/* Right Column: Verified Skills Summary (Truncated) */}
        <div className="col-md-7">
          <div className="card shadow-sm h-100 border-0">
            <div className="card-body">
              <h6 className="text-muted fw-bold mb-3"><i className="bi bi-patch-check-fill text-primary me-2"></i>VERIFIED SKILL PROFICIENCIES</h6>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {allVerifiedSkills.length > 0 ? (
                  (showAllSkills ? allVerifiedSkills : allVerifiedSkills.slice(0, VISIBLE_SKILLS_LIMIT)).map((tag, index) => (
                    <span key={index} className="badge bg-light text-dark border px-3 py-2">
                      {tag}
                    </span>
                  ))
                ) : (
                  <p className="text-muted font-italic">No verified skills extracted yet.</p>
                )}
              </div>
              
              {allVerifiedSkills.length > VISIBLE_SKILLS_LIMIT && (
                <button 
                  className="btn btn-sm btn-link text-decoration-none p-0 fw-bold"
                  onClick={() => setShowAllSkills(!showAllSkills)}
                >
                  {showAllSkills ? 'Show Less' : `+ ${allVerifiedSkills.length - VISIBLE_SKILLS_LIMIT} More Skills...`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* COURSE ELIGIBILITY SECTION (Truncated) */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h5 className="fw-bold text-secondary mb-0">
              <i className="bi bi-card-checklist text-success me-2"></i>Approved Teaching Eligibilities
            </h5>
            {facultyData.eligibleSubjects?.length > VISIBLE_SUBJECTS_LIMIT && (
              <button 
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowAllSubjects(!showAllSubjects)}
              >
                {showAllSubjects ? 'Collapse List' : 'Expand All'}
              </button>
            )}
          </div>
          
          <div className="d-flex flex-wrap gap-2">
            {facultyData.eligibleSubjects && facultyData.eligibleSubjects.length > 0 ? (
              (showAllSubjects ? facultyData.eligibleSubjects : facultyData.eligibleSubjects.slice(0, VISIBLE_SUBJECTS_LIMIT)).map((courseCode, index) => (
                <span key={index} className="badge bg-primary fs-6 px-3 py-2 shadow-sm">
                  <i className="bi bi-book-half me-2"></i>{courseCode}
                </span>
              ))
            ) : (
              <p className="text-muted fst-italic mb-0">
                No course eligibilities have been verified for this account yet.
              </p>
            )}
            {!showAllSubjects && facultyData.eligibleSubjects?.length > VISIBLE_SUBJECTS_LIMIT && (
              <span className="badge bg-light text-secondary border fs-6 px-3 py-2">
                ...
              </span>
            )}
          </div>
        </div>
      </div>

{/* TABBED CREDENTIALS SECTION */}
      <h5 className="text-secondary mb-3 mt-5"><i className="bi bi-folder2-open me-2"></i>Document Portfolio</h5>
      
      <ul className="nav nav-tabs mb-4">
        {Object.keys(categories).map(tabName => (
          <li className="nav-item" key={tabName}>
            <button 
              className={`nav-link ${activeTab === tabName ? 'active border-bottom-0' : 'border-0'}`}
              onClick={() => setActiveTab(tabName)}
              style={{ 
                backgroundColor: activeTab === tabName ? '#ffffff' : 'transparent',
                cursor: 'pointer'
              }}
            >
              {/* Wrapping text in a span bypasses conflicting .nav-link CSS overrides */}
              <span 
                className="fw-bold" 
                style={{ color: activeTab === tabName ? '#0d6efd' : '#6c757d' }}
              >
                {tabName} {tabName !== 'Timeline' && `(${categories[tabName].length})`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* TAB CONTENT (DOCUMENT CARDS) */}
      <div className="tab-content">
        <div className="row g-3">
          {categories[activeTab].length > 0 ? categories[activeTab].map((doc, index) => (
            <div className="col-md-6" key={index}>
              <div className="card shadow-sm border-0 h-100">
                <div className="card-body d-flex flex-column">
                  <h6 className="fw-bold mb-1">{doc.documentTitle}</h6>
                  <span className="badge bg-light text-secondary border mb-3 align-self-start">{doc.documentType}</span>
                  
                  {doc.issuingInstitution && <p className="small mb-1"><strong>Issuer:</strong> {doc.issuingInstitution}</p>}
                  
                  {/* Specialized Fields */}
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
                      <button className="btn btn-outline-primary btn-sm w-100" onClick={() => openViewer(doc.documentUrl, doc.documentTitle)}>
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
            <div className="col-12 text-center py-5 text-muted fst-italic">
              No documents found for this category.
            </div>
          )}
        </div>
      </div>

      {/* Document Viewer Modal */}
      {previewDoc.isOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1050 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-dark border-0 shadow-lg">
              <div className="modal-header border-bottom border-secondary px-4 py-3">
                <h5 className="modal-title text-white">
                  <i className="bi bi-file-earmark-text text-primary me-2"></i>
                  {previewDoc.title}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeViewer}></button>
              </div>

              <div className="modal-body p-0 d-flex justify-content-center align-items-center" style={{ height: '75vh', backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
                {previewDoc.url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                  <img src={previewDoc.url} alt="Document Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <iframe 
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(previewDoc.url)}&embedded=true`}
                    title="PDF Viewer" width="100%" height="100%" style={{ border: 'none', backgroundColor: '#fff' }}
                  >
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-white">
                      <p className="mb-3">Unable to load Google Document Viewer.</p>
                      <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">
                        Open Document Externally
                      </a>
                    </div>
                  </iframe>
                )}
              </div>

              <div className="modal-footer border-top border-secondary px-4 py-3 bg-dark d-flex justify-content-between">
                <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-sm">
                  <i className="bi bi-box-arrow-up-right me-2"></i>Fallback: Open in New Tab
                </a>
                <button type="button" className="btn btn-primary" onClick={closeViewer}>
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default MyPortfolio;