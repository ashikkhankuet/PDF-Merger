// Generalized version of video-compress-start.js. See that file for why
// this extra hop exists at all (Netlify returns a 403 if a browser calls
// a "-background" function directly - confirmed via Netlify's own
// support forum - so a normal, fast function must trigger it server-to-
// server instead).
//
// "operation" tells media-process-background.js which real ffmpeg
// command to build (compress, convert, resize, trim, to-gif, to-mp3) -
// see that file for the full, explicit list and its real, verified
// ffmpeg arguments for each one.

const { getStore, connectLambda } = require('@netlify/blobs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

const VALID_OPERATIONS = new Set([
  'audio-compress', 'audio-convert', 'audio-trim',
  'video-convert', 'video-resize', 'video-to-gif', 'video-to-mp3', 'video-trim',
]);

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

    const { jobId, operation, options } = payload;
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }
    if (!operation || !VALID_OPERATIONS.has(operation)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing operation' }) };
    }

    connectLambda(event);
    const metaStore = getStore({ name: 'media-job-meta', siteID: BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    const existing = await metaStore.get(jobId, { type: 'json' });
    if (!existing) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No upload found for this job ID \u2014 the upload may not have finished.' }) };
    }
    if (existing.chunksReceived !== existing.totalChunks) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Upload is not finished yet.' }) };
    }
    await metaStore.setJSON(jobId, { ...existing, operation, options: options || {}, status: 'queued' });

    const siteURL = process.env.URL || `https://${event.headers.host}`;
    const bgResp = await fetch(`${siteURL}/.netlify/functions/media-process-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    if (bgResp.status !== 202 && bgResp.status !== 200) {
      throw new Error(`Failed to start background processing (status ${bgResp.status})`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, jobId }),
    };
  } catch (err) {
    console.error('media-process-start error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error starting processing' }),
    };
  }
};
