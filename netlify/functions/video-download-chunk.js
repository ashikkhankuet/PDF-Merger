// Serves the finished compressed video back to the browser, one chunk at
// a time. This mirrors video-upload-chunk.js's approach but in reverse,
// for the same real, confirmed reason: even a STREAMED Netlify Function
// response is capped at 20 MB (confirmed directly from Netlify's own
// official docs - "Responses larger than 20 MB cannot be streamed"), and
// a real compressed video can easily exceed that. video-compressor.html
// calls this function repeatedly with an increasing chunkIndex, appending
// each returned chunk into one client-side Blob, until the full result
// has been retrieved - then builds the final downloadable file from that
// Blob, exactly as it already does for the original client-side
// compression path.

const { getStore, connectLambda } = require('@netlify/blobs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// The 4MB chunk size itself is decided once, in
// video-compress-background.js, when it pre-splits the result - this
// function just serves whichever chunks were written there.

exports.handler = async (event) => {
  try {
    connectLambda(event);
    const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
    const chunkIndex = parseInt((event.queryStringParameters && event.queryStringParameters.chunkIndex) || '0', 10);
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    const metaStore = getBlobsStore('video-job-meta');
    const resultStore = getBlobsStore('video-job-results');

    const meta = await metaStore.get(jobId, { type: 'json' });
    if (!meta || meta.status !== 'done') {
      return { statusCode: 404, body: JSON.stringify({ error: 'Result not ready or not found' }) };
    }
    const totalChunks = meta.resultTotalChunks || 1;
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Chunk index out of range' }) };
    }

    // Reads the pre-split chunk written once by
    // video-compress-background.js, rather than re-reading and
    // re-slicing the entire result on every request.
    const chunkBuf = await resultStore.get(`${jobId}/${String(chunkIndex).padStart(6, '0')}`, { type: 'arrayBuffer' });
    if (!chunkBuf) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Chunk data not found' }) };
    }

    const isLast = chunkIndex === totalChunks - 1;
    // Once the final chunk has been served, the compressed result and
    // this job's metadata have done their job - delete them so the
    // "compressed on our server, deleted afterward" disclosure on
    // video-compressor.html stays true, and so completed jobs don't sit
    // in Blobs storage indefinitely.
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
        isLast,
      }),
    };
  } catch (err) {
    console.error('video-download-chunk error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error downloading result' }),
    };
  }
};
