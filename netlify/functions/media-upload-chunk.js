// Generalized version of video-upload-chunk.js, serving every OTHER media
// tool (audio compressor/converter/trimmer, video converter/resizer/to-
// gif/to-mp3/trimmer) rather than one copy of this function per tool.
// Video Compressor keeps its own dedicated video-upload-chunk.js
// unchanged - this is deliberately a separate, new function rather than a
// rename, so nothing about the already-working, already-proven Video
// Compressor pipeline is touched or put at risk by this broader rollout.
//
// See video-upload-chunk.js for the full rationale on why chunked upload
// is necessary at all (Netlify Functions' real, confirmed, unraisable-
// even-on-Pro 6MB request body limit).

const { getStore, connectLambda } = require('@netlify/blobs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

exports.handler = async (event) => {
  try {
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

    const { jobId, chunkIndex, totalChunks, chunkBase64, mimeType, fileName } = payload;
    if (!jobId || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || !chunkBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    const chunkStore = getBlobsStore('media-job-chunks');
    const metaStore = getBlobsStore('media-job-meta');

    const chunkBuf = Buffer.from(chunkBase64, 'base64');

    const existingMetaRaw = await metaStore.get(jobId, { type: 'json' }).catch(() => null);
    const bytesSoFar = (existingMetaRaw && existingMetaRaw.bytesReceived) || 0;
    if (bytesSoFar + chunkBuf.length > MAX_TOTAL_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: 'This file is larger than the 500 MB limit for server-side processing.' }) };
    }

    await chunkStore.set(`${jobId}/${String(chunkIndex).padStart(6, '0')}`, chunkBuf);

    const meta = {
      jobId,
      totalChunks,
      mimeType: mimeType || 'application/octet-stream',
      fileName: fileName || 'file',
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
    console.error('media-upload-chunk error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error uploading chunk' }),
    };
  }
};
