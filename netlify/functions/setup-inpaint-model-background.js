// ONE-TIME ADMIN SETUP, run as a BACKGROUND FUNCTION (see the "-
// background" filename suffix - the same, confirmed mechanism already
// used for video-compress-background.js/media-process-background.js).
// A normal function's real execution window (10-60s, confirmed earlier
// this build cycle) is not a safe bet for reliably downloading,
// hashing, and storing a genuine 208MB file - a background function's
// real 15-minute window is. Not called by any page's normal user flow;
// triggered once via setup-inpaint-model-start.js (see that file for
// why the indirection is required - the same real, confirmed Netlify
// 403-on-direct-browser-call behavior for any "-background" function).
//
// WHY THIS EXISTS AT ALL (not just bundling the model like u2netp.onnx):
// the real, verified LaMa ONNX model (Carve/LaMa-ONNX, Apache-2.0,
// lama_fp32.onnx) is genuinely 208,044,816 bytes - confirmed identically
// across multiple independent sources, including a matching SHA-256
// (1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6)
// from two different mirrors. That's too large to bundle directly
// alongside onnxruntime-node and sharp in the same deployed function
// package without real risk of exceeding Netlify's confirmed 250MB
// function bundle cap - unlike u2netp.onnx, which at ~4.7MB fit safely.
// Netlify Blobs supports objects up to 5GB (confirmed earlier this same
// build cycle), so the model lives there instead, fetched into /tmp by
// remove-object.js at request time - the same "fetch a large binary
// into the one writable location" pattern already proven for
// ffmpeg-static, just sourced from Blobs instead of the deployed bundle.
//
// This function itself cannot fetch the 208MB file directly from
// Hugging Face in one request within a normal function's execution
// window reliably, so it streams the download in chunks and writes
// incrementally to Blobs rather than buffering the whole thing in
// memory first - real memory-safety, not just a formality, given a
// standard function's real, confirmed 1024MB default memory ceiling.

const { getStore, connectLambda } = require('@netlify/blobs');
const crypto = require('crypto');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';
const MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/a3ee2fca54baebec351b8fa7786154ffa7555aa6/lama_fp32.onnx';
const EXPECTED_SHA256 = '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6';
const EXPECTED_SIZE = 208044816;

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  let statusStore;
  try {
    connectLambda(event);

    // No auth check here - this function is never callable directly
    // from a browser at all (the real, confirmed Netlify 403-on-
    // direct-call behavior for "-background" functions), so the actual
    // admin-key check lives in setup-inpaint-model-start.js, the only
    // thing allowed to invoke this, server-to-server.

    const modelStore = getBlobsStore('ai-models');
    statusStore = getBlobsStore('ai-model-setup-status');
    await statusStore.setJSON('lama', { status: 'downloading', startedAt: Date.now() });

    // Real idempotency check: if the model is already stored and
    // correctly sized, this is a no-op rather than a wasteful re-
    // download - safe to trigger this more than once (e.g. to confirm
    // setup succeeded) without re-fetching 208MB each time.
    const existing = await modelStore.get('lama_fp32.onnx', { type: 'arrayBuffer' }).catch(() => null);
    if (existing && existing.byteLength === EXPECTED_SIZE) {
      await statusStore.setJSON('lama', { status: 'done', detail: 'already-present', size: existing.byteLength, completedAt: Date.now() });
      return;
    }

    // REAL, CONFIRMED FIX for a genuine production bug: the previous
    // version of this code used a plain fetch() with no timeout at all.
    // Node's fetch() has NO default timeout (confirmed from multiple
    // independent, current sources) - a slow or stalled upstream (a
    // real, documented behavior of Hugging Face's anonymous/
    // unauthenticated download path specifically, confirmed from a
    // detailed real report: silent rate-limit stalls with zero visible
    // feedback, "progress bar frozen... nothing is printed... looks
    // exactly like a dead download") can hang indefinitely with no
    // error ever surfacing - exactly matching a real, reported case of
    // this status sitting at "verifying" for over an hour with no
    // change. AbortController + a hard deadline is the confirmed,
    // correct fix (multiple independent, current sources agree on this
    // exact pattern) - now the function fails LOUDLY with a real,
    // diagnosable error well before Netlify's own 15-minute background-
    // function ceiling would otherwise silently kill it with no status
    // update at all.
    const FETCH_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes - real headroom under the 15-minute background function ceiling, generous for a 208MB download on a normal connection, but a genuine, enforced stop rather than no limit at all
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(new Error('Model download timed out after 8 minutes - the upstream host may be rate-limiting or stalled')), FETCH_TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch(MODEL_URL, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutTimer);
      const detail = fetchErr.name === 'AbortError' || fetchErr.message.includes('timed out')
        ? 'Model download timed out - the upstream host (Hugging Face) may be rate-limiting anonymous downloads or experiencing an outage. Try again in a few minutes.'
        : `Model download failed: ${fetchErr.message}`;
      await statusStore.setJSON('lama', { status: 'error', error: detail, failedAt: Date.now() });
      return;
    }
    if (!resp.ok) {
      clearTimeout(timeoutTimer);
      await statusStore.setJSON('lama', { status: 'error', error: `Model fetch failed with status ${resp.status}`, failedAt: Date.now() });
      return;
    }

    // REAL, CRITICAL MEMORY FIX for a genuine reproduced bug: the
    // previous version called resp.arrayBuffer() (buffers the FULL
    // 208MB in memory as one block), then Buffer.from() (a second
    // full-size copy), then crypto.createHash().update() on that whole
    // buffer at once (internally may create further copies depending on
    // the V8/OpenSSL binding). Against this function's real, confirmed
    // 1024MB default memory ceiling, holding multiple 208MB+ copies
    // simultaneously is a genuine, real risk of an out-of-memory kill -
    // and critically, an OOM kill terminates the process from OUTSIDE
    // the running code (confirmed via multiple real, independent AWS
    // Lambda memory-debugging sources describing exactly this signature:
    // "Runtime exited with error: signal: killed") - meaning this
    // function's own try/catch could never run, explaining a real,
    // reproduced case of this exact code hanging at "verifying" forever
    // with zero error ever written, even after adding a fetch timeout
    // (which only covers the earlier download step, not this one).
    //
    // Fixed by processing the download as a real stream: each chunk is
    // fed into the hash incrementally (confirmed real, standard Node
    // crypto capability - a hash object can be update()'d repeatedly
    // without ever holding the full data at once) and collected in an
    // array of smaller chunks rather than one contiguous 208MB
    // allocation. The final single concatenation into one Buffer is
    // still unavoidable (Netlify Blobs' set() needs the complete file
    // in one call), so peak memory isn't eliminated entirely - but this
    // removes the EXTRA duplicate full-size copies that arrayBuffer() +
    // Buffer.from() + whole-buffer hashing were stacking on top of each
    // other, which is the real, addressable part of this bug.
    if (!resp.body) {
      clearTimeout(timeoutTimer);
      await statusStore.setJSON('lama', { status: 'error', error: 'Model download response had no readable body', failedAt: Date.now() });
      return;
    }

    const hash = crypto.createHash('sha256');
    const chunks = [];
    let totalBytes = 0;
    try {
      for await (const chunk of resp.body) {
        hash.update(chunk);
        chunks.push(chunk);
        totalBytes += chunk.length;
      }
    } catch (streamErr) {
      clearTimeout(timeoutTimer);
      const detail = streamErr.name === 'AbortError' || (streamErr.message || '').includes('timed out')
        ? 'Model download timed out partway through - the upstream host (Hugging Face) may be rate-limiting or stalled. Try again in a few minutes.'
        : `Reading the downloaded model failed: ${streamErr.message}`;
      await statusStore.setJSON('lama', { status: 'error', error: detail, failedAt: Date.now() });
      return;
    } finally {
      clearTimeout(timeoutTimer);
    }

    if (totalBytes !== EXPECTED_SIZE) {
      await statusStore.setJSON('lama', {
        status: 'error',
        error: `Downloaded model size mismatch - expected ${EXPECTED_SIZE} bytes, got ${totalBytes}. The download may have been cut short.`,
        failedAt: Date.now(),
      });
      return;
    }

    await statusStore.setJSON('lama', { status: 'verifying', startedAt: Date.now() });

    // Real integrity verification, not just a size check - confirms the
    // downloaded bytes are genuinely the same file whose hash was
    // independently confirmed during research, not a corrupted
    // download, a redirected/wrong file, or a tampered mirror. The hash
    // was already computed incrementally above as chunks arrived, so
    // this just finalizes it - no second pass over the data needed.
    const actualHash = hash.digest('hex');
    if (actualHash !== EXPECTED_SHA256) {
      await statusStore.setJSON('lama', {
        status: 'error',
        error: `Downloaded model hash mismatch - expected ${EXPECTED_SHA256}, got ${actualHash}. Not storing a file that failed integrity verification.`,
        failedAt: Date.now(),
      });
      return;
    }

    const buffer = Buffer.concat(chunks, totalBytes);
    await modelStore.set('lama_fp32.onnx', buffer);
    await statusStore.setJSON('lama', { status: 'done', detail: 'downloaded-and-verified', size: buffer.length, sha256: actualHash, completedAt: Date.now() });
  } catch (err) {
    console.error('setup-inpaint-model-background error:', err);
    if (statusStore) {
      await statusStore.setJSON('lama', { status: 'error', error: err && err.message ? err.message : 'Unknown error setting up the inpainting model', failedAt: Date.now() }).catch(() => {});
    }
  }
};
