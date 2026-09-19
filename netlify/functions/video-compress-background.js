// Part 2 of the server-side video compression pipeline. The "-background"
// suffix in this file's NAME is what tells Netlify to run it as a
// Background Function - confirmed directly from Netlify's own official
// docs as the long-established mechanism (a newer in-code
// `config.background: true` property also exists, but this project's
// other functions all use the classic CommonJS exports.handler pattern -
// ocr.js, shorten.js, pdf-to-word.js - so the filename-suffix approach is
// used here too, for consistency with what's already proven working on
// this site rather than mixing in an unverified newer syntax). This is
// the ONLY way to get more than a standard function's 10-60 second
// synchronous ceiling (Background Functions get up to 15 minutes), which
// real video compression genuinely needs.
//
// WHY THIS WAS NECESSARY AT ALL (not just a speed optimization): the
// previous version of Video Compressor ran ffmpeg.wasm entirely in the
// visitor's own browser, single-threaded by necessity (multi-threaded
// WASM needs SharedArrayBuffer/cross-origin isolation, which this project
// already has configured - see netlify.toml - but ffmpeg.wasm's
// single-thread core was still used deliberately to avoid other real
// cross-browser compatibility issues). Real compression on a low-spec
// phone was measured/reported at 2-3 hours for a single video. Moving the
// actual encoding to a real server with a real, unshared CPU core removes
// that ceiling entirely - this is the same category of fix already proven
// out for PDF-to-Word (Adobe), Image-to-Text (OCR.space), and the URL
// Shortener (Netlify Blobs) elsewhere on this site.
//
// A Background Function cannot receive the video directly as its own
// invocation payload - Background Functions have their own, SMALLER 256KB
// payload limit (confirmed from Netlify's official docs), even tighter
// than a standard function's 6MB. So this function is invoked with only a
// tiny JSON payload (the job ID) and reads the actual video bytes from
// Netlify Blobs, where video-upload-chunk.js already assembled them.
//
// Background Functions "don't support response streaming because they
// don't return responses" (Netlify's own docs) - there is no way for this
// function to talk back to the browser directly. So it writes its result
// (or an error) into the job's metadata in Blobs, and the browser polls
// video-job-status.js to find out when it's done - the same
// request/poll/fetch-result shape already used by pdf-to-word.html's
// "Keep formatting" mode for its own genuinely slow, multi-step job.

const { getStore, connectLambda } = require('@netlify/blobs');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// Kept meaningfully below the real 15-minute platform ceiling for the
// same reason established in pdf-to-word.js: so THIS function's own
// specific, honest timeout message reaches the person, rather than a
// generic platform-level kill with no useful detail.
const EXEC_TIMEOUT_MS = 13 * 60 * 1000; // 13 minutes

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) {
        // ffmpeg writes its real diagnostic output to stderr even on
        // success - only surface it as the error detail on actual
        // failure, and keep it bounded so a malformed/corrupt input that
        // spams warnings can't blow up the error payload.
        const detail = (stderr || err.message || 'unknown ffmpeg error').slice(-2000);
        return reject(new Error(detail));
      }
      resolve({ stdout, stderr });
    });
  });
}

exports.handler = async (event) => {
  let jobId = null;
  let metaStore = null;
  try {
    connectLambda(event);

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      payload = {};
    }
    jobId = payload.jobId;
    if (!jobId || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      // A Background Function's invoker gets no response either way (see
      // the file-level comment on why), so there's nothing more useful to
      // do here than log and stop - there's no client waiting on this
      // specific call's own result.
      console.error('video-compress-background: missing or invalid jobId');
      return;
    }

    metaStore = getBlobsStore('video-job-meta');
    const chunkStore = getBlobsStore('video-job-chunks');
    const resultStore = getBlobsStore('video-job-results');

    const meta = await metaStore.get(jobId, { type: 'json' });
    if (!meta) {
      console.error(`video-compress-background: no metadata found for job ${jobId}`);
      return;
    }

    await metaStore.setJSON(jobId, { ...meta, status: 'processing', processingStartedAt: Date.now() });

    // Reassemble the chunks in order into one real file on the function's
    // own local disk (/tmp is the one writable, real filesystem location
    // available to a Netlify Function, matching standard Lambda
    // conventions) - ffmpeg needs a real file path, not an in-memory
    // buffer, for reliable format probing on arbitrary real-world inputs.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-video-'));
    const ext = (meta.fileName.match(/\.([a-zA-Z0-9]+)$/) || [, 'mp4'])[1].toLowerCase();
    const inputPath = path.join(workDir, `input.${ext}`);
    const outputPath = path.join(workDir, 'output.mp4');

    const writeStream = fs.createWriteStream(inputPath);
    for (let i = 0; i < meta.totalChunks; i++) {
      const key = `${jobId}/${String(i).padStart(6, '0')}`;
      const chunkBuf = await chunkStore.get(key, { type: 'arrayBuffer' });
      if (!chunkBuf) throw new Error(`Missing chunk ${i} of ${meta.totalChunks} - upload may be incomplete`);
      await new Promise((resolve, reject) => {
        writeStream.write(Buffer.from(chunkBuf), (err) => err ? reject(err) : resolve());
      });
    }
    await new Promise((resolve, reject) => {
      writeStream.end((err) => err ? reject(err) : resolve());
    });

    // Same real, verified encoder settings as the client-side tool's own
    // "Balanced" default (see video-compressor.html) - crf/preset/scale
    // are read from the job's own requested options rather than
    // hardcoded, so the same quality/speed choices the person made on the
    // page still apply here.
    const crf = String(meta.options && meta.options.crf || 28);
    const preset = (meta.options && meta.options.fastMode) ? 'veryfast' : 'medium';
    const scaleArgs = (meta.options && meta.options.capRes)
      ? ['-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease"]
      : [];

    await runFfmpeg([
      '-y', '-i', inputPath,
      '-vcodec', 'libx264', '-crf', crf, '-preset', preset,
      ...scaleArgs,
      '-acodec', 'aac', '-b:a', '128k',
      outputPath,
    ]);

    const outputBuf = fs.readFileSync(outputPath);
    const inputStat = fs.statSync(inputPath);

    // Pre-split the compressed result into download-ready chunks ONCE,
    // here, rather than making video-download-chunk.js re-read and
    // re-slice the entire result blob on every single chunk request it
    // serves - real, avoidable repeated work for a large file requested
    // in many pieces. Same 4MB size as video-download-chunk.js expects;
    // kept as a literal here rather than importing from that file, since
    // Netlify bundles each function independently and duplicating one
    // small constant is simpler and more reliable than sharing a module
    // across two separately-bundled functions.
    const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
    const totalDownloadChunks = Math.max(1, Math.ceil(outputBuf.length / DOWNLOAD_CHUNK_BYTES));
    for (let i = 0; i < totalDownloadChunks; i++) {
      const start = i * DOWNLOAD_CHUNK_BYTES;
      const slice = outputBuf.subarray(start, Math.min(start + DOWNLOAD_CHUNK_BYTES, outputBuf.length));
      await resultStore.set(`${jobId}/${String(i).padStart(6, '0')}`, slice);
    }

    await metaStore.setJSON(jobId, {
      ...meta,
      status: 'done',
      completedAt: Date.now(),
      originalSize: inputStat.size,
      compressedSize: outputBuf.length,
      resultTotalChunks: totalDownloadChunks,
    });

    // Clean up the (now unneeded) chunk blobs - real storage cost, not
    // just tidiness, since Blobs has real per-site storage limits and
    // every job's raw upload has no reason to persist once compression
    // has produced the real result.
    for (let i = 0; i < meta.totalChunks; i++) {
      await chunkStore.delete(`${jobId}/${String(i).padStart(6, '0')}`).catch(() => {});
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch (err) {
    console.error('video-compress-background error:', err);
    if (metaStore && jobId) {
      const detail = err && err.message ? err.message : 'Unknown compression error';
      const existing = await metaStore.get(jobId, { type: 'json' }).catch(() => ({}));
      await metaStore.setJSON(jobId, { ...(existing || {}), status: 'error', error: detail, failedAt: Date.now() }).catch(() => {});
    }
  }
};


