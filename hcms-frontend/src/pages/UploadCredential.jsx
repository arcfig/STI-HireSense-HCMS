import React, { useState } from 'react';

const UploadCredential = () => {
  // Retrieve the role from local storage to enforce RBAC
  const userRole = localStorage.getItem('role') || 'faculty';

  // 1. State Management
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedTags, setExtractedTags] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    documentType: 'Seminar/Training Certificate',
    documentTitle: '',
    issuingInstitution: '',
    dateReceived: '',
    expirationDate: '',
    firstName: '',
    lastName: '',
    department: '',
    // Strict RBAC: Only defaults to true if the user is an admin
    autoValidate: userRole === 'admin'
  });

  // 2. Input Handlers
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setStatusMessage({ type: '', text: '' }); 
    }
  };

  // 3. AI Extraction Logic (Auto-Fill)
  const handleAutoFill = async () => {
    if (!selectedFile) return;

    setIsExtracting(true);
    setStatusMessage({ type: 'info', text: 'Extracting data with AI...' });

    const extractPayload = new FormData();
    extractPayload.append('document', selectedFile);

    try {
      const response = await fetch('http://localhost:5000/api/faculty/extract', {
        method: 'POST',
        body: extractPayload
      });

      const data = await response.json();

      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          documentTitle: data.documentTitle || prev.documentTitle,
          issuingInstitution: data.issuingInstitution || prev.issuingInstitution,
          dateReceived: data.dateReceived || prev.dateReceived,
          
          // --- FIX: Mapped the expiration date to the frontend state ---
          expirationDate: data.expirationDate || prev.expirationDate,
          
          firstName: data.firstName || prev.firstName,
          lastName: data.lastName || prev.lastName,
          department: data.department || prev.department
        }));
        
        setExtractedTags(data.tags || "");
        setStatusMessage({ type: 'success', text: 'Data extracted successfully. Please review before submitting.' });
      } else {
        setStatusMessage({ type: 'danger', text: data.message || 'Failed to extract data.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'danger', text: 'Network error during extraction.' });
    } finally {
      setIsExtracting(false);
    }
  };

  // 4. Final Submission Logic
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setStatusMessage({ type: 'danger', text: 'A document file is required.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ type: 'info', text: 'Uploading document and saving record...' });

    const finalPayload = new FormData();
    
    Object.keys(formData).forEach(key => {
      finalPayload.append(key, formData[key]);
    });

    finalPayload.append('document', selectedFile);
    
    // Append the user role to enforce backend verification
    finalPayload.append('uploaderRole', userRole);
    
    if (extractedTags) {
        const tagsString = Array.isArray(extractedTags) ? extractedTags.join(', ') : extractedTags;
        finalPayload.append('tags', tagsString);
    }

    try {
      const response = await fetch('http://localhost:5000/api/faculty/add', {
        method: 'POST',
        body: finalPayload
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: 'Credential successfully saved to the database.' });
        // Reset form for next upload
        setFormData(prev => ({ ...prev, documentTitle: '', documentType: 'Seminar/Training Certificate', issuingInstitution: '', dateReceived: '', expirationDate: '' }));
        setSelectedFile(null);
      } else {
        setStatusMessage({ type: 'danger', text: data.message || 'Error saving to database.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'danger', text: 'Network error during submission.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Component Render
  return (
    <div className="container mt-4">
      <h3 className="mb-4">Submit New Credential</h3>

      {statusMessage.text && (
        <div className={`alert alert-${statusMessage.type}`} role="alert">
          {statusMessage.text}
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            
            <div className="mb-3">
              <label className="form-label text-muted">Document Type</label>
              <select className="form-select" name="documentType" value={formData.documentType} onChange={handleInputChange}>
                <option value="Seminar/Training Certificate">Seminar/Training Certificate</option>
                <option value="Academic Degree">Academic Degree</option>
                <option value="Professional License">Professional License</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label text-muted">Document Title</label>
              <input type="text" className="form-control" name="documentTitle" placeholder="e.g., AWS Certified Solutions Architect" value={formData.documentTitle} onChange={handleInputChange} required />
            </div>

            <div className="card border mb-3">
              <div className="card-body bg-light py-2">
                <label className="form-label fw-bold">Upload File & Auto-Extract Details</label>
                <div className="input-group">
                  <input type="file" className="form-control" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={handleAutoFill} 
                    disabled={!selectedFile || isExtracting}
                  >
                    {isExtracting ? 'Extracting...' : 'Auto-Fill Details'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-muted">Issuing Institution</label>
              <input type="text" className="form-control" name="issuingInstitution" placeholder="e.g., Coursera, Oracle, TESDA" value={formData.issuingInstitution} onChange={handleInputChange} required />
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label text-muted">Date Received</label>
                <input type="date" className="form-control" name="dateReceived" value={formData.dateReceived} onChange={handleInputChange} required />
              </div>
              <div className="col-md-6">
                <label className="form-label text-muted">Expiration Date (Optional)</label>
                <input type="date" className="form-control" name="expirationDate" value={formData.expirationDate} onChange={handleInputChange} />
              </div>
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label text-muted">First Name</label>
                <input type="text" className="form-control" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
              </div>
              <div className="col-md-6">
                <label className="form-label text-muted">Last Name</label>
                <input type="text" className="form-control" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label text-muted">Department</label>
              <input type="text" className="form-control" name="department" value={formData.department} onChange={handleInputChange} required />
            </div>

            {/* STRICT RBAC: Render Checkbox ONLY if role is 'admin' */}
            {userRole === 'admin' && (
              <div className="card border-warning mb-4">
                <div className="card-body py-3">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="autoValidate" name="autoValidate" checked={formData.autoValidate} onChange={handleInputChange} />
                    <label className="form-check-label fw-bold" htmlFor="autoValidate">
                      Automatic Validation: Approve & Publish Immediately
                    </label>
                    <div className="form-text mt-1">
                      Uncheck this to send the document to the Pending Dashboard for a secondary review.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-success px-4" disabled={isSubmitting}>
              {isSubmitting ? 'Uploading...' : 'Upload to HR'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
};

export default UploadCredential;