const express = require('express');
const rateLimit = require('express-rate-limit');
const Review = require('../models/Review');
const { notify } = require('../services/notify');

const router = express.Router();

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/reviews', reviewLimiter, async (req, res) => {
  try {
    const {
      name,
      email,
      company,
      role,
      projectSlug,
      projectTitle,
      rating,
      testimonial,
      consent,
      website, // honeypot
    } = req.body;

    if (website) {
      return res.status(200).json({ success: true });
    }

    if (!name || !email || !testimonial || !consent || !rating) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    const saved = await Review.create({
      name,
      email,
      company,
      role,
      projectSlug,
      projectTitle,
      rating: numericRating,
      testimonial,
      consent,
    });

    await notify({
      recipient: {
        email: process.env.NOTIFY_EMAIL,
        phone: process.env.CALLMEBOT_PHONE,
      },
      channels: ['email', 'whatsapp'],
      subject: `New review awaiting moderation from ${name}`,
      text: `New ${numericRating}-star review from ${name} (${email}) for "${projectTitle || 'general'}": ${testimonial}`,
      html: `<p><strong>${name}</strong> (${email}) left a <strong>${numericRating}-star</strong> review for "<strong>${projectTitle || 'general'}</strong>":</p><p>${testimonial}</p><p>Status: pending approval.</p>`,
    });

    res.status(201).json({ success: true, id: saved._id });
  } catch (err) {
    console.error('Review submission failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
