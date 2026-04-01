import { useState, useEffect } from 'react';

function HRDashboard({ user }) {
  const [pendingFaculty, setPendingFaculty] = useState([]);
  const [message, setMessage] = useState('');
  
  // NEW: State to track if we are currently editing a document
  const [editingDoc, setEditingDoc] = useState(null); 
  const [editFormData, setEditFormData] = useState({});

  const fetchPending = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/faculty/pending');
      const data = await response.json();
      setPendingFaculty(data);
    } catch (error) {
      console.error("Error fetching pending data:", error);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const response = await fetch(`http://localhost:5000/api/faculty/status/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setMessage(`Credential successfully ${newStatus}!`);
        fetchPending(); 
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to update status.');
      }
    } catch (error) {
      setMessage('Server error.');
    }
  };

  // --- NEW: EDIT FUNCTIONS ---
  // 1. When they click the Edit button, populate the form
  const startEditing = (faculty) => {
    setEditingDoc(faculty._id);
    setEditFormData({
      firstName: faculty.firstName,
      lastName: faculty.lastName,
      department: faculty.department,
      documentTitle: faculty.documentTitle || '',
      documentType: faculty.documentType || 'Seminar/Training Certificate',
      tags: faculty.tags.join(', ') // Convert array to string for easy editing
    });
  };

  // 2. Handle typing in the edit form
  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  // 3. Submit the changes to the backend
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:5000/api/faculty/edit/${editingDoc}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });

      if (response.ok) {
        setMessage('Document details updated successfully!');
        setEditingDoc(null); // Close the edit form
        fetchPending(); // Refresh the table to show new data
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save edits.');
      }
    } catch (error) {
      setMessage('Server error during edit.');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1">HR Management Dashboard</h2>
          <span className="text-muted">Review, edit, and verify pending faculty credentials.</span>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.includes('successfully') ? 'alert-success' : 'alert-danger'} py-2 shadow-sm border-0`}>
          <i className="bi bi-info-circle-fill me-2"></i> {message}
        </div>
      )}

      {/* --- CONDITIONAL UI: Show Edit Form OR the Table --- */}
      {editingDoc ? (
        
        /* THE EDIT FORM */
        <div className="card shadow-sm border-0 rounded-3 p-4 bg-white">
          <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
            <h5 className="fw-bold text-primary mb-0"><i className="bi bi-pencil-square me-2"></i> Edit Credential Details</h5>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingDoc(null)}>Cancel</button>
          </div>
          
          <form onSubmit={handleEditSubmit}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">First Name</label>
                <input type="text" className="form-control bg-light" name="firstName" value={editFormData.firstName} onChange={handleEditChange} required />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Last Name</label>
                <input type="text" className="form-control bg-light" name="lastName" value={editFormData.lastName} onChange={handleEditChange} required />
              </div>
            </div>

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Department</label>
                <input type="text" className="form-control bg-light" name="department" value={editFormData.department} onChange={handleEditChange} required />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Document Type</label>
                <select className="form-select bg-light" name="documentType" value={editFormData.documentType} onChange={handleEditChange} required>
                  <option value="Seminar/Training Certificate">Seminar/Training Certificate</option>
                  <option value="Degree/Transcript">Degree/Transcript</option>
                  <option value="Professional License">Professional License</option>
                  <option value="Award/Recognition">Award/Recognition</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold text-secondary">Document Title</label>
              <input type="text" className="form-control bg-light border-primary" name="documentTitle" value={editFormData.documentTitle} onChange={handleEditChange} required />
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold text-secondary">AI Skill Tags (Comma Separated)</label>
              <input type="text" className="form-control bg-light" name="tags" value={editFormData.tags} onChange={handleEditChange} />
              <small className="text-muted">Separate multiple skills with a comma (e.g., Java, Python, React)</small>
            </div>

            <button type="submit" className="btn btn-primary fw-bold px-5 py-2 shadow-sm">Save Changes</button>
          </form>
        </div>

      ) : (

        /* THE DATA TABLE (Hidden when editing) */
        <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-secondary">
                <tr>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Faculty Member</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Document Submitted</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">AI Extracted Skills</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingFaculty.map((faculty) => (
                  <tr key={faculty._id}>
                    <td className="px-4 py-3">
                      <p className="fw-bold text-dark mb-0">{faculty.firstName} {faculty.lastName}</p>
                      <small className="text-muted">{faculty.department}</small>
                    </td>
                    <td className="px-4 py-3">
                      <p className="fw-bold text-primary mb-0">{faculty.documentTitle || 'Untitled'}</p>
                      <span className="badge bg-light text-secondary border mt-1">{faculty.documentType || 'Other'}</span>
                      {faculty.documentUrl && (
                        <a href={faculty.documentUrl} target="_blank" rel="noopener noreferrer" className="d-block mt-2 text-decoration-none small">
                          <i className="bi bi-link-45deg"></i> View File
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="d-flex flex-wrap gap-1">
                        {faculty.tags.map((tag, index) => (
                          <span key={index} className="badge bg-light text-dark border">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {/* NEW: Added the Edit Button inside the actions column */}
                      <div className="d-flex justify-content-center gap-2 mb-2">
                        <button onClick={() => startEditing(faculty)} className="btn btn-sm btn-outline-primary fw-bold px-3 w-100">
                          <i className="bi bi-pencil-square me-1"></i> Edit Data
                        </button>
                      </div>
                      <div className="d-flex justify-content-center gap-2">
                        <button onClick={() => handleUpdateStatus(faculty._id, 'approved')} className="btn btn-sm btn-success fw-bold px-3 shadow-sm w-50">
                          <i className="bi bi-check-lg"></i>
                        </button>
                        <button onClick={() => handleUpdateStatus(faculty._id, 'rejected')} className="btn btn-sm btn-outline-danger fw-bold px-3 w-50">
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingFaculty.length === 0 && (
            <div className="text-center py-5">
              <i className="bi bi-inbox fs-1 text-muted opacity-50 mb-3 d-block"></i>
              <h5 className="text-muted">No pending approvals.</h5>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HRDashboard;