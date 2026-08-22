// Sends a "new tool" or "tool updated" announcement to every email address
// stored by subscribe.js. This is NOT triggered automatically by anything -
// there is no code anywhere that detects "a new tool was added to the
// site" and calls this on its own. You (the site owner) call this function
// yourself, once, each time you actually want an announcement sent - see
// the accompanying admin.html for the simple form that does this without
// needing to hand-craft an API request.
//
// Protected by a shared secret (ANNOUNCE_ADMIN_KEY) so a stranger who
// finds this URL can't blast your entire subscriber list. This is NOT the
// same as a full login system - it's a single shared password, appropriate
// for a solo-owner site with one person sending announcements. If more
// people needed access later, this would need real per-person auth instead.

const { getStore } = require('@netlify/blobs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const providedKey = event.headers['x-admin-key'] || '';
  if (!process.env.ANNOUNCE_ADMIN_KEY || providedKey !== process.env.ANNOUNCE_ADMIN_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!process.env.BREVO_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'BREVO_API_KEY is not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { toolName, toolDescription, toolUrl, kind } = body;
  if (!toolName || !toolDescription || !toolUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'toolName, toolDescription, and toolUrl are all required' }) };
  }

  // "New tool" vs "enhanced tool" vs a free-text campaign heading - these
  // are the only three variable "kinds" this template supports. Anything
  // else falls back to the generic "Update" heading rather than erroring,
  // since a typo here shouldn't block sending the whole announcement.
  const headingByKind = {
    new: 'New tool',
    enhanced: 'Tool enhanced',
    campaign: 'Update',
  };
  const heading = headingByKind[kind] || 'Update';

  const store = getBlobsStore('newsletter-signups');
  const { blobs } = await store.list();
  const emails = blobs.map((b) => b.key);

  if (emails.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ status: 'sent', recipientCount: 0, note: 'No subscribers yet' }) };
  }

  // Brevo's batch endpoint accepts up to 1000 message versions per request
  // (see Brevo's docs) - each subscriber gets their own version so a) no
  // one's address is exposed to anyone else in a To/Cc field, and b) it
  // stays within that per-request cap. Chunking here means an announcement
  // to more than 1000 people sends as multiple requests, not a single
  // failure past that size.
  const CHUNK_SIZE = 1000;
  const chunks = [];
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    chunks.push(emails.slice(i, i + CHUNK_SIZE));
  }

  let totalSent = 0;
  const failures = [];

  for (const chunk of chunks) {
    const messageVersions = chunk.map((email) => ({
      to: [{ email }],
    }));

    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: 'ConvertKoro', email: process.env.ANNOUNCE_SENDER_EMAIL || 'noreply@convertkoro.com' },
          subject: `${heading}: ${toolName}`,
          htmlContent: buildAnnouncementHtml({ heading, toolName, toolDescription, toolUrl }),
          messageVersions,
          params: { heading, toolName, toolDescription, toolUrl },
        }),
      });

      if (resp.ok) {
        totalSent += chunk.length;
      } else {
        const errText = await resp.text();
        console.error('ConvertKoro announce-tool: Brevo send failed for a chunk.', resp.status, errText);
        failures.push({ count: chunk.length, error: errText });
      }
    } catch (err) {
      console.error('ConvertKoro announce-tool: request to Brevo failed.', err);
      failures.push({ count: chunk.length, error: String(err) });
    }
  }

  return {
    statusCode: failures.length === 0 ? 200 : 207,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: failures.length === 0 ? 'sent' : 'partial',
      recipientCount: totalSent,
      totalSubscribers: emails.length,
      failures: failures.length ? failures : undefined,
    }),
  };
};

// Plain, simple HTML - no external template dependency in Brevo's UI
// needed, so this function is fully self-contained. Deliberately no
// "reply" affordance in the body copy, matching the no-reply requirement -
// the actual no-reply behavior comes from the sender address itself
// (ANNOUNCE_SENDER_EMAIL), which should be an address that either bounces
// replies or isn't monitored.
function buildAnnouncementHtml({ heading, toolName, toolDescription, toolUrl }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;margin:0;padding:32px 16px;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:32px;">
      <p style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#2563eb;font-weight:600;margin:0 0 8px;">${esc(heading)}</p>
      <h1 style="font-size:22px;margin:0 0 12px;color:#111827;">${esc(toolName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 24px;">${esc(toolDescription)}</p>
      <a href="${esc(toolUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Try it now</a>
      <p style="font-size:12px;color:#9ca3af;margin:32px 0 0;">You're receiving this because you signed up for ConvertKoro updates. This is a one-way announcement &mdash; replies to this address aren't monitored.</p>
    </td></tr>
  </table>
</body>
</html>`;
}
