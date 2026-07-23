async function sendEmail({ to, subject, html }) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'TGO DevStudio', email: process.env.GMAIL_USER },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Brevo responded with ${res.status}: ${errorBody}`);
    }

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
