import React, { useState, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const MyPortfolio = () => {
  // 1. State Management
  const [facultyData, setFacultyData] = useState(null);
  const [userDocuments, setUserDocuments] = useState([]); // Array to hold all credentials
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState({ isOpen: false, url: '', title: '' });

  // 2. Fetch Data
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/faculty/approved');
        const data = await response.json();
        
        // Retrieve the logged-in user's identifier from local storage.
        // Replace 'username' or 'name' with the exact key established during your login process.
        const storedIdentity = localStorage.getItem('name') || localStorage.getItem('username');

        if (storedIdentity && data && data.length > 0) {
          // Filter the global document array against the logged-in user's identity
          const filteredDocs = data.filter(doc => {
            const docFullName = `${doc.firstName} ${doc.lastName}`.toLowerCase().replace(/\s+/g, '');
            const targetIdentity = storedIdentity.toLowerCase().replace(/\s+/g, '');
            
            // Evaluates matches based on either full name or explicitly saved username
            return docFullName === targetIdentity || doc.username === storedIdentity;
          });

          if (filteredDocs.length > 0) {
            setFacultyData(filteredDocs[0]); // Populates the top header with the most recent profile data
            setUserDocuments(filteredDocs);  // Populates the credentials array
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
  }, []);

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

  // --- Radar Chart Data ---
  const radarData = [
    { metric: 'Learning Env.', rating: 4.2, fullMark: 5 },
    { metric: 'Instructional Facilitation', rating: 4.8, fullMark: 5 },
    { metric: 'Assessment', rating: 3.9, fullMark: 5 },
    { metric: 'Professionalism', rating: 4.5, fullMark: 5 },
  ];

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
        
        {/* Left Column: Overall Rating (Radar Chart) */}
        <div className="col-md-6">
          <div className="card shadow-sm h-100 border-0">
            <div className="card-body text-center d-flex flex-column justify-content-center">
              <h6 className="text-muted fw-bold mb-0">OVERALL RATING</h6>
              <h2 className="display-4 fw-bold mb-0">4.35</h2>
              <div className="text-warning mb-2 fs-5">
                ★ ★ ★ ★ ☆
              </div>
              
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
              <div className="bg-light text-success fw-bold py-1 rounded small border border-success border-opacity-25 mt-2">
                Highly Proficient
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Verified Skills Summary */}
        <div className="col-md-6">
          <div className="card shadow-sm h-100 border-0">
            <div className="card-body">
              <h6 className="text-muted fw-bold mb-3">VERIFIED SKILL PROFICIENCIES</h6>
              <div className="d-flex flex-wrap gap-2">
                {facultyData.tags && facultyData.tags.length > 0 ? (
                  facultyData.tags.map((tag, index) => (
                    <span key={index} className="badge bg-light text-dark border px-3 py-2">
                      {tag}
                    </span>
                  ))
                ) : (
                  <p className="text-muted font-italic">No verified skills extracted yet.</p>
                )}
              </div>
              
              <h6 className="text-muted fw-bold mb-3 mt-4">ELIGIBLE COURSE COMPETENCIES</h6>
              <div className="d-flex flex-wrap gap-2">
                {facultyData.eligibleSubjects && facultyData.eligibleSubjects.length > 0 ? (
                  facultyData.eligibleSubjects.map((subject, index) => (
                    <span key={index} className="badge bg-primary text-white border px-3 py-2">
                      {subject}
                    </span>
                  ))
                ) : (
                  <p className="text-muted font-italic text-sm">No explicit course eligibilities found on certificates.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting Credentials Section */}
      <h5 className="text-secondary mb-3 mt-5"><i className="bi bi-file-earmark-text me-2"></i>Supporting Credentials</h5>
      <div className="row g-3">
        {/* Iterate over the filtered userDocuments array */}
        {userDocuments.map((doc, index) => (
          <div className="col-md-6" key={index}>
            <div className="card shadow-sm border-0 h-100">
              <div className="card-body">
                <h6 className="fw-bold mb-1">{doc.documentTitle}</h6>
                <span className="badge bg-light text-secondary border mb-3">{doc.documentType}</span>
                
                <p className="small mb-1"><strong>Issuer:</strong> {doc.issuingInstitution}</p>
                <p className="small mb-3"><strong>Issued:</strong> {doc.dateReceived}</p>

                <p className="small fw-bold text-muted mb-1">Associated Verified Skills</p>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  {doc.tags && doc.tags.map((tag, i) => (
                    <span key={i} className="badge bg-light text-secondary border" style={{fontSize: '0.75rem'}}>{tag}</span>
                  ))}
                </div>

                {doc.documentUrl ? (
                  <button 
                    className="btn btn-outline-primary btn-sm w-100"
                    onClick={() => openViewer(doc.documentUrl, doc.documentTitle)}
                  >
                    View Attached Document
                  </button>
                ) : (
                  <button className="btn btn-outline-secondary btn-sm w-100" disabled>
                    No File Attached
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Document Viewer Modal */}
      {previewDoc.isOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
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
                  <img 
                    src={previewDoc.url} 
                    alt="Document Preview" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                  />
                ) : (
                  <object 
                    data={previewDoc.url} 
                    type="application/pdf" 
                    width="100%" 
                    height="100%"
                    style={{ border: 'none' }}
                  >
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-white">
                      <p className="mb-3">Browser native PDF viewer is disabled or unsupported.</p>
                      <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">
                        Open Document Externally
                      </a>
                    </div>
                  </object>
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