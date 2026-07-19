const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  reason: {
    type: String,
    enum: ['general', 'quote', 'partnership', 'support', 'other'],
    default: 'general',
  },
  projectType: { type: String, trim: true },
  budget: { type: String, trim: true },
  timeline: { type: String, trim: true },
  message: { type: String, required: true, trim: true },
  consent: { type: Boolean, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
