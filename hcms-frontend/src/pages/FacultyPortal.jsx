import { useState } from 'react';

function FacultyPortal({ user }) {
  // NEW: Added documentTitle and documentType to our state
const [formData, setFormData] = useState({ 
  firstName: '', lastName: '', department: '', documentTitle: '', documentType: 'Seminar/Training Certificate',
  dateReceived: '', expirationDate: '', issuingInstitution: '' // NEW
});
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false); // Default to true for convenience

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleAutoFill = async () => {
    if (!file) return alert("Please choose a file first!");
    setIsExtracting(true);
    setMessage('AI is reading the document... Please wait.');
    const extractData = new FormData();
    extractData.append('document', file);

    try {
      const response = await fetch('http://localhost:5000/api/faculty/extract', { method: 'POST', body: extractData });
      if (response.ok) {
        const aiData = await response.json();
        // Keep the title/type they typed, but auto-fill the extracted names/dept
        setFormData(prev => ({ 
        ...prev,
        firstName: aiData.firstName || '', 
        lastName: aiData.lastName || '', 
        department: aiData.department || '',
        documentTitle: aiData.documentTitle || prev.documentTitle,
        dateReceived: aiData.dateReceived || '',
        expirationDate: aiData.expirationDate || '',
        issuingInstitution: aiData.issuingInstitution || ''
      }));
        setMessage('Auto-fill complete! Please verify before submitting.');
      } else setMessage('Failed to extract data.');
    } catch (error) {
      setMessage('Server error during extraction.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Uploading to Cloudinary and generating tags... Please wait.');
    
    const submitData = new FormData();
    submitData.append('firstName', formData.firstName);
    submitData.append('lastName', formData.lastName);
    submitData.append('department', formData.department);
    // NEW: Send the title and type to the backend!
    submitData.append('documentTitle', formData.documentTitle);
    submitData.append('documentType', formData.documentType);
    submitData.append('uploaderRole', user?.role || 'faculty');
    submitData.append('dateReceived', formData.dateReceived);
    submitData.append('expirationDate', formData.expirationDate);
    submitData.append('issuingInstitution', formData.issuingInstitution);
    submitData.append('autoApprove', autoApprove);
    if (file) submitData.append('document', file);

    try {
      const response = await fetch('http://localhost:5000/api/faculty/add', { method: 'POST', body: submitData });
      if (response.ok) {
        setMessage('Success: Credential submitted to HR!');
        // Reset the form
        setFormData({ firstName: '', lastName: '', department: '', documentTitle: '', documentType: 'Seminar/Training Certificate' });
        setFile(null);
        document.getElementById('fileUpload').value = '';
      } else setMessage('Error saving to database.');
    } catch (error) {
      setMessage('Server error.');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold text-dark">Faculty Upload Portal</h2>
        <span className="text-muted">Welcome, <strong className="text-primary">{user?.name}</strong></span>
      </div>

      <div className="card ui-card p-4 mb-4 shadow-sm border-0 rounded-3">
        <h5 className="mb-4 fw-bold text-secondary">Submit New Credential</h5>
        {message && (<div className={`alert ${message.includes('Success') || message.includes('Auto-fill complete') ? 'alert-success' : 'alert-info'} border-0 shadow-sm`}>{message}</div>)}
        
        <form onSubmit={handleSubmit}>
          
          {/* NEW: Document Type Dropdown */}
          <div className="mb-3">
            <label className="form-label fw-semibold text-secondary">Document Type</label>
            <select className="form-select bg-light" name="documentType" value={formData.documentType} onChange={handleChange} required>
              <option value="Seminar/Training Certificate">Seminar/Training Certificate</option>
              <option value="Degree/Transcript">Degree/Transcript</option>
              <option value="Professional License">Professional License</option>
              <option value="Award/Recognition">Award/Recognition</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* NEW: Document Title Input */}
          <div className="mb-4">
            <label className="form-label fw-semibold text-secondary">Document Title</label>
            <input type="text" className="form-control bg-light" name="documentTitle" value={formData.documentTitle} onChange={handleChange} placeholder="e.g., AWS Certified Solutions Architect" required />
          </div>

          {/* FILE UPLOAD & AUTO-FILL BOX */}
          <div className="mb-4 p-3 bg-light rounded border">
            <label className="form-label fw-bold text-dark">Upload File & Auto-Extract Details</label>
            <div className="d-flex gap-2 mb-2">
              <input type="file" className="form-control" id="fileUpload" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" required />
              <button type="button" className="btn btn-primary px-4 shadow-sm" onClick={handleAutoFill} disabled={!file || isExtracting} style={{ whiteSpace: 'nowrap' }}>
                {isExtracting ? 'Reading...' : <><i className="bi bi-magic me-2"></i> Auto-Fill Details</>}
              </button>
            </div>
          </div>

          {/* AI VERIFICATION FIELDS */}
          <div className="mb-3">
         <label className="form-label fw-semibold text-secondary">Issuing Institution</label>
         <input type="text" className="form-control bg-light" name="issuingInstitution" value={formData.issuingInstitution} onChange={handleChange} placeholder="e.g., Coursera, Oracle, TESDA" required />
       </div>
       <div className="row">
         <div className="col-md-6 mb-4">
           <label className="form-label fw-semibold text-secondary">Date Received</label>
           <input type="date" className="form-control bg-light" name="dateReceived" value={formData.dateReceived} onChange={handleChange} required />
         </div>
         <div className="col-md-6 mb-4">
           <label className="form-label fw-semibold text-secondary">Expiration Date (Optional)</label>
           <input type="date" className="form-control bg-light" name="expirationDate" value={formData.expirationDate} onChange={handleChange} />
         </div>
       </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold text-secondary">First Name</label>
              <input type="text" className="form-control bg-light" name="firstName" value={formData.firstName} onChange={handleChange} required />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold text-secondary">Last Name</label>
              <input type="text" className="form-control bg-light" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label fw-semibold text-secondary">Department</label>
            <input type="text" className="form-control bg-light" name="department" value={formData.department} onChange={handleChange} required />
          </div>

          {/* NEW: Admin Only Auto-Approve Toggle */}
       {user?.role === 'hr' && (
         <div className="form-check mb-4 bg-light p-3 rounded border border-warning-subtle">
           <input 
             className="form-check-input ms-1 me-2 border-warning" 
             type="checkbox" 
             id="autoApproveCheck" 
             checked={autoApprove} 
             onChange={(e) => setAutoApprove(e.target.checked)} 
           />
            <label className="form-check-label text-dark fw-bold" htmlFor="autoApproveCheck">
              Automatic Validation: Approve & Publish Immediately
            </label>
           <div className="form-text ms-4 mt-1">
             Uncheck this to send the document to the Pending Dashboard for a secondary review.
           </div>
         </div>
       )}
          <button type="submit" className="btn btn-success px-5 py-2 fw-bold shadow-sm">Upload to HR</button>
        </form>
      </div>
    </div>
  );
}

export default FacultyPortal;