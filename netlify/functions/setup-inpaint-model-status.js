// Poll this to check on the one-time model download started by
// setup-inpaint-model-start.js - same real reason as the video pipeline's
// own job-status function: a background function cannot respond
// directly (confirmed: "Background functions don't support response
// streaming because they don't return responses", Netlify's own docs),
// so progress is written to Blobs and read back here instead.
//
// USAGE: GET /api/setup-inpaint-model-status?key=YOUR_ANNOUNCE_ADMIN_KEY

const { getStore, connectLambda } = require('@netlify/blobs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  try {
    connectLambda(event);
    const providedKey = event.queryStringParameters && event.queryStringParameters.key;
    if (!process.env.ANNOUNCE_ADMIN_KEY || providedKey !== process.env.ANNOUNCE_ADMIN_KEY) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const statusStore = getBlobsStore('ai-model-setup-status');
    const status = await statusStore.get('lama', { type: 'json' });
    if (!status) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
        body: JSON.stringify({ status: 'not-started', message: 'No setup has been triggered yet - call /api/setup-inpaint-model first.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      body: JSON.stringify(status),
    };
  } catch (err) {
    console.error('setup-inpaint-model-status error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error checking model setup status' }),
    };
  }
};
