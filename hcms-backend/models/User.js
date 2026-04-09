const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  
  // UPDATED: Added 'academic_head' and 'program_head' to the allowed roles
  role: { 
    type: String, 
    default: 'faculty', 
    enum: ['faculty', 'hr', 'admin', 'academic_head', 'program_head'] 
  },
  
  // NEW: Fields for future 2FA and profile management
  email: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  department: { type: String, default: '' },
  
  skillRatings: { type: Object, default: {} } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);