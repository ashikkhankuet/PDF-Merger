// Looks up a short code and redirects to the stored destination. Mapped
// from /s/<code> via netlify.toml. A missing/expired code shows a plain,
// honest "link not found" message rather than a confusing generic error.

const { getStore } = require('@netlify/blobs');

// See shorten.js for why this explicit siteID + token fallback is needed
// (documented Netlify Blobs auto-injection issue, not a mistake in this code).
const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  const path = event.path || '';
  const code = path.split('/').filter(Boolean).pop();

  if (!code) {
    return { statusCode: 400, body: 'No short code provided.' };
  }

  const store = getBlobsStore('short-links');
  const destination = await store.get(code);

  if (!destination) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Link not found | ConvertKoro</title>
      <meta name="robots" content="noindex"></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
      <h1 style="font-size:22px;">This short link doesn't exist or has expired.</h1>
      <p style="color:#666;"><a href="https://convertkoro.com/url-shortener">Create a new one</a></p>
      </body></html>`,
    };
  }

  return {
    statusCode: 302,
    headers: { Location: destination },
    body: '',
  };
};
