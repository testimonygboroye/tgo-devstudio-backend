require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { logAction } = require('../services/auditLog');
const permissions = require('../config/permissions');

async function createFounder() {
  await mongoose.connect(process.env.MONGODB_URI);

  const email = 'testimonygboroye.dev@gmail.com';
  const password = 'Tgo_devstudio_testytech@17#&#';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Founder account already exists. No changes made.');
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const founder = await User.create({
    name: 'Testimony Oluwatimilehin Gboroye',
    email,
    passwordHash,
    role: 'founder',
    permissions: Object.values(permissions),
    status: 'active',
    emailVerified: true,
    invitedBy: null,
  });

  await logAction({
    action: 'founder_account_created',
    actor: founder,
    target: founder,
    details: 'Founder account bootstrapped via createFounder script.',
  });

  console.log('Founder account created successfully:', founder.email);
  await mongoose.disconnect();
}

createFounder().catch((err) => {
  console.error('Failed to create founder account:', err.message);
  process.exit(1);
});
