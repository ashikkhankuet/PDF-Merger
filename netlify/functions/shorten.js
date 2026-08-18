// Creates a short link: takes a destination URL, stores it in Netlify Blobs
// under a short random code, returns the code. This is the one piece of
// server-side storage on ConvertKoro — every other tool on the site is
// 100% client-side. It exists because a genuinely short link (a handful of
// characters, regardless of how long the destination is) is only possible
// if something stores the mapping; a link with no server has to carry the
// whole destination inside itself, which can never beat a real shortener.
// Only the destination URL itself is stored — no IP, no user identity, no
// analytics beyond what Netlify's own function logs capture by default.

const { getStore } = require('@netlify/blobs');

const CODE_LENGTH = 7;
const CODE_CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I ambiguity
const MAX_URL_LENGTH = 8000; // generous ceiling, well above any realistic URL

function randomCode(len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
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

  const rawUrl = (body.url || '').trim();
  if (!rawUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No URL provided' }) };
  }
  if (rawUrl.length > MAX_URL_LENGTH) {
    return { statusCode: 400, body: JSON.stringify({ error: 'URL is too long' }) };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Enter a full URL, including https://' }) };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Only http:// and https:// links are supported' }) };
  }

  const store = getStore({ name: 'short-links' });

  // Generate a code, retrying on the rare collision (checked, not assumed).
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode(CODE_LENGTH);
    const existing = await store.get(candidate);
    if (existing === null) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate a unique code, please try again' }) };
  }

  await store.set(code, rawUrl, {
    metadata: { createdAt: new Date().toISOString() },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shortUrl: `https://convertkoro.com/s/${code}` }),
  };
};
