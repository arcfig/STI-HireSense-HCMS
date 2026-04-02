const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'faculty', enum: ['faculty', 'hr'] },
  
  // NEW: Fields for future 2FA and profile management
  email: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  
  skillRatings: { type: Object, default: {} } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);