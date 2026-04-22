const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  department: { type: String, default: '' },
  documentTitle: { type: String, required: true },
  
  // Expanded enum to accept the new document categories
  documentType: { 
    type: String, 
    required: true,
    enum: [
      '201 File', 
      'Certificate', 
      'Faculty Evaluation', 
      'Contract', 
      'Letter of Intent', 
      'Non-Renewal Contract'
    ]
  },
  
  issuingInstitution: { type: String, default: '' },
  dateReceived: { type: String, default: '' },
  expirationDate: { type: String, default: '' },
  documentUrl: { type: String, required: true },
  tags: { type: Array, default: [] },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  
  // AI Extraction Data Points
  evaluationRating: { type: Number, default: null }, 
  termActive: { type: String, default: '' },         
  remarks: { type: String, default: '' },            
  
  eligibleSubjects: { type: Array, default: [] },

  // New Dynamic Form Fields
  academicYear: { type: String, default: '' },
  term: { type: String, default: '' },
  contractStart: { type: String, default: '' },
  contractEnd: { type: String, default: '' },
  intent: { type: String, default: '' },
  offenseType: { type: String, default: '' }
  
}, { timestamps: true });

module.exports = mongoose.model('Faculty', facultySchema);