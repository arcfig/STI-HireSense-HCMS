const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  
  role: { type: String, default: 'faculty', enum: ['faculty', 'admin', 'academic_head', 'program_head'] },
  
  email: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  department: { type: String, default: '' },
  skillRatings: { type: Object, default: {} },
  
  // Soft-delete flag
  isArchived: { type: Boolean, default: false },
  
  notifications: [{
    title: String,
    message: String,
    type: { type: String, enum: ['success', 'danger', 'info'] },
    isRead: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);