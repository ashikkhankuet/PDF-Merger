// Shared client-side driver for the generalized server-side media
// pipeline (see netlify/functions/media-*.js for the full architecture).
// Used by every media tool EXCEPT Video Compressor, which keeps its own
// dedicated, already-proven video-compress-*.js functions and inline
// client logic untouched.
//
// Exposes ckProcessMediaServerSide(file, operation, options, onProgress)
// which resolves to a Blob of the finished result, or rejects with a
// real Error - callers should fall back to their own existing
// ffmpeg.wasm client-side path on rejection, the same graceful-
// degradation pattern already used in video-compressor.html.

const CK_MEDIA_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const CK_MEDIA_MAX_BYTES = 500 * 1024 * 1024;

function ckArrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ckProcessMediaServerSide(file, operation, options, onProgress) {
  if (file.size > CK_MEDIA_MAX_BYTES) {
    throw new Error('This file is larger than the 500MB server-side limit');
  }
  const jobId = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const totalChunks = Math.ceil(file.size / CK_MEDIA_UPLOAD_CHUNK_BYTES);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CK_MEDIA_UPLOAD_CHUNK_BYTES;
    const chunkBlob = file.slice(start, Math.min(start + CK_MEDIA_UPLOAD_CHUNK_BYTES, file.size));
    const chunkBuf = await chunkBlob.arrayBuffer();
    const resp = await fetch('/api/media-upload-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId, chunkIndex: i, totalChunks,
        chunkBase64: ckArrayBufferToBase64(chunkBuf),
        mimeType: file.type, fileName: file.name,
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Upload failed (status ${resp.status})`);
    }
    onProgress(2 + Math.round((i + 1) / totalChunks * 28), `Uploading\u2026 ${Math.round((i + 1) / totalChunks * 100)}%`);
  }

  onProgress(32, 'Starting processing\u2026');
  const startResp = await fetch('/api/media-process-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, operation, options: options || {} }),
  });
  if (!startResp.ok) {
    const errData = await startResp.json().catch(() => ({}));
    throw new Error(errData.error || `Couldn\u2019t start processing (status ${startResp.status})`);
  }

  const POLL_INTERVAL_MS = 4000;
  const MAX_POLL_MS = 14 * 60 * 1000;
  const pollStart = Date.now();
  let status = 'queued';
  while (status === 'queued' || status === 'uploading' || status === 'processing') {
    if (Date.now() - pollStart > MAX_POLL_MS) {
      throw new Error('Processing is taking longer than expected \u2014 the server may be busy, try again shortly');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusResp = await fetch(`/api/media-job-status?jobId=${encodeURIComponent(jobId)}`);
    if (!statusResp.ok) continue;
    const statusData = await statusResp.json();
    status = statusData.status;
    if (status === 'processing') {
      onProgress(35, 'Processing on the server\u2026 this can take a few minutes for larger files');
    }
    if (status === 'error') {
      throw new Error(statusData.error || 'Server-side processing failed');
    }
  }

  onProgress(70, 'Downloading result\u2026');
  let downloadedChunks = [];
  let dlIndex = 0;
  let dlTotal = 1;
  let outMime = 'application/octet-stream';
  do {
    const dlResp = await fetch(`/api/media-download-chunk?jobId=${encodeURIComponent(jobId)}&chunkIndex=${dlIndex}`);
    if (!dlResp.ok) {
      const errData = await dlResp.json().catch(() => ({}));
      throw new Error(errData.error || `Couldn\u2019t download result (status ${dlResp.status})`);
    }
    const dlData = await dlResp.json();
    dlTotal = dlData.totalChunks;
    outMime = dlData.outMime || outMime;
    const binary = atob(dlData.chunkBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    downloadedChunks.push(bytes);
    dlIndex++;
    onProgress(70 + Math.round(dlIndex / dlTotal * 28), `Downloading result\u2026 ${Math.round(dlIndex / dlTotal * 100)}%`);
  } while (dlIndex < dlTotal);

  return new Blob(downloadedChunks, { type: outMime });
}
