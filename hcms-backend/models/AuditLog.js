const mongoose = require('mongoose');

const ACTION_TYPES = ['LOGIN', 'READ', 'WRITE', 'DELETE', 'EXPORT'];

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },
    // Denormalized snapshot fields preserve forensic attribution even if the User is later hard-deleted.
    username: {
      type: String,
      default: '',
      immutable: true,
    },
    userRole: {
      type: String,
      default: '',
      immutable: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: ACTION_TYPES,
      immutable: true,
      index: true,
    },
    targetResource: {
      type: String,
      required: true,
      immutable: true,
      index: true,
    },
    httpMethod: {
      type: String,
      required: true,
      immutable: true,
    },
    statusCode: {
      type: Number,
      immutable: true,
    },
    ipAddress: {
      type: String,
      required: true,
      immutable: true,
    },
    userAgent: {
      type: String,
      default: '',
      maxlength: 256,
      immutable: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    versionKey: false,
    collection: 'audit_logs',
  }
);

// Compound indexes optimized for breach forensics and compliance queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ userRole: 1, timestamp: -1 });
auditLogSchema.index({ actionType: 1, timestamp: -1 });
auditLogSchema.index({ targetResource: 1, timestamp: -1 });

// Enforce append-only immutability on audit records
const blockMutation = function () {
  throw new Error('AuditLog records are append-only and cannot be modified.');
};

auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('replaceOne', blockMutation);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
module.exports.ACTION_TYPES = ACTION_TYPES;

