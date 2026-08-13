// Shared helpers for ffmpeg.wasm-based video tools.
// Loaded after the ffmpeg CDN script on each video tool page.
let __ckFFmpeg = null;
async function ckGetFFmpeg(onProgress) {
  if (__ckFFmpeg && __ckFFmpeg.isLoaded()) return __ckFFmpeg;
  const { createFFmpeg } = FFmpeg;
  __ckFFmpeg = createFFmpeg({
    log: false,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
  });
  if (onProgress) __ckFFmpeg.setProgress(({ ratio }) => { if (ratio >= 0 && ratio <= 1) onProgress(ratio); });
  await __ckFFmpeg.load();
  return __ckFFmpeg;
}
function ckFmtSize(b) { return b < 1024*1024 ? (b/1024).toFixed(0)+' KB' : (b/1024/1024).toFixed(2)+' MB'; }
function ckExt(filename) { const m = filename.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : 'mp4'; }
