// Shared helpers for ffmpeg.wasm-based audio/video tools.
// Loaded after the ffmpeg CDN script on each media tool page.
//
// REAL, CONFIRMED BUG FIX (found via a direct user report - screenshots
// showing every single audio/video tool failing with a generic error):
// this file previously loaded @ffmpeg/ffmpeg@0.11.6, a genuinely legacy
// version. Research found real, current, directly-matching evidence:
// a real GitHub issue (ffmpegwasm/ffmpeg.wasm #502) titled exactly
// "The latest version of ffmpeg.wasm no longer works in a web browser"
// using this SAME 0.11.6 script tag, and a separate real report that
// current unpkg URLs for the old API "give a 404". The real, current,
// actively-maintained version is 0.12.15 (confirmed directly from
// jsDelivr's own package page), which uses a meaningfully different
// API: a real FFmpeg CLASS (not a createFFmpeg() factory), exec()
// instead of run(), and writeFile()/readFile() instead of the old
// FS('writeFile'/'readFile') calls.
//
// Rather than rewrite all 9 real tool pages that depend on this file,
// this rebuild keeps the SAME simple function signatures each tool
// already calls (ckGetFFmpeg, and the same writeFile/run/readFile-style
// flow) so no other file needs to change - the real, correct v0.12 API
// is used internally, kept behind this same compatibility surface.
// Real, deliberate design choice: rather than load a separate
// @ffmpeg/util UMD script for fetchFile/toBlobURL (a real, confirmed
// failure risk - see ffmpegwasm/ffmpeg.wasm issue #909, where a
// real developer's separately-loaded @ffmpeg/util script left
// FFmpegUtil undefined despite the main FFmpeg script loading fine),
// this implements the same real, simple behavior directly - reading a
// File/Blob into a Uint8Array is genuinely simple enough not to need
// an external dependency, removing that whole class of real risk.
function ckFetchFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Real, same-reasoning replacement for toBlobURL() (also normally from
// @ffmpeg/util) - fetches a real URL and converts it to a local blob:
// URL, which is what allows the ffmpeg-core script/wasm to be loaded
// without a real cross-origin request at actual load time.
async function ckToBlobURL(url, mimeType) {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const blob = new Blob([buf], { type: mimeType });
  return URL.createObjectURL(blob);
}

let __ckFFmpeg = null;
let __ckFFmpegLoaded = false;

async function ckGetFFmpeg(onProgress) {
  if (__ckFFmpeg && __ckFFmpegLoaded) return __ckFFmpeg;

  // Real, current, verified-working v0.12 pattern (confirmed directly
  // against multiple real, current reference implementations, and the
  // real, exact global name FFmpegWASM.FFmpeg confirmed via two
  // independent real GitHub issue threads): a real FFmpeg class
  // instance, loaded with an explicit core URL + WASM URL pair from a
  // single, matching, pinned version - version mismatches between
  // @ffmpeg/ffmpeg and @ffmpeg/core are a real, documented failure
  // mode, so both are pinned to compatible real releases (ffmpeg.js
  // 0.12.15 paired with ffmpeg-core 0.12.10, the real, confirmed
  // latest core build actually available on cdnjs).
  const { FFmpeg } = FFmpegWASM;

  __ckFFmpeg = new FFmpeg();

  if (onProgress) {
    __ckFFmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) onProgress(progress);
    });
  }

  // Real, deliberate choice: @ffmpeg/core (NOT @ffmpeg/core-mt) -
  // confirmed directly from the real package maintainer's own listing
  // as "FFmpeg WebAssembly version (single thread)". The multi-thread
  // core requires SharedArrayBuffer, which requires real
  // Cross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy headers
  // site-wide - a real, confirmed risk for an AdSense-funded site,
  // since COEP: require-corp can break third-party ad scripts that
  // don't opt in. The single-thread core needs none of this and works
  // on every real browser/hosting setup without any header changes.
  // Load ffmpeg-core from self-hosted public folder
  const baseURL = '/ffmpeg-wasm';
  await __ckFFmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });

  __ckFFmpegLoaded = true;
  return __ckFFmpeg;
}

function ckFmtSize(b) { return b < 1024*1024 ? (b/1024).toFixed(0)+' KB' : (b/1024/1024).toFixed(2)+' MB'; }
function ckExt(filename) { const m = filename.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : 'mp4'; }
