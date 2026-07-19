const express = require('express');
const rateLimit = require('express-rate-limit');
const Message = require('../models/Message');
const { notify } = require('../services/notify');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/contact', contactLimiter, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      company,
      reason,
      projectType,
      budget,
      timeline,
      message,
      consent,
      website, // honeypot field — real users never fill this
    } = req.body;

    // Honeypot check — if filled, silently pretend success (don't tip off bots)
    if (website) {
      return res.status(200).json({ success: true });
    }

    if (!name || !email || !message || !consent) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const saved = await Message.create({
      name,
      email,
      phone,
      company,
      reason,
      projectType,
      budget,
      timeline,
      message,
      consent,
    });

    // Notify the founder (email + WhatsApp)
    await notify({
      recipient: {
        email: process.env.NOTIFY_EMAIL,
        phone: process.env.CALLMEBOT_PHONE,
      },
      channels: ['email', 'whatsapp'],
      subject: `New ${reason || 'general'} inquiry from ${name}`,
      text: `New message from ${name} (${email}): ${message}`,
      html: `<p><strong>${name}</strong> (${email}) sent a new <strong>${reason || 'general'}</strong> inquiry:</p><p>${message}</p>`,
    });

    // Auto-reply to the sender
    await notify({
      recipient: { email },
      channels: ['email'],
      subject: 'We received your message — TGO DevStudio',
      html: `<p>Hi ${name},</p><p>Thanks for reaching out to TGO DevStudio. We've received your message and will get back to you shortly.</p><p>— TGO DevStudio</p>`,
    });

    res.status(201).json({ success: true, id: saved._id });
  } catch (err) {
    console.error('Contact submission failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
