const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  const { data, error } = await resend.emails.send({
    from: 'TGO DevStudio <onboarding@resend.dev>',
    to,
    subject,
    html,
  });

  if (error) {
    console.error('Email notification failed:', error.message || error);
    return { channel: 'email', success: false, error: error.message || String(error) };
  }

  return { channel: 'email', success: true, id: data.id };
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

/**
 * Generic notification dispatcher.
 * Today this only routes to the founder (via env vars).
 * Once Phase 3 (accounts/roles) exists, `recipient` can carry per-user
 * channel preferences instead of always reading from env vars.
 */
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
