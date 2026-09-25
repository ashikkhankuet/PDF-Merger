// The real entry point for the one-time model setup. Call this ONCE,
// with your admin key, to start downloading the LaMa inpainting model
// into Netlify Blobs (see setup-inpaint-model-background.js for the
// full download/verify logic). This function itself is fast and
// synchronous - it does not wait for the 208MB download to finish, it
// only starts it (the same real, confirmed pattern already used for
// video-compress-start.js: a background function can't be invoked
// directly from a browser at all - Netlify returns a 403 by design for
// any "-background"-named function - so a normal function has to
// trigger it server-to-server instead).
//
// USAGE: GET (or POST) /api/setup-inpaint-model?key=YOUR_ANNOUNCE_ADMIN_KEY
// Then poll /api/setup-inpaint-model-status to watch progress - the
// download itself takes real time (a genuine 208MB fetch), so this
// does not complete instantly.

exports.handler = async (event) => {
  try {
    const providedKey = event.queryStringParameters && event.queryStringParameters.key;
    if (!process.env.ANNOUNCE_ADMIN_KEY || providedKey !== process.env.ANNOUNCE_ADMIN_KEY) {
      // Reuses the same admin secret already set up for
      // announce-tool.js, rather than introducing a second env var for
      // what is, in practice, the same "only I should be able to
      // trigger this" protection.
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const siteURL = process.env.URL || `https://${event.headers.host}`;
    const bgResp = await fetch(`${siteURL}/.netlify/functions/setup-inpaint-model-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      body: JSON.stringify({}),
    });
    if (bgResp.status !== 202 && bgResp.status !== 200) {
      throw new Error(`Failed to start model download (status ${bgResp.status})`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      body: JSON.stringify({ ok: true, message: 'Model download started. Poll /api/setup-inpaint-model-status to check progress.' }),
    };
  } catch (err) {
    console.error('setup-inpaint-model-start error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error starting model setup' }),
    };
  }
};
