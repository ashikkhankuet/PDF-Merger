// Because video-compress-background.js (a Background Function) cannot
// return a response directly to the browser - confirmed from Netlify's
// own docs: "Background functions don't support response streaming
// because they don't return responses" - the browser instead polls THIS
// small, fast, normal function every few seconds asking "is job X done
// yet?" This function only reads the job's metadata from Blobs; it never
// touches the video bytes themselves.

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
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid job ID' }) };
    }

    const metaStore = getBlobsStore('video-job-meta');
    const meta = await metaStore.get(jobId, { type: 'json' });
    if (!meta) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Job not found' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: meta.status,
        error: meta.error || null,
        originalSize: meta.originalSize || null,
        compressedSize: meta.compressedSize || null,
      }),
    };
  } catch (err) {
    console.error('video-job-status error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error checking job status' }),
    };
  }
};
