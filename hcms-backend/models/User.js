const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'faculty', enum: ['faculty', 'hr'] },
  
  // NEW: Store the 1-5 ratings for their skills
  skillRatings: { type: Object, default: {} } 
  
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);