// The browser calls THIS function (fast, synchronous, normal) once all of
// a video's chunks have finished uploading via video-upload-chunk.js. This
// function's only job is to invoke video-compress-background.js and
// return immediately - it does not run FFmpeg itself.
//
// WHY THIS EXTRA HOP IS NECESSARY (not an oversight): a real, confirmed
// Netlify platform behavior - background functions (any function whose
// name ends in "-background") return a 403 Forbidden when called directly
// from a browser. This is deliberate on Netlify's part, confirmed
// directly by Netlify's own support staff on their official forum: "they
// aren't meant to be invoked directly in the browser." The documented,
// correct pattern is to invoke a background function from ANOTHER
// Netlify Function (a server-to-server call), which is exactly what this
// function does - matching the same real answer Netlify support gave to
// someone hitting the identical problem.

const { getStore, connectLambda } = require('@netlify/blobs');

// See shorten.js/redirect.js for why this explicit siteID + token
// fallback is required (a real, documented Netlify Blobs auto-injection
// bug on this site, not a mistake in this code).
const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const { jobId, options } = payload;
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    // Store the requested compression options (CRF, fast mode, resolution
    // cap) alongside the job's metadata BEFORE triggering the background
    // function, so it can read them without needing them passed through
    // this hop's own tiny invocation payload as well.
    connectLambda(event);
    const metaStore = getStore({ name: 'video-job-meta', siteID: BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    const existing = await metaStore.get(jobId, { type: 'json' });
    if (!existing) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No upload found for this job ID \u2014 the upload may not have finished.' }) };
    }
    if (existing.chunksReceived !== existing.totalChunks) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Upload is not finished yet.' }) };
    }
    await metaStore.setJSON(jobId, {
      ...existing,
      options: {
        crf: (options && options.crf) || 28,
        fastMode: !!(options && options.fastMode),
        capRes: !!(options && options.capRes),
      },
      status: 'queued',
    });

    // Fire-and-forget server-to-server call to the background function.
    // Deliberately not awaiting the body/JSON of the response (a
    // background function only ever returns an empty 202 acknowledgment -
    // see this file's header comment) - only that the request was
    // accepted at all.
    const siteURL = process.env.URL || `https://${event.headers.host}`;
    const bgResp = await fetch(`${siteURL}/.netlify/functions/video-compress-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    if (bgResp.status !== 202 && bgResp.status !== 200) {
      throw new Error(`Failed to start background compression (status ${bgResp.status})`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, jobId }),
    };
  } catch (err) {
    console.error('video-compress-start error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error starting compression' }),
    };
  }
};
