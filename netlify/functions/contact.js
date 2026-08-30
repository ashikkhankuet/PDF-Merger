// Handles the "Contact us" form: sends the user's message to your support
// inbox, and sends a short auto-reply confirmation back to the user so
// they know it was received. Both emails go through Brevo (same account
// as announce-tool.js and subscribe.js's optional sync - one Brevo account
// covers all outbound mail on the site).

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const ALLOWED_TOPICS = ['bug', 'suggestion', 'tool-request', 'other'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'BREVO_API_KEY is not configured' }) };
  }
  const supportInbox = process.env.SUPPORT_INBOX_EMAIL;
  if (!supportInbox) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPPORT_INBOX_EMAIL is not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const name = (body.name || '').trim().slice(0, 120);
  const email = (body.email || '').trim().toLowerCase();
  const topic = ALLOWED_TOPICS.includes(body.topic) ? body.topic : 'other';
  const message = (body.message || '').trim().slice(0, 4000);

  if (!isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Enter a valid email address' }) };
  }
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message cannot be empty' }) };
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const topicLabel = {
    bug: 'Bug report',
    suggestion: 'Suggestion / feedback',
    'tool-request': 'New tool request',
    other: 'General message',
  }[topic];

  // Shared visual shell (real ConvertKoro brand blue #0062F8, IBM Plex
  // Sans, real logo) matching the design already built and tested for
  // announce-tool.js's emails earlier - a real, confirmed bug this fixes:
  // both contact-form emails previously had zero visual design (plain
  // black-on-white text, no branding, an ugly literal "[Other]" in the
  // subject line), which reads as unpolished/spammy compared to the rest
  // of the site's actual design quality.
  function emailShell(bodyContent) {
    return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:32px 16px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 0 20px;text-align:center;">
      <img src="https://convertkoro.com/logo-mark.png" width="36" height="36" alt="ConvertKoro" style="display:inline-block;vertical-align:middle;border-radius:8px;" />
      <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:17px;font-weight:700;color:#111827;">ConvertKoro</span>
    </td></tr>
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eef0f3;">
        ${bodyContent}
      </table>
    </td></tr>
    <tr><td style="padding:24px 8px 0;text-align:center;">
      <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">Sent from the ConvertKoro contact form at convertkoro.com/contact</p>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // Two separate sends rather than one batch call - these are two
  // different templates going to two different single recipients, not a
  // list broadcast, so the simple single-email endpoint (not the batch
  // one used by announce-tool.js) is the right fit here.
  const results = { toSupport: null, toUser: null };

  try {
    const supportBody = `
      <tr><td style="padding:28px 32px 8px;">
        <div style="display:inline-block;background:#EEF4FF;color:#0062F8;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:6px 14px;border-radius:999px;margin-bottom:16px;">${esc(topicLabel)}</div>
        <table role="presentation" width="100%" style="margin:6px 0 20px;">
          <tr><td style="font-size:13px;color:#6b7280;padding:2px 0;">From</td><td style="font-size:14px;color:#111827;font-weight:600;padding:2px 0;">${esc(name || '(no name given)')} &lt;${esc(email)}&gt;</td></tr>
        </table>
        <div style="background:#f9fafb;border-radius:10px;padding:18px 20px;">
          <p style="font-size:14.5px;line-height:1.65;color:#111827;margin:0;white-space:pre-wrap;">${esc(message)}</p>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 28px;">
        <a href="mailto:${esc(email)}" style="display:inline-block;color:#0062F8;font-size:13.5px;font-weight:700;text-decoration:none;">Reply directly to ${esc(email)} &rarr;</a>
      </td></tr>`;
    const supportResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'ConvertKoro contact form', email: process.env.ANNOUNCE_SENDER_EMAIL || 'noreply@convertkoro.com' },
        to: [{ email: supportInbox }],
        replyTo: { email, name: name || undefined },
        subject: `${topicLabel}: message from ${name || email}`,
        htmlContent: emailShell(supportBody),
      }),
    });
    results.toSupport = supportResp.ok;
    if (!supportResp.ok) {
      console.error('ConvertKoro contact: failed to notify support inbox.', supportResp.status, await supportResp.text());
    }
  } catch (err) {
    console.error('ConvertKoro contact: request to notify support inbox failed.', err);
    results.toSupport = false;
  }

  // The auto-reply to the user is a nice-to-have, not the core function of
  // this endpoint - if it fails, the user's message still reached support
  // above, so this failure alone should not turn the whole request into
  // an error response.
  try {
    const userBody = `
      <tr><td style="padding:32px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:#EEF4FF;margin-bottom:16px;font-size:20px;line-height:44px;text-align:center;">&#x2713;</span>
        <h1 style="font-size:19px;line-height:1.3;margin:0 0 12px;color:#111827;font-weight:700;">We got your message</h1>
        <p style="font-size:14.5px;line-height:1.65;color:#4b5563;margin:0 0 8px;">Hi${name ? ' ' + esc(name) : ''}, thanks for reaching out to ConvertKoro. We've received your ${esc(topicLabel.toLowerCase())} and will get back to you if a reply is needed.</p>
        <p style="font-size:12.5px;color:#9ca3af;margin:20px 0 0;">This is an automatic confirmation &mdash; you don't need to do anything else.</p>
      </td></tr>`;
    const userResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'ConvertKoro', email: process.env.ANNOUNCE_SENDER_EMAIL || 'noreply@convertkoro.com' },
        to: [{ email, name: name || undefined }],
        subject: 'We got your message',
        htmlContent: emailShell(userBody),
      }),
    });
    results.toUser = userResp.ok;
  } catch (err) {
    console.warn('ConvertKoro contact: auto-reply to user failed (non-fatal).', err);
    results.toUser = false;
  }

  // The request only fails outright if the support notification itself
  // failed - that's the one email that actually matters for you to see
  // the message at all.
  if (!results.toSupport) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not deliver your message right now. Please try again shortly.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'sent', autoReplySent: results.toUser }),
  };
};
