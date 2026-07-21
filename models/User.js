const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String },

  role: {
    type: String,
    enum: ['founder', 'super_admin', 'admin', 'team_lead', 'collaborator'],
    required: true,
  },

  // A role change proposed by a manager, awaiting the target's own confirmation.
  pendingRole: { type: String, enum: ['founder', 'super_admin', 'admin', 'team_lead', 'collaborator'], default: null },
  pendingRoleRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pendingRoleRequestedAt: { type: Date },

  permissions: {
    type: [String],
    default: [],
  },

  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  lineagePath: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
  },

  managementScope: {
    depth: { type: Number, default: null },
  },

  additionalManaged: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    includeSubtree: { type: Boolean, default: true },
  }],

  deniedManaged: {
    type: [mongoose.Schema.Types.ObjectId],
    default: [],
  },

  status: {
    type: String,
    enum: ['pending_invite', 'pending_verification', 'active', 'blocked'],
    default: 'pending_invite',
  },

  preBlockStatus: { type: String },

  founderLock: { type: Boolean, default: false },
  founderLockReason: { type: String, default: null },

  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },

  inviteToken: { type: String },
  inviteTokenExpires: { type: Date },

  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },

  totpSecret: { type: String },
  totpEnabled: { type: Boolean, default: false },

  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },

  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
