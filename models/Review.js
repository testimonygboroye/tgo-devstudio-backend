const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  company: { type: String, trim: true },
  role: { type: String, trim: true },
  projectSlug: { type: String, trim: true },
  projectTitle: { type: String, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  testimonial: { type: String, required: true, trim: true },
  consent: { type: Boolean, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Review', reviewSchema);
