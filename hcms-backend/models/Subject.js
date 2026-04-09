const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  courseCode: { type: String, required: true, unique: true },
  subjectName: { type: String, required: true },
  
  // These lines link the Subject to its Program and Department
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }
});

module.exports = mongoose.model('Subject', subjectSchema);