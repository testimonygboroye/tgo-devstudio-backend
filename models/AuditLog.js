const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  // e.g. 'login_success', 'login_failed', 'invite_sent', 'access_approved',
  // 'user_blocked', 'user_unblocked', 'founder_override', 'permission_granted'

  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String },

  target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetEmail: { type: String },

  details: { type: String },
  ipAddress: { type: String },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
