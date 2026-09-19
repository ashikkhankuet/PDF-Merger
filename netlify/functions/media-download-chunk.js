// Generalized version of video-download-chunk.js. See that file for why
// chunked download is necessary (a function response is capped at 20MB
// even streamed - confirmed directly from Netlify's own docs).

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
    const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
    const chunkIndex = parseInt((event.queryStringParameters && event.queryStringParameters.chunkIndex) || '0', 10);
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    const metaStore = getBlobsStore('media-job-meta');
    const resultStore = getBlobsStore('media-job-results');

    const meta = await metaStore.get(jobId, { type: 'json' });
    if (!meta || meta.status !== 'done') {
      return { statusCode: 404, body: JSON.stringify({ error: 'Result not ready or not found' }) };
    }
    const totalChunks = meta.resultTotalChunks || 1;
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Chunk index out of range' }) };
    }

    const chunkBuf = await resultStore.get(`${jobId}/${String(chunkIndex).padStart(6, '0')}`, { type: 'arrayBuffer' });
    if (!chunkBuf) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Chunk data not found' }) };
    }

    const isLast = chunkIndex === totalChunks - 1;
    if (isLast) {
      for (let i = 0; i < totalChunks; i++) {
        await resultStore.delete(`${jobId}/${String(i).padStart(6, '0')}`).catch(() => {});
      }
      await metaStore.delete(jobId).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunkBase64: Buffer.from(chunkBuf).toString('base64'),
        chunkIndex,
        totalChunks,
        totalSize: meta.compressedSize,
        outMime: meta.outMime,
        isLast,
      }),
    };
  } catch (err) {
    console.error('media-download-chunk error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error downloading result' }),
    };
  }
};
