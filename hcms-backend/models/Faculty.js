const mongoose = require('mongoose');
//fields from a certificate
const facultySchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  department: { type: String, required: true },
  documentTitle: { type: String, required: true }, 
  documentType: { type: String, required: true },  
  
  dateReceived: { type: Date },
  expirationDate: { type: Date },
  issuingInstitution: { type: String },

  tags: { type: [String], default: [] },

  eligibleSubjects: [{ 
    type: String, 
    ref: 'Subject' 
  }],
  documentUrl: { type: String, default: '' },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] }
}, { timestamps: true });

module.exports = mongoose.model('Faculty', facultySchema);