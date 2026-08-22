// Stores a newsletter signup email in Netlify Blobs. This is the second
// piece of server-side storage on ConvertKoro (alongside the URL Shortener)
// - every other tool remains 100% client-side. Actually EMAILING people
// when a new tool launches is a separate, manual step done via the Brevo
// dashboard using the exported list from this store - this function only
// handles capturing and de-duplicating signups, not sending campaigns.

const { getStore } = require('@netlify/blobs');

// Same documented Netlify Blobs fallback already established and working
// in shorten.js - see that file's comment for the specific platform issue
// this works around.
const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// Deliberately simple validation - matches the same "does it look like an
// email" bar as the front-end check, since the real bounce/deliverability
// filtering happens on Brevo's side when a campaign actually sends, not here.
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Enter a valid email address' }) };
  }
  if (email.length > 254) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email address is too long' }) };
  }

  if (!process.env.NETLIFY_BLOBS_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is missing its Blobs token configuration' }) };
  }

  const store = getBlobsStore('newsletter-signups');

  // Use the email itself (not a random code) as the key - the natural,
  // simple way to both store and de-duplicate signups without a second
  // lookup table.
  const existing = await store.get(email);
  if (existing !== null) {
    // Not an error - resignup with the same address is a harmless no-op,
    // and the front end shows the same success message either way so a
    // person can't tell whether they were already on the list.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'already-subscribed' }),
    };
  }

  await store.set(email, JSON.stringify({ subscribedAt: new Date().toISOString() }));

  // Optional real-time sync to Brevo's contact list, so signups appear
  // there immediately rather than requiring a manual export/import from
  // Blobs before every campaign send. Failure here does NOT fail the
  // signup itself - the email is already safely stored in Blobs either
  // way, and a Brevo sync can be retried/backfilled later from that list.
  if (process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          email,
          listIds: [parseInt(process.env.BREVO_LIST_ID, 10)],
          updateEnabled: true,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.warn('ConvertKoro subscribe: Brevo sync failed, email still saved in Blobs.', resp.status, errText);
      }
    } catch (err) {
      console.warn('ConvertKoro subscribe: Brevo sync request failed, email still saved in Blobs.', err);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'subscribed' }),
  };
};
