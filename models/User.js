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

  // Granular, grantable permissions — the real access-control layer.
  // Role above is a display/grouping label; this array is what's actually checked.
  permissions: {
    type: [String],
    default: [],
  },

  // Invite chain — who brought this person in, for full traceability
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  status: {
    type: String,
    enum: ['pending_invite', 'pending_verification', 'active', 'blocked', 'banned'],
    default: 'pending_invite',
  },

  // Founder-only immutable override — nothing below the founder can change this
  founderLock: { type: Boolean, default: false },
  founderLockReason: { type: String, default: null },

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },

  // Invite acceptance (pending accounts use this to set their own password)
  inviteToken: { type: String },
  inviteTokenExpires: { type: Date },

  // Password reset
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },

  // TOTP two-factor authentication
  totpSecret: { type: String },
  totpEnabled: { type: Boolean, default: false },

  // Brute-force protection
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },

  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
