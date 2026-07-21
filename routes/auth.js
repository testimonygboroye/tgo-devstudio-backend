const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { verify } = require('otplib');
const User = require('../models/User');
const { logAction } = require('../services/auditLog');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
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
      const validTotp = totpResult.valid;
      if (!validTotp) {
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

module.exports = router;
