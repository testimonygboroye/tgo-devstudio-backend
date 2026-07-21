const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { verify } = require('otplib');
const User = require('../models/User');
const { logAction } = require('../services/auditLog');
const { verifyToken } = require('../middleware/auth');
const { notify } = require('../services/notify');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    const ipAddress = req.ip;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      await logAction({
        action: 'login_failed',
        actorEmail: email,
        details: 'No account found with this email.',
        ipAddress,
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account temporarily locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.status === 'blocked' || user.status === 'banned') {
      await logAction({
        action: 'login_blocked_attempt',
        actor: user,
        target: user,
        details: `Login attempt on ${user.status} account.`,
        ipAddress,
      });
      return res.status(403).json({ error: 'This account has been blocked or banned.' });
    }

    if (user.status === 'pending_invite' || user.status === 'pending_verification') {
      return res.status(403).json({ error: 'Account setup is not complete yet.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await user.save();

      await logAction({
        action: 'login_failed',
        actor: user,
        target: user,
        details: `Incorrect password. Attempt ${user.failedLoginAttempts} of ${MAX_FAILED_ATTEMPTS}.`,
        ipAddress,
      });

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.totpEnabled) {
      if (!totpCode) {
        return res.status(200).json({ requiresTotp: true });
      }
      const totpResult = await verify({ secret: user.totpSecret, token: totpCode });
      if (!totpResult.valid) {
        await logAction({
          action: 'login_failed',
          actor: user,
          target: user,
          details: 'Invalid 2FA code.',
          ipAddress,
        });
        return res.status(401).json({ error: 'Invalid 2FA code.' });
      }
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAction({
      action: 'login_success',
      actor: user,
      target: user,
      ipAddress,
    });

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/auth/me', verifyToken, async (req, res) => {
  res.status(200).json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    permissions: req.user.permissions,
    totpEnabled: req.user.totpEnabled,
  });
});

router.post('/auth/forgot-password', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user && user.status !== 'blocked' && user.status !== 'banned') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/admin/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

      await notify({
        recipient: { email: user.email },
        channels: ['email'],
        subject: 'Reset your TGO DevStudio password',
        html: `<p>Hi ${user.name},</p><p>We received a request to reset your password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });

      await logAction({
        action: 'password_reset_requested',
        actor: user,
        target: user,
        ipAddress: req.ip,
      });
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.',
    });
  } catch (err) {
    console.error('Forgot password failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/auth/reset-password', resetLimiter, async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    await logAction({
      action: 'password_reset_completed',
      actor: user,
      target: user,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Reset password failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/auth/accept-invite', async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      inviteToken: hashedToken,
      inviteTokenExpires: { $gt: Date.now() },
      status: 'pending_invite',
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired invite link.' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.status = 'active';
    user.emailVerified = true;
    user.inviteToken = undefined;
    user.inviteTokenExpires = undefined;
    await user.save();

    await logAction({
      action: 'invite_accepted',
      actor: user,
      target: user,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Account activated. You can now log in.' });
  } catch (err) {
    console.error('Accept invite failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
