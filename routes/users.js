const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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
    if (req.user.role !== 'founder' && ROLE_RANK[req.user.role] >= ROLE_RANK[role]) {
      return res.status(403).json({ error: 'You cannot invite someone at or above your own role.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const requested = grantedPermissions || [];
    const safePermissions = requested.filter((p) => {
      if (req.user.role === 'founder') return true;
      const isFounderOnly = permissions.FOUNDER_ONLY.includes(p);
      return req.user.permissions.includes(p) && !isFounderOnly;
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitedUser = await User.create({
      name,
      email: email.toLowerCase().trim(),
      role,
      permissions: safePermissions,
      invitedBy: req.user._id,
      lineagePath: [...(req.user.lineagePath || []), req.user._id],
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
      : users.filter((u) => u._id.equals(req.user._id) || canManage(req.user, u));

    res.status(200).json(visibleUsers);
  } catch (err) {
    console.error('Failed to list users:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/users/:id/block', verifyToken, requirePermission(permissions.BLOCK_USERS), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.founderLock) return res.status(403).json({ error: 'This account is locked by the founder and cannot be modified.' });
    if (!canManage(req.user, target)) return res.status(403).json({ error: 'You do not have authority over this account.' });
    if (target.status === 'blocked') return res.status(400).json({ error: 'This account is already blocked.' });

    target.preBlockStatus = target.status;
    target.status = 'blocked';
    await target.save();

    await logAction({ action: 'user_blocked', actor: req.user, target, ipAddress: req.ip });
    res.status(200).json({ success: true, status: target.status });
  } catch (err) {
    console.error('Block failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/users/:id/unblock', verifyToken, requirePermission(permissions.BLOCK_USERS), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.founderLock) return res.status(403).json({ error: 'This account is locked by the founder and cannot be modified.' });
    if (!canManage(req.user, target)) return res.status(403).json({ error: 'You do not have authority over this account.' });

    target.status = target.preBlockStatus || 'active';
    target.preBlockStatus = undefined;
    await target.save();

    await logAction({ action: 'user_unblocked', actor: req.user, target, ipAddress: req.ip });
    res.status(200).json({ success: true, status: target.status });
  } catch (err) {
    console.error('Unblock failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.delete('/users/:id', verifyToken, requirePermission(permissions.DELETE_USERS), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.founderLock) return res.status(403).json({ error: 'This account is locked by the founder and cannot be modified.' });
    if (!canManage(req.user, target)) return res.status(403).json({ error: 'You do not have authority over this account.' });

    await logAction({
      action: 'user_deleted',
      actor: req.user,
      target,
      details: `Permanently deleted ${target.email}.`,
      ipAddress: req.ip,
    });

    await User.deleteOne({ _id: target._id });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/users/:id/founder-lock', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Only the founder can set this lock.' });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

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

// Propose a role change — does NOT apply immediately. The target must confirm it themselves.
router.patch('/users/:id/role', verifyToken, requirePermission(permissions.MANAGE_ROLES), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const { role } = req.body;
    if (!(role in ROLE_RANK)) return res.status(400).json({ error: 'Invalid role.' });
    if (target.founderLock) return res.status(403).json({ error: 'This account is locked by the founder and cannot be modified.' });
    if (req.user.role !== 'founder' && !canManage(req.user, target)) {
      return res.status(403).json({ error: 'You do not have authority over this account.' });
    }
    if (target.status !== 'active') {
      return res.status(400).json({ error: 'Role changes can only be proposed for active accounts.' });
    }

    target.pendingRole = role;
    target.pendingRoleRequestedBy = req.user._id;
    target.pendingRoleRequestedAt = new Date();
    await target.save();

    await notify({
      recipient: { email: target.email },
      channels: ['email'],
      subject: 'Role change requires your confirmation — TGO DevStudio',
      html: `<p>Hi ${target.name},</p><p>${req.user.name} has proposed changing your role from <strong>${target.role.replace('_', ' ')}</strong> to <strong>${role.replace('_', ' ')}</strong>.</p><p>Log in to your account to confirm or decline this change. It will not take effect until you confirm it.</p>`,
    });

    await logAction({
      action: 'role_change_proposed',
      actor: req.user,
      target,
      details: `${target.role} -> ${role}`,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, pendingRole: target.pendingRole });
  } catch (err) {
    console.error('Role change proposal failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Only the target themselves can confirm — requires re-entering their password.
router.post('/users/:id/confirm-role-change', verifyToken, async (req, res) => {
  try {
    if (!req.user._id.equals(req.params.id)) {
      return res.status(403).json({ error: 'Only you can confirm your own role change.' });
    }
    if (!req.user.pendingRole) {
      return res.status(400).json({ error: 'No pending role change to confirm.' });
    }

    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to confirm.' });

    const passwordMatches = await bcrypt.compare(password, req.user.passwordHash);
    if (!passwordMatches) return res.status(401).json({ error: 'Incorrect password.' });

    const previousRole = req.user.role;
    const newRole = req.user.pendingRole;
    req.user.role = newRole;
    req.user.pendingRole = null;
    req.user.pendingRoleRequestedBy = null;
    req.user.pendingRoleRequestedAt = undefined;
    await req.user.save();

    await logAction({
      action: 'role_change_confirmed',
      actor: req.user,
      target: req.user,
      details: `${previousRole} -> ${newRole}`,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, role: req.user.role });
  } catch (err) {
    console.error('Role change confirmation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/users/:id/reject-role-change', verifyToken, async (req, res) => {
  try {
    if (!req.user._id.equals(req.params.id)) {
      return res.status(403).json({ error: 'Only you can reject your own role change.' });
    }

    req.user.pendingRole = null;
    req.user.pendingRoleRequestedBy = null;
    req.user.pendingRoleRequestedAt = undefined;
    await req.user.save();

    await logAction({
      action: 'role_change_rejected',
      actor: req.user,
      target: req.user,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Role change rejection failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
