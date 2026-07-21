const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { notify } = require('../services/notify');
const permissions = require('../config/permissions');
const { canManage, ROLE_RANK } = require('../config/roles');

const router = express.Router();

const INVITE_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

router.post('/users/invite', verifyToken, requirePermission(permissions.INVITE_USERS), async (req, res) => {
  try {
    const { name, email, role, grantedPermissions } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required.' });
    }

    if (!(role in ROLE_RANK)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    if (!canManage(req.user.role, role)) {
      return res.status(403).json({ error: 'You cannot invite someone at or above your own role.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const safePermissions = req.user.role === 'founder'
      ? (grantedPermissions || [])
      : (grantedPermissions || []).filter((p) => req.user.permissions.includes(p));

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitedUser = await User.create({
      name,
      email: email.toLowerCase().trim(),
      role,
      permissions: safePermissions,
      invitedBy: req.user._id,
      status: 'pending_invite',
      inviteToken: hashedToken,
      inviteTokenExpires: new Date(Date.now() + INVITE_TOKEN_EXPIRY_MS),
    });

    const inviteUrl = `${process.env.FRONTEND_URL}/admin/accept-invite?token=${rawToken}&email=${encodeURIComponent(invitedUser.email)}`;

    await notify({
      recipient: { email: invitedUser.email },
      channels: ['email'],
      subject: "You've been invited to TGO DevStudio",
      html: `<p>Hi ${name},</p><p>${req.user.name} has invited you to join TGO DevStudio as a <strong>${role.replace('_', ' ')}</strong>.</p><p>This invite link expires in 7 days:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
    });

    await logAction({
      action: 'invite_sent',
      actor: req.user,
      target: invitedUser,
      details: `Invited as ${role}.`,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, id: invitedUser._id });
  } catch (err) {
    console.error('Invite creation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/users', verifyToken, requirePermission(permissions.APPROVE_ACCESS), async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash -totpSecret -inviteToken -passwordResetToken')
      .populate('invitedBy', 'name email role')
      .sort({ createdAt: -1 });

    const visibleUsers = req.user.role === 'founder'
      ? users
      : users.filter((u) => canManage(req.user.role, u.role) || u._id.equals(req.user._id));

    res.status(200).json(visibleUsers);
  } catch (err) {
    console.error('Failed to list users:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Shared handler for block / unblock / ban / unban
async function changeStatus(req, res, newStatus, actionName) {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (target._id.equals(req.user._id)) {
      return res.status(400).json({ error: 'You cannot perform this action on your own account.' });
    }

    if (target.founderLock) {
      return res.status(403).json({
        error: 'This account is locked by the founder and cannot be modified.',
      });
    }

    if (!canManage(req.user.role, target.role)) {
      return res.status(403).json({ error: 'You do not have authority over this account.' });
    }

    target.status = newStatus;
    await target.save();

    await logAction({
      action: actionName,
      actor: req.user,
      target,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, status: target.status });
  } catch (err) {
    console.error(`${actionName} failed:`, err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

router.post('/users/:id/block', verifyToken, requirePermission(permissions.BLOCK_USERS), (req, res) =>
  changeStatus(req, res, 'blocked', 'user_blocked'));

router.post('/users/:id/unblock', verifyToken, requirePermission(permissions.BLOCK_USERS), (req, res) =>
  changeStatus(req, res, 'active', 'user_unblocked'));

router.post('/users/:id/ban', verifyToken, requirePermission(permissions.BLOCK_USERS), (req, res) =>
  changeStatus(req, res, 'banned', 'user_banned'));

router.post('/users/:id/unban', verifyToken, requirePermission(permissions.BLOCK_USERS), (req, res) =>
  changeStatus(req, res, 'active', 'user_unbanned'));

// Founder-only immutable lock/unlock — nothing else in the system can override this
router.post('/users/:id/founder-lock', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'founder') {
      return res.status(403).json({ error: 'Only the founder can set this lock.' });
    }

    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { locked, reason } = req.body;
    target.founderLock = !!locked;
    target.founderLockReason = locked ? (reason || null) : null;
    await target.save();

    await logAction({
      action: locked ? 'founder_lock_applied' : 'founder_lock_removed',
      actor: req.user,
      target,
      details: reason,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, founderLock: target.founderLock });
  } catch (err) {
    console.error('Founder lock action failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
