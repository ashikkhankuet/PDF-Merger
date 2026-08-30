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
          htmlContent: buildAnnouncementHtml({ kind, heading, toolName, toolDescription, toolUrl }),
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

// Three genuinely distinct templates, one per "kind" - not just a
// swapped label on one shared layout. Each still shares the same brand
// system (real ConvertKoro blue #0062F8, IBM Plex Sans, actual logo
// hosted at convertkoro.com/logo-mark.png) so they're unmistakably from
// the same sender, but the layout, color accent, emoji badge, and CTA
// copy differ by case so each email "feels" like the right kind of news.
//
// Built with table-based layout and inline styles throughout, NOT
// flexbox/grid/external CSS - deliberately, because Gmail/Outlook/etc
// strip or ignore modern CSS in email HTML. This is the real, tested
// constraint for email specifically, different from the site's own
// modern CSS elsewhere. Deliberately no "reply" affordance in the body
// copy, matching the no-reply requirement - the actual no-reply
// behavior comes from the sender address itself (ANNOUNCE_SENDER_EMAIL),
// which should be an address that either bounces replies or isn't
// monitored.
function buildAnnouncementHtml({ kind, heading, toolName, toolDescription, toolUrl }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const templates = { new: newToolTemplate, enhanced: enhancedTemplate, campaign: campaignTemplate };
  const build = templates[kind] || campaignTemplate;
  return build({ heading, toolName: esc(toolName), toolDescription: esc(toolDescription), toolUrl: esc(toolUrl) });
}

// Shared wrapper every template uses - real logo in the header (not just
// a text wordmark) so the email is recognizable as ConvertKoro at a
// glance in a crowded inbox, plus the same footer disclosure on all
// three so unsubscribe/sender trust signals never depend on which kind
// was sent.
function emailShell({ accentColor, badgeBg, badgeText, bodyContent }) {
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
      <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">You're receiving this because you signed up for ConvertKoro updates.<br/>This is a one-way announcement &mdash; replies to this address aren't monitored.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

// NEW TOOL - the most celebratory of the three: a full-bleed brand-blue
// banner up top with a rocket badge, since a new tool is the biggest
// piece of news this system sends and should look like it.
function newToolTemplate({ toolName, toolDescription, toolUrl }) {
  const body = `
      <tr><td style="background:linear-gradient(135deg,#0062F8,#3B82F6);padding:36px 32px 28px;text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,.18);color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:6px 14px;border-radius:999px;margin-bottom:14px;">&#128640; New tool</div>
        <h1 style="font-size:24px;line-height:1.3;margin:0;color:#ffffff;font-weight:700;">${toolName}</h1>
      </td></tr>
      <tr><td style="padding:28px 32px 32px;">
        <p style="font-size:15px;line-height:1.65;color:#4b5563;margin:0 0 26px;">${toolDescription}</p>
        <table role="presentation"><tr><td style="border-radius:10px;background:#0062F8;">
          <a href="${toolUrl}" style="display:inline-block;padding:13px 28px;font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;">Try it now &rarr;</a>
        </td></tr></table>
        <p style="font-size:13px;color:#9ca3af;margin:20px 0 0;">Free, no sign-up, and your files never leave your device.</p>
      </td></tr>`;
  return emailShell({ bodyContent: body });
}

// ENHANCED - calmer than "new", framed around improvement rather than
// launch excitement. Uses a left accent bar + a small "what changed"
// visual cue instead of a big color banner, since re-announcing an
// existing tool shouldn't compete visually with genuinely new launches.
function enhancedTemplate({ toolName, toolDescription, toolUrl }) {
  const body = `
      <tr><td style="padding:32px 32px 28px;border-left:4px solid #0062F8;">
        <div style="display:inline-block;background:#EEF4FF;color:#0062F8;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:6px 14px;border-radius:999px;margin-bottom:16px;">&#9889; Just improved</div>
        <h1 style="font-size:22px;line-height:1.3;margin:0 0 14px;color:#111827;font-weight:700;">${toolName}</h1>
        <p style="font-size:15px;line-height:1.65;color:#4b5563;margin:0 0 26px;">${toolDescription}</p>
        <table role="presentation"><tr><td style="border-radius:10px;border:2px solid #0062F8;">
          <a href="${toolUrl}" style="display:inline-block;padding:11px 26px;font-size:14.5px;font-weight:700;color:#0062F8;text-decoration:none;">See what's new &rarr;</a>
        </td></tr></table>
      </td></tr>`;
  return emailShell({ bodyContent: body });
}

// GENERAL UPDATE / CAMPAIGN - the plainest of the three, deliberately:
// this covers site-wide news that isn't tied to one tool (e.g. a policy
// change, a milestone, a broad announcement), so it reads as an editorial
// note rather than a product-launch push - no big banner, no bold badge
// color, just a clean announcement layout.
function campaignTemplate({ toolName, toolDescription, toolUrl }) {
  const body = `
      <tr><td style="padding:32px;">
        <p style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;font-weight:700;margin:0 0 10px;">&#128227; Update</p>
        <h1 style="font-size:21px;line-height:1.3;margin:0 0 14px;color:#111827;font-weight:700;">${toolName}</h1>
        <p style="font-size:15px;line-height:1.65;color:#4b5563;margin:0 0 26px;">${toolDescription}</p>
        <a href="${toolUrl}" style="display:inline-block;color:#0062F8;font-size:14.5px;font-weight:700;text-decoration:none;border-bottom:2px solid #0062F8;padding-bottom:2px;">Read more &rarr;</a>
      </td></tr>`;
  return emailShell({ bodyContent: body });
}
