// Part 1 of the server-side video compression pipeline (see
// video-compress-background.js for the actual compression step and
// video-compressor.html for the on-page explanation of why this exists).
//
// WHY THIS EXISTS AT ALL: Netlify Functions are built on AWS Lambda, which
// enforces a hard 6 MB request-body limit on every plan, including Pro -
// confirmed directly from Netlify's own official docs and multiple real
// support-forum threads where Netlify staff confirm this cannot be raised
// by request, unlike the function TIMEOUT (which can). A real phone video
// is routinely 20-200+ MB, so a single request can never carry the whole
// file. This function receives the video in small pieces instead - each
// one comfortably under that ceiling - and appends them into one Netlify
// Blob under a shared job ID. video-compressor.html slices the file with
// Blob.slice() client-side and calls this function once per slice, in
// order, waiting for each response before sending the next (see that
// file's own comments for why sequential, not parallel).
//
// WHY NETLIFY BLOBS AND NOT A DIRECT-TO-STORAGE BROWSER UPLOAD: confirmed
// via Netlify's own official Blobs-vs-Vercel-Blob comparison that Netlify
// Blobs has no built-in direct browser-to-storage upload path (unlike
// Vercel Blob's client-upload feature) - "reads go through your functions,
// edge functions, or build; there are no public URLs." So even the upload
// step itself has to pass through a Function, which is exactly why
// chunking (not a single big request) is the real, necessary fix here,
// not a workaround for a mistake.

const { getStore, connectLambda } = require('@netlify/blobs');

// See shorten.js/redirect.js for why this explicit siteID + token
// fallback is required (a real, documented Netlify Blobs auto-injection
// bug on this site, not a mistake in this code) - reusing the exact same
// constant so every function in this project talks to the same site.
const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// A generous but real ceiling, independent of the 6MB-per-chunk limit:
// caps the TOTAL assembled video size this pipeline will accept, so a
// single runaway upload can't silently consume unbounded Blobs storage.
// 500 MB comfortably covers real phone/camera videos while keeping a
// hard backstop.
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
// Each job's chunks and metadata expire on their own (see the background
// function, which deletes them after compression) but this is a backstop
// in case a job is abandoned mid-upload (person closes the tab).
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

exports.handler = async (event) => {
  try {
    // Required in Lambda compatibility mode - confirmed directly from
    // @netlify/blobs' own documentation: without this call, Blobs is not
    // automatically configured in a plain exports.handler function (only
    // in the newer, non-Lambda-style export format), and get()/set() calls
    // would silently fail or throw.
    connectLambda(event);

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const { jobId, chunkIndex, totalChunks, chunkBase64, mimeType, fileName, isFirstChunk } = payload;
    if (!jobId || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || !chunkBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    // A job ID is a client-generated identifier used only as a Blobs key
    // prefix - constrained to a safe character set so it can never be used
    // to construct an unexpected blob key.
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    const chunkStore = getBlobsStore('video-job-chunks');
    const metaStore = getBlobsStore('video-job-meta');

    const chunkBuf = Buffer.from(chunkBase64, 'base64');

    // Real, enforced ceiling on total assembled size - checked incrementally
    // as chunks arrive rather than only after the fact, so an oversized
    // upload is rejected as early as possible instead of wasting the
    // person's time and bandwidth uploading all of it first.
    const existingMetaRaw = await metaStore.get(jobId, { type: 'json' }).catch(() => null);
    const bytesSoFar = (existingMetaRaw && existingMetaRaw.bytesReceived) || 0;
    if (bytesSoFar + chunkBuf.length > MAX_TOTAL_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: 'This video is larger than the 500 MB limit for server-side compression.' }) };
    }

    await chunkStore.set(`${jobId}/${String(chunkIndex).padStart(6, '0')}`, chunkBuf);

    const meta = {
      jobId,
      totalChunks,
      mimeType: mimeType || 'application/octet-stream',
      fileName: fileName || 'video',
      bytesReceived: bytesSoFar + chunkBuf.length,
      status: 'uploading',
      createdAt: (existingMetaRaw && existingMetaRaw.createdAt) || Date.now(),
      expiresAt: Date.now() + JOB_TTL_MS,
      chunksReceived: ((existingMetaRaw && existingMetaRaw.chunksReceived) || 0) + 1,
    };
    await metaStore.setJSON(jobId, meta);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, chunksReceived: meta.chunksReceived, totalChunks }),
    };
  } catch (err) {
    console.error('video-upload-chunk error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error uploading chunk' }),
    };
  }
};
