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
  
  // WebAuthn / Passkey Fields
  webAuthnCredentials: [{
    credentialID: { type: String, required: true },
    credentialPublicKey: { type: Buffer, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
    deviceName: { type: String, default: 'Passkey Device' },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: null }
  }],
  currentChallenge: { type: String, default: null },

  // Email 6-Digit OTP Two-Factor Authentication (2FA) Fields
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorCodeHash: { type: String, default: null },
  twoFactorCodeExpires: { type: Date, default: null },
  twoFactorPurpose: { type: String, default: null },

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