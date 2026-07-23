const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `TGO DevStudio <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { channel: 'email', success: true };
  } catch (err) {
    console.error('Email notification failed:', err.message);
    return { channel: 'email', success: false, error: err.message };
  }
}

async function sendWhatsApp({ phone, text }) {
  const apiKey = process.env.CALLMEBOT_APIKEY;
  if (!apiKey) {
    console.warn('CallMeBot API key not set yet — skipping WhatsApp notification.');
    return { channel: 'whatsapp', success: false, error: 'not_configured' };
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
      phone
    )}&text=${encodeURIComponent(text)}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CallMeBot responded with status ${res.status}`);
    return { channel: 'whatsapp', success: true };
  } catch (err) {
    console.error('WhatsApp notification failed:', err.message);
    return { channel: 'whatsapp', success: false, error: err.message };
  }
}

async function notify({ recipient, channels, subject, text, html }) {
  const results = [];

  if (channels.includes('email')) {
    const result = await sendEmail({ to: recipient.email, subject, html: html || text });
    if (!result.success) {
      console.error(`Email to ${recipient.email} failed: ${result.error}`);
    }
    results.push(result);
  }

  if (channels.includes('whatsapp') && recipient.phone) {
    results.push(await sendWhatsApp({ phone: recipient.phone, text }));
  }

  return results;
}

module.exports = { notify };
