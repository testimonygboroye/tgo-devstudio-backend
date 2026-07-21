const express = require('express');
const { generateSecret, generateURI, verify } = require('otplib');
const qrcode = require('qrcode');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');

const router = express.Router();

// Step 1: generate a secret and return a QR code to scan
router.post('/auth/totp/setup', verifyToken, async (req, res) => {
  try {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      secret,
      issuer: 'TGO DevStudio',
      label: req.user.email,
    });
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    req.user.totpSecret = secret;
    await req.user.save();

    res.status(200).json({ qrDataUrl, secret });
  } catch (err) {
    console.error('TOTP setup failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Step 2: verify a code from the authenticator app to actually enable 2FA
router.post('/auth/totp/verify', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required.' });
    }

    if (!req.user.totpSecret) {
      return res.status(400).json({ error: 'No 2FA setup in progress. Start setup first.' });
    }

    const result = await verify({ secret: req.user.totpSecret, token: code });
    if (!result.valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    req.user.totpEnabled = true;
    await req.user.save();

    await logAction({
      action: 'totp_enabled',
      actor: req.user,
      target: req.user,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('TOTP verification failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Disable 2FA — requires current password as confirmation
router.post('/auth/totp/disable', verifyToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable 2FA.' });
    }

    const passwordMatches = await bcrypt.compare(password, req.user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    req.user.totpEnabled = false;
    req.user.totpSecret = undefined;
    await req.user.save();

    await logAction({
      action: 'totp_disabled',
      actor: req.user,
      target: req.user,
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('TOTP disable failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
