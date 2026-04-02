import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function MyPortfolio({ user, viewAll }) {
  const [approvedFaculty, setApprovedFaculty] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  // NEW: State for the In-App Document Viewer Modal
  const [previewDoc, setPreviewDoc] = useState(null);

useEffect(() => {
    const fetchData = async () => {
      try {
        // Grab the user's role to show the backend bouncer
        const currentRole = user?.role || 'faculty';

        const [docsRes, usersRes] = await Promise.all([
          fetch('http://localhost:5000/api/faculty/approved'),
          
          // ADDED HEADERS: Show our ID Badge to the protected route!
          fetch('http://localhost:5000/api/users', {
            headers: {
              'X-User-Role': currentRole
            }
          })
        ]);
        const docsData = await docsRes.json();
        const usersData = await usersRes.json();
        
        setApprovedFaculty(docsData);
        // Only set usersData if the bouncer let us in (it won't be an array if it's an error)
        if (Array.isArray(usersData)) {
          setAllUsers(usersData);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    setSelectedFolder(null);
  }, [searchTerm]);

  const filteredFaculty = approvedFaculty.filter((faculty) => {
    const fullName = `${faculty.firstName} ${faculty.lastName}`.toLowerCase();
    if (!viewAll) {
      const loggedInNameParts = user.name.toLowerCase().split(' ');
      const isOwner = loggedInNameParts.every(part => fullName.includes(part));
      if (!isOwner) return false;
    }
    const searchLower = searchTerm.toLowerCase();
    const dept = faculty.department.toLowerCase();
    const tags = faculty.tags.join(' ').toLowerCase();
    return fullName.includes(searchLower) || dept.includes(searchLower) || tags.includes(searchLower);
  });

  // Group folders and map the User's Skill Ratings to them
  const groupedFolders = filteredFaculty.reduce((acc, doc) => {
    const rawName = `${doc.firstName} ${doc.lastName}`;
    const folderKey = rawName.toUpperCase();

    // NEW: The Title Case Formatter
    const formattedName = rawName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    if (!acc[folderKey]) {
      // Find the matching user account to grab their 1-5 star ratings
      const matchedUser = allUsers.find(u => u.name.toLowerCase() === rawName.toLowerCase()) || {};
      const ratings = matchedUser.skillRatings || {};
      
      // Calculate overall average
      const ratingValues = Object.values(ratings);
      const avgRating = ratingValues.length > 0 ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) : 0;

      // Determine qualitative level
      let level = "No Data";
      if (avgRating >= 3.25) level = "Exceeds Expectations";
      else if (avgRating >= 2.50) level = "Meets Expectations";
      else if (avgRating >= 1.75) level = "Partially Meets";
      else if (avgRating > 0) level = "Does Not Meet";

      // Format data for the Recharts Bar Chart
      const chartData = Object.keys(ratings).map(skill => ({
        subject: skill,
        score: ratings[skill]
      }));

      acc[folderKey] = {
        name: formattedName, // FIXED: Use the beautifully formatted name here!
        department: doc.department,
        initials: `${doc.firstName.charAt(0)}${doc.lastName.charAt(0)}`.toUpperCase(),
        documents: [],
        ratingsData: chartData,
        overallRating: avgRating,
        overallLevel: level
      };
    }
    acc[folderKey].documents.push(doc);
    return acc;
  }, {});

  const folders = Object.values(groupedFolders);
  const activeProfile = viewAll && selectedFolder ? groupedFolders[selectedFolder.toUpperCase()] : folders[0];
  const displayDocuments = viewAll && selectedFolder ? groupedFolders[selectedFolder.toUpperCase()]?.documents || [] : filteredFaculty;

  // Chart Colors (STI Blue and Yellow vibes)
  const COLORS = ['#0033a0', '#0055ff', '#3377ff', '#6699ff', '#ffd700', '#ffaa00'];

  return (
    <div>
      {/* SEARCH HEADER */}
      <div className="d-flex justify-content-between align-items-end mb-4 bg-white p-4 rounded-3 shadow-sm border-0">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ color: '#0033a0' }}>
            {viewAll ? "STI Faculty Directory" : "My Performance Dashboard"}
          </h2>
          <span className="text-muted">
            {viewAll ? "Browse faculty credential folders and ratings." : "Your unified performance and credential view."}
          </span>
        </div>
        <div style={{ width: '350px' }}>
          <div className="input-group">
            <span className="input-group-text bg-primary text-white border-primary"><i className="bi bi-search"></i></span>
            <input type="text" className="form-control border-primary focus-ring" placeholder="Search skills or names..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      {viewAll && !selectedFolder ? (
        /* --- FOLDER DIRECTORY VIEW --- */
        <div className="row g-4">
          {folders.map((folder, index) => (
            <div className="col-md-4 col-lg-3" key={index}>
              <div 
                className="card shadow-sm border-0 rounded-4 h-100 text-center p-4 folder-card" 
                style={{ cursor: 'pointer', transition: 'transform 0.2s', backgroundColor: '#f8fafc' }}
                onClick={() => setSelectedFolder(folder.name)}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <i className="bi bi-folder-fill display-1 mb-2" style={{ color: '#ffd700' }}></i>
                <h5 className="fw-bold text-dark mb-1">{folder.name}</h5>
                <p className="text-muted small mb-3">{folder.department}</p>
                
                {/* Rating Preview on Folder */}
                {folder.overallRating > 0 ? (
                  <div className="mb-3 text-warning">
                    {[1, 2, 3, 4, 5].map(star => (
                      <i key={star} className={`bi bi-star${folder.overallRating >= star ? '-fill' : ''}`}></i>
                    ))}
                    <span className="d-block text-muted small fw-bold mt-1">{folder.overallLevel}</span>
                  </div>
                ) : (
                  <div className="mb-3 text-muted small fst-italic">No Rating Data</div>
                )}
                
                <span className="badge bg-primary rounded-pill px-3 py-2 shadow-sm">
                  {folder.documents.length} {folder.documents.length === 1 ? 'Credential' : 'Credentials'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (

        /* --- THE NEW PERFORMANCE DASHBOARD (Matches Professor's Layout) --- */
        <div>
          {viewAll && selectedFolder && (
            <button className="btn btn-outline-secondary mb-4 fw-bold shadow-sm" onClick={() => setSelectedFolder(null)}>
              <i className="bi bi-arrow-left me-2"></i> Back to Directory
            </button>
          )}

          {activeProfile && (
            <div className="card shadow-sm border-0 rounded-3 p-4 mb-5 bg-white border-top border-5" style={{ borderColor: '#0033a0' }}>
              
              {/* Header Info */}
              <div className="border-bottom pb-3 mb-4 d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="fw-bold mb-1" style={{ color: '#0033a0' }}>{activeProfile.name}</h3>
                  <h6 className="text-muted mb-0">Department: <strong>{activeProfile.department}</strong></h6>
                </div>
                <div className="text-end">
                  <span className="text-muted small d-block">Report Generated</span>
                  <strong>{new Date().toLocaleDateString()}</strong>
                </div>
              </div>

              {/* The "Overall Rating" Box */}
              <div className="row mb-4">
                <div className="col-md-4">
                  <div className="card border rounded-3 p-4 text-center h-100 bg-light">
                    <p className="fw-bold text-secondary text-uppercase small mb-2">Overall Rating</p>
                    <h1 className="display-4 fw-bold text-dark mb-0">{activeProfile.overallRating > 0 ? activeProfile.overallRating.toFixed(2) : "N/A"}</h1>
                    <div className="text-warning fs-4 mb-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <i key={star} className={`bi bi-star${activeProfile.overallRating >= star ? '-fill' : ''} mx-1`}></i>
                      ))}
                    </div>
                    <span className="badge bg-success bg-opacity-10 text-success border border-success-subtle py-2 px-3">
                      {activeProfile.overallLevel}
                    </span>
                  </div>
                </div>

                {/* The Bar Chart Box */}
                <div className="col-md-8">
                  <div className="card border rounded-3 p-4 h-100">
                    <p className="fw-bold text-secondary text-uppercase small mb-3">Verified Skill Proficiencies</p>
                    {activeProfile.ratingsData && activeProfile.ratingsData.length > 0 ? (
                      <div style={{ height: '200px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activeProfile.ratingsData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                            <XAxis dataKey="subject" tick={{fontSize: 12, fill: '#6c757d'}} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{fontSize: 12, fill: '#6c757d'}} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}} />
                            <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={50}>
                              {activeProfile.ratingsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="d-flex justify-content-center align-items-center h-100 text-muted fst-italic">
                        No proficiency ratings saved yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* THE CERTIFICATES GRID */}
          <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-file-earmark-text me-2"></i> Supporting Credentials</h5>
          <div className="row g-4">
            {displayDocuments.map((faculty) => (
              <div className="col-md-6 col-lg-4" key={faculty._id}>
                <div className="card h-100 p-4 shadow-sm border-0 rounded-3">
                  <div className="mb-3 border-bottom pb-3">
                    <h6 className="fw-bold text-dark lh-base mb-1">{faculty.documentTitle || 'Untitled'}</h6>
                    <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary-subtle">{faculty.documentType || 'Other'}</span>
                  </div>
                  <div className="mb-4 text-muted small">
                    {faculty.issuingInstitution && <div className="mb-1"><strong>Issuer:</strong> {faculty.issuingInstitution}</div>}
                    {faculty.dateReceived && <div className="mb-1"><strong>Issued:</strong> {new Date(faculty.dateReceived).toLocaleDateString()}</div>}
                  </div>
                  
                  {/* UPGRADED SECURITY & PREVIEW PROTOCOL */}
                  <div className="mt-auto pt-3 border-top">
                    {/* Logic: Unlocked if you are HR, OR if you are viewing your Personal Portfolio (!viewAll) */}
                    {(user?.role === 'hr' || !viewAll) ? (
                      faculty.documentUrl ? (
                        <button 
                          onClick={() => setPreviewDoc({ url: faculty.documentUrl, title: faculty.documentTitle })} 
                          className="btn btn-outline-primary w-100 fw-bold shadow-sm"
                        >
                          <i className="bi bi-eye-fill me-2"></i> View Certificate
                        </button>
                      ) : (
                        <button className="btn btn-outline-secondary w-100 fw-bold" disabled>No File Attached</button>
                      )
                    ) : (
                      <button className="btn bg-light text-muted border w-100 fw-bold" disabled>
                        <i className="bi bi-lock-fill me-2"></i> HR Access Only
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* IN-APP DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 1050 }} tabIndex="-1" onClick={() => setPreviewDoc(null)}>
          <div className="modal-dialog modal-xl modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg bg-dark">
              
              {/* Modal Header */}
              <div className="modal-header border-bottom border-secondary px-4 py-3">
                <h5 className="modal-title fw-bold text-white">
                  <i className="bi bi-file-earmark-richtext-fill text-primary me-3"></i>
                  {previewDoc.title || 'Document Preview'}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setPreviewDoc(null)} aria-label="Close"></button>
              </div>
              
              {/* Modal Body (The Iframe Viewer) */}
              <div className="modal-body p-0 bg-light d-flex justify-content-center align-items-center" style={{ height: '75vh' }}>
                <iframe 
                  src={previewDoc.url} 
                  title="Document Preview" 
                  width="100%" 
                  height="100%" 
                  style={{ border: 'none' }}
                  allowFullScreen
                ></iframe>
              </div>
              
              {/* Modal Footer */}
              <div className="modal-footer border-top border-secondary py-2 px-4 d-flex justify-content-between">
                <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-light">
                  <i className="bi bi-box-arrow-up-right me-2"></i> Fallback: Open in New Tab
                </a>
                <button type="button" className="btn btn-primary px-4 fw-bold" onClick={() => setPreviewDoc(null)}>
                  Close Viewer
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPortfolio;