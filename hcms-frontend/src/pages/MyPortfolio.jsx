import { useState, useEffect } from 'react';

function MyPortfolio({ user, viewAll }) {
  const [approvedFaculty, setApprovedFaculty] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // NEW: State to track which folder is currently open in the Global Directory
  const [selectedFolder, setSelectedFolder] = useState(null); 

  useEffect(() => {
    const fetchApproved = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/faculty/approved');
        const data = await response.json();
        setApprovedFaculty(data);
      } catch (error) {
        console.error('Error fetching portfolio:', error);
      }
    };
    fetchApproved();
  }, []);

  // Reset folder view if they type in the search bar so they don't get trapped
  useEffect(() => {
    setSelectedFolder(null);
  }, [searchTerm]);

  // 1. Filter based on Search and Ownership
  const filteredFaculty = approvedFaculty.filter((faculty) => {
    const fullName = `${faculty.firstName} ${faculty.lastName}`.toLowerCase();
    
    // Security: Personal view only shows logged-in user's cards
    if (!viewAll) {
      const loggedInNameParts = user.name.toLowerCase().split(' '); 
      const isOwner = loggedInNameParts.every(part => fullName.includes(part));
      if (!isOwner) return false; 
    }

    const searchLower = searchTerm.toLowerCase();
    const dept = faculty.department.toLowerCase();
    const docTitle = (faculty.documentTitle || '').toLowerCase();
    const docType = (faculty.documentType || '').toLowerCase();
    const tags = faculty.tags.join(' ').toLowerCase(); 

    return fullName.includes(searchLower) || dept.includes(searchLower) || docTitle.includes(searchLower) || docType.includes(searchLower) || tags.includes(searchLower);
  });

  // 2. NEW: Group the filtered results into Folders by Name
// 2. FIXED: Group the filtered results into Folders by Name (Case-Insensitive)
  const groupedFolders = filteredFaculty.reduce((acc, doc) => {
    // Standardize the name to uppercase so "HENRY" and "Henry" merge together
    const rawName = `${doc.firstName} ${doc.lastName}`;
    const folderKey = rawName.toUpperCase();

    if (!acc[folderKey]) {
      acc[folderKey] = {
        name: rawName, // Keep the original casing for the folder title display
        department: doc.department, // Just grab the department from their first document
        initials: `${doc.firstName.charAt(0)}${doc.lastName.charAt(0)}`.toUpperCase(),
        documents: []
      };
    }
    
    // Add the document to the merged folder
    acc[folderKey].documents.push(doc);
    return acc;
  }, {});

  const folders = Object.values(groupedFolders);

  // 3. Determine what to render (Folders vs. Individual Cards)
  // If it's a personal view, OR if a specific folder is clicked, show the cards.
  const displayDocuments = selectedFolder 
    ? groupedFolders[selectedFolder]?.documents || [] 
    : filteredFaculty;

  return (
    <div>
      {/* HEADER & SEARCH BAR */}
      <div className="d-flex justify-content-between align-items-end mb-4 bg-white p-4 rounded-3 shadow-sm border-0">
        <div>
          <h2 className="fw-bold text-dark mb-1" style={{ color: '#0033a0' }}>
            {viewAll ? "STI Faculty Directory" : "My Personal Portfolio"}
          </h2>
          <span className="text-muted">
            {viewAll ? "Browse faculty credential folders." : "Your verified credentials and AI skill tags."}
          </span>
        </div>
        
        <div style={{ width: '350px' }}>
          <div className="input-group">
            <span className="input-group-text bg-primary text-white border-primary"><i className="bi bi-search"></i></span>
            <input type="text" className="form-control border-primary focus-ring" placeholder="Search skills, names, or titles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      {/* DYNAMIC VIEW ROUTER */}
      {viewAll && !selectedFolder ? (
        
        /* --- FOLDER VIEW (HR Directory Landing Page) --- */
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
                <i className="bi bi-folder-fill display-1 mb-2" style={{ color: '#ffd700' }}></i> {/* STI Yellow Folder */}
                <h5 className="fw-bold text-dark mb-1">{folder.name}</h5>
                <p className="text-muted small mb-3">{folder.department}</p>
                <span className="badge bg-primary rounded-pill px-3 py-2 shadow-sm">
                  {folder.documents.length} {folder.documents.length === 1 ? 'Credential' : 'Credentials'}
                </span>
              </div>
            </div>
          ))}
          {folders.length === 0 && (
            <div className="col-12 text-center text-muted py-5 mt-5">
              <i className="bi bi-folder-x fs-1 d-block mb-3 opacity-50"></i>
              <h4>No faculty folders found.</h4>
            </div>
          )}
        </div>

      ) : (

        /* --- DOCUMENT GRID VIEW (Inside a Folder OR Personal Portfolio) --- */
        <div>
          {/* Back Button for Directory View */}
          {viewAll && selectedFolder && (
            <button className="btn btn-outline-secondary mb-4 fw-bold shadow-sm" onClick={() => setSelectedFolder(null)}>
              <i className="bi bi-arrow-left me-2"></i> Back to Folders
            </button>
          )}

          <div className="row g-4">
            {displayDocuments.map((faculty) => (
              <div className="col-md-6 col-lg-4" key={faculty._id}>
                <div className="card ui-card h-100 p-4 shadow-sm border-0 rounded-3 border-top border-4 border-primary">
                  
                  {/* Document Title & Type */}
                  <div className="mb-3 border-bottom pb-3">
                    <h6 className="fw-bold text-dark lh-base mb-1">
                      <i className="bi bi-file-earmark-check-fill text-primary me-2"></i>
                      {faculty.documentTitle || 'Untitled Credential'}
                    </h6>
                    <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary-subtle">
                      {faculty.documentType || 'Uncategorized'}
                    </span>
                  </div>

                  {/* NEW: STI Required Dates & Institution */}
                  <div className="mb-3 text-muted small">
                    {faculty.issuingInstitution && (
                      <div className="mb-1"><i className="bi bi-building me-2"></i><strong>Issuer:</strong> {faculty.issuingInstitution}</div>
                    )}
                    {faculty.dateReceived && (
                      <div className="mb-1"><i className="bi bi-calendar-event me-2"></i><strong>Issued:</strong> {new Date(faculty.dateReceived).toLocaleDateString()}</div>
                    )}
                    {faculty.expirationDate && (
                      <div><i className="bi bi-calendar-x me-2"></i><strong>Expires:</strong> {new Date(faculty.expirationDate).toLocaleDateString()}</div>
                    )}
                  </div>

                  {/* AI Tags */}
                  <div className="mb-4 flex-grow-1">
                    <p className="fw-bold text-secondary mb-2 mt-3" style={{ fontSize: '0.80rem', textTransform: 'uppercase' }}>Verified AI Skill Tags</p>
                    <div className="d-flex flex-wrap gap-2">
                      {faculty.tags.map((tag, index) => {
                        const isMatch = searchTerm && tag.toLowerCase().includes(searchTerm.toLowerCase());
                        return <span key={index} className={`badge border px-2 py-1 ${isMatch ? 'bg-warning text-dark border-warning' : 'bg-light text-primary border-primary-subtle'}`}>{tag}</span>;
                      })}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-auto pt-3 border-top">
                    {faculty.documentUrl ? (
                      <a href={faculty.documentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary w-100 fw-bold shadow-sm">
                        <i className="bi bi-box-arrow-up-right me-2"></i> View Certificate
                      </a>
                    ) : (
                      <button className="btn btn-outline-secondary w-100 fw-bold" disabled>No Document Available</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPortfolio;