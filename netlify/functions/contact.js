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
    other: 'Other',
  }[topic];

  // Two separate sends rather than one batch call - these are two
  // different templates going to two different single recipients, not a
  // list broadcast, so the simple single-email endpoint (not the batch
  // one used by announce-tool.js) is the right fit here.
  const results = { toSupport: null, toUser: null };

  try {
    const supportResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'ConvertKoro contact form', email: process.env.ANNOUNCE_SENDER_EMAIL || 'noreply@convertkoro.com' },
        to: [{ email: supportInbox }],
        replyTo: { email, name: name || undefined },
        subject: `[${topicLabel}] New message from ${name || email}`,
        htmlContent: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;">
          <p><strong>Topic:</strong> ${esc(topicLabel)}</p>
          <p><strong>From:</strong> ${esc(name || '(no name given)')} &lt;${esc(email)}&gt;</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap;">${esc(message)}</p>
        </div>`,
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
    const userResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'ConvertKoro', email: process.env.ANNOUNCE_SENDER_EMAIL || 'noreply@convertkoro.com' },
        to: [{ email, name: name || undefined }],
        subject: 'We got your message',
        htmlContent: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:480px;">
          <p>Hi${name ? ' ' + esc(name) : ''},</p>
          <p>Thanks for reaching out to ConvertKoro. We've received your ${esc(topicLabel.toLowerCase())} and will get back to you if a reply is needed.</p>
          <p style="color:#888;font-size:12px;margin-top:24px;">This is an automatic confirmation &mdash; you don't need to do anything else.</p>
        </div>`,
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
