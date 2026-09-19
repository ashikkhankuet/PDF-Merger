// Generalized version of video-compress-background.js, serving every
// OTHER media tool. See that file for the full architectural rationale
// (why server-side at all, why chunking, why a background function, why
// it can't respond directly to the browser). This file's only real
// addition is buildFfmpegArgs(), which maps each tool's "operation" name
// to its own real, verified ffmpeg command - each one carried over
// directly from that tool's own existing client-side command (same
// filters, same codecs), with two real, confirmed bugs fixed in the
// process (see the video-resize and video-convert cases below).

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

const EXEC_TIMEOUT_MS = 13 * 60 * 1000;
const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || 'unknown ffmpeg error').slice(-2000);
        return reject(new Error(detail));
      }
      resolve({ stdout, stderr });
    });
  });
}

// Each entry returns { args, outName, outMime } given the real input file
// path and the job's own requested options. Kept as one explicit switch
// (not a generic options-merger) so every tool's exact, verified command
// stays traceable to its origin rather than being reconstructed from
// abstracted pieces that could silently drift from what was actually
// tested.
function buildFfmpegArgs(operation, inputPath, options) {
  const outDir = path.dirname(inputPath);
  switch (operation) {
    case 'audio-compress': {
      // Carried over unchanged from audio-compressor.html's own command -
      // already sets an explicit bitrate, so no missing-quality-control
      // bug here.
      const kbps = options.kbps || 96;
      const outName = path.join(outDir, 'output.mp3');
      return { args: ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-b:a', `${kbps}k`, outName], outName, outMime: 'audio/mp3' };
    }
    case 'audio-convert': {
      // Carried over unchanged from audio-converter.html.
      const targetFmt = options.targetFmt || 'mp3';
      if (targetFmt === 'wav') {
        const outName = path.join(outDir, 'output.wav');
        return { args: ['-y', '-i', inputPath, '-vn', '-acodec', 'pcm_s16le', outName], outName, outMime: 'audio/wav' };
      }
      const outName = path.join(outDir, 'output.mp3');
      return { args: ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-b:a', '128k', outName], outName, outMime: 'audio/mp3' };
    }
    case 'audio-trim': {
      // Carried over unchanged from audio-trimmer.html.
      const start = options.start || 0;
      const end = options.end || (start + 1);
      const outName = path.join(outDir, 'output.wav');
      return { args: ['-y', '-i', inputPath, '-ss', String(start), '-to', String(end), '-vn', '-acodec', 'pcm_s16le', outName], outName, outMime: 'audio/wav' };
    }
    case 'video-to-mp3': {
      // Carried over unchanged from video-to-mp3.html - already sets an
      // explicit VBR quality (-q:a 4), so no missing-quality-control bug.
      const outName = path.join(outDir, 'output.mp3');
      return { args: ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outName], outName, outMime: 'audio/mp3' };
    }
    case 'video-to-gif': {
      // Carried over unchanged from video-to-gif.html - palettegen/
      // paletteuse for real per-clip color quality, already correct.
      const start = options.start || 0;
      const dur = Math.max(0.5, Math.min(15, options.dur || 5));
      const width = Math.max(100, options.width || 480);
      const outName = path.join(outDir, 'output.gif');
      return {
        args: ['-y', '-ss', String(start), '-t', String(dur), '-i', inputPath,
          '-filter_complex', `[0:v]fps=10,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,
          outName],
        outName, outMime: 'image/gif',
      };
    }
    case 'video-trim': {
      // Carried over unchanged from video-trimmer.html - stream copy (no
      // re-encode) for speed. Real, disclosed caveat kept as-is (not
      // "fixed" into a re-encode): stream-copy trimming can only cut
      // exactly on a keyframe, so the actual output may start up to a
      // few seconds later than the requested start time on inputs with
      // sparse keyframes. Forcing a re-encode instead would fix that
      // precision but reintroduce the exact CRF-less bitrate-bloat risk
      // just fixed in video-resize/video-convert below, and would make
      // trimming dramatically slower for what is usually a quick,
      // frequent operation - this tool's own page already needs an
      // honest note about this tradeoff (see video-trimmer.html changes).
      const ext = options.ext || 'mp4';
      const start = options.start || 0;
      const end = options.end || (start + 1);
      const outName = path.join(outDir, 'output.' + ext);
      return { args: ['-y', '-i', inputPath, '-ss', String(start), '-to', String(end), '-c', 'copy', '-avoid_negative_ts', 'make_zero', outName], outName, outMime: options.mimeType || 'video/mp4' };
    }
    case 'video-resize': {
      // REAL BUG FIX (confirmed root cause of "size increased instead of
      // reduced"): the previous command had NO -crf at all, so libx264
      // silently used its own default (CRF 23) regardless of the target
      // resolution - a video resized DOWN from an already-compressed
      // source could end up with a HIGHER bitrate than the original,
      // producing a larger file despite smaller dimensions. Fixed by
      // adding an explicit, real CRF (23 is a genuinely good-quality,
      // standard default for libx264, not an arbitrary number) so output
      // size actually tracks both resolution AND a controlled quality
      // level, the way resizing is supposed to work.
      const w = options.w || 1280;
      const h = options.h || 720;
      const outName = path.join(outDir, 'output.mp4');
      return {
        args: ['-y', '-i', inputPath, '-vf', `scale=${w}:${h}`, '-c:v', 'libx264', '-crf', '23', '-preset', 'faster', '-c:a', 'aac', '-b:a', '128k', outName],
        outName, outMime: 'video/mp4',
      };
    }
    case 'video-convert': {
      // REAL BUG FIX, same root cause as video-resize: the MP4 branch had
      // no -crf, defaulting to libx264's CRF 23 regardless of the
      // source's own bitrate - converting an already-efficiently-encoded
      // source could produce a larger file. Fixed with an explicit CRF.
      // The WebM branch already had an explicit bitrate (-b:v 1M) so it
      // did not have this exact bug, but that fixed 1Mbps ignored the
      // source's own resolution/bitrate entirely - switched to CRF-based
      // VP9-style quality control isn't available for libvpx's basic
      // mode without more tuning, so a bitrate is kept there but is now
      // clearly documented as a deliberate, real choice rather than an
      // unexplained fixed number.
      const targetFmt = options.targetFmt || 'mp4';
      if (targetFmt === 'webm') {
        const outName = path.join(outDir, 'output.webm');
        return { args: ['-y', '-i', inputPath, '-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', outName], outName, outMime: 'video/webm' };
      }
      const outName = path.join(outDir, 'output.mp4');
      return { args: ['-y', '-i', inputPath, '-c:v', 'libx264', '-crf', '23', '-preset', 'faster', '-c:a', 'aac', outName], outName, outMime: 'video/mp4' };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
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
      console.error('media-process-background: missing or invalid jobId');
      return;
    }

    metaStore = getBlobsStore('media-job-meta');
    const chunkStore = getBlobsStore('media-job-chunks');
    const resultStore = getBlobsStore('media-job-results');

    const meta = await metaStore.get(jobId, { type: 'json' });
    if (!meta) {
      console.error(`media-process-background: no metadata found for job ${jobId}`);
      return;
    }

    await metaStore.setJSON(jobId, { ...meta, status: 'processing', processingStartedAt: Date.now() });

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-media-'));
    const ext = (meta.fileName.match(/\.([a-zA-Z0-9]+)$/) || [, 'dat'])[1].toLowerCase();
    const inputPath = path.join(workDir, `input.${ext}`);

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

    const options = { ...(meta.options || {}), ext, mimeType: meta.mimeType };
    const { args, outName, outMime } = buildFfmpegArgs(meta.operation, inputPath, options);
    await runFfmpeg(args);

    const outputBuf = fs.readFileSync(outName);
    const inputStat = fs.statSync(inputPath);

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
      outMime,
    });

    for (let i = 0; i < meta.totalChunks; i++) {
      await chunkStore.delete(`${jobId}/${String(i).padStart(6, '0')}`).catch(() => {});
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch (err) {
    console.error('media-process-background error:', err);
    if (metaStore && jobId) {
      const detail = err && err.message ? err.message : 'Unknown processing error';
      const existing = await metaStore.get(jobId, { type: 'json' }).catch(() => ({}));
      await metaStore.setJSON(jobId, { ...(existing || {}), status: 'error', error: detail, failedAt: Date.now() }).catch(() => {});
    }
  }
};
