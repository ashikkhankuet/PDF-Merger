// ConvertKoro Media Engine v2 — shared by all 9 media tools.
// Architecture: a ConvertKoro-owned wrapper + same-origin Blob worker.
// Only the pinned single-thread FFmpeg core (JS + WASM) is downloaded.
// Multiple reputable mirrors are tried; no remote Worker is ever constructed.
// This avoids the cross-origin Worker failure that broke the previous deployment.

const CK_CORE_VERSION = '0.12.10';
const CK_CORE_MIRRORS = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CK_CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${CK_CORE_VERSION}/dist/umd`,
  `https://cdnjs.cloudflare.com/ajax/libs/ffmpeg-core/${CK_CORE_VERSION}/umd`
];

let __ckFFmpeg = null;
let __ckLoadPromise = null;
let __ckProgressCallbacks = new Set();
let __ckCoreBlobURLs = [];

async function ckFetchFirst(paths, mimeType) {
  let lastErr = null;
  for (const base of CK_CORE_MIRRORS) {
    for (const name of paths) {
      try {
        const url = `${base}/${name}`;
        const r = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = await r.arrayBuffer();
        if (!b.byteLength) throw new Error('empty response');
        const blobURL = URL.createObjectURL(new Blob([b], { type: mimeType }));
        __ckCoreBlobURLs.push(blobURL);
        return blobURL;
      } catch (e) { lastErr = e; }
    }
  }
  throw new Error(`Unable to load the media engine. ${lastErr ? lastErr.message : ''}`.trim());
}

function ckWorkerSource() {
  // Self-contained classic Worker. No @ffmpeg/ffmpeg CDN bundle is needed.
  return `
let core = null;
const send=(id,type,data,transfer)=>self.postMessage({id,type,data},transfer||[]);
self.onmessage=async(e)=>{
  const {id,type,data}=e.data;
  try {
    if(type==='load'){
      if(!core){
        importScripts(data.coreURL);
        if(typeof self.createFFmpegCore!=='function') throw new Error('FFmpeg core factory not found');
        core=await self.createFFmpegCore({mainScriptUrlOrBlob:data.coreURL+'#'+btoa(JSON.stringify({wasmURL:data.wasmURL,workerURL:''}))});
        core.setLogger(d=>send(0,'log',d));
        core.setProgress(d=>send(0,'progress',d));
      }
      return send(id,'load',true);
    }
    if(!core) throw new Error('Media engine is not loaded');
    if(type==='writeFile') { core.FS.writeFile(data.path,data.bytes); return send(id,type,true); }
    if(type==='readFile') { const out=core.FS.readFile(data.path); return send(id,type,out,[out.buffer]); }
    if(type==='deleteFile') { try{core.FS.unlink(data.path);}catch(_){} return send(id,type,true); }
    if(type==='exec') {
      core.setTimeout(data.timeout == null ? -1 : data.timeout);
      core.exec(...data.args);
      const ret=core.ret;
      core.reset();
      return send(id,type,ret);
    }
    throw new Error('Unknown media-engine command');
  } catch(err) { send(id,'error',String(err && (err.message||err) || 'Unknown error')); }
};`;
}

class CKFFmpeg {
  constructor() {
    this.worker = null;
    this.seq = 1;
    this.pending = new Map();
    this.listeners = { log: [], progress: [] };
    this.loaded = false;
  }
  on(type, cb) { if (this.listeners[type]) this.listeners[type].push(cb); }
  _request(type, data, transfer) {
    return new Promise((resolve, reject) => {
      const id = this.seq++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, data }, transfer || []);
    });
  }
  async load({ coreURL, wasmURL }) {
    if (!this.worker) {
      const workerURL = URL.createObjectURL(new Blob([ckWorkerSource()], { type: 'text/javascript' }));
      this.worker = new Worker(workerURL); // blob: is same-origin with the page
      URL.revokeObjectURL(workerURL);
      this.worker.onmessage = ({ data: { id, type, data } }) => {
        if (type === 'log' || type === 'progress') {
          (this.listeners[type] || []).forEach(fn => { try { fn(data); } catch (_) {} });
          return;
        }
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        type === 'error' ? p.reject(new Error(data)) : p.resolve(data);
      };
      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'Media worker failed');
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
    }
    await this._request('load', { coreURL, wasmURL });
    this.loaded = true;
    return true;
  }
  async writeFile(path, bytes) {
    // Transfer a copy so callers do not unexpectedly lose their buffer.
    const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
    return this._request('writeFile', { path, bytes: copy }, [copy.buffer]);
  }
  readFile(path) { return this._request('readFile', { path }); }
  deleteFile(path) { return this._request('deleteFile', { path }); }
  exec(args, timeout = -1) { return this._request('exec', { args, timeout }); }
  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null; this.loaded = false;
  }
}

function ckFetchFile(file) {
  if (file instanceof Uint8Array) return Promise.resolve(file);
  if (file instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(file));
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer().then(b => new Uint8Array(b));
  return fetch(file).then(async r => {
    if (!r.ok) throw new Error(`Unable to read input (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  });
}

function ckMediaCompatibility(file) {
  if (!window.WebAssembly || !window.Worker || !window.Blob || !window.URL) {
    return { ok:false, message:'This browser does not support the media processing engine. Please use a current Chrome, Edge, Firefox, or Safari browser.' };
  }
  // ffmpeg.wasm documents 2 GB as a hard WebAssembly input limit.
  if (file && file.size >= 2 * 1024 * 1024 * 1024) {
    return { ok:false, message:'This file is 2 GB or larger, which exceeds the browser media engine limit.' };
  }
  return { ok:true, message:'' };
}

async function ckGetFFmpeg(onProgress) {
  if (onProgress) __ckProgressCallbacks.add(onProgress);
  if (__ckFFmpeg && __ckFFmpeg.loaded) return __ckFFmpeg;
  if (__ckLoadPromise) return __ckLoadPromise;

  __ckLoadPromise = (async () => {
    // Prefer the unminified official core name. cdnjs also exposes .min.js,
    // so keep it as a mirror-specific fallback.
    const [coreURL, wasmURL] = await Promise.all([
      ckFetchFirst(['ffmpeg-core.js', 'ffmpeg-core.min.js'], 'text/javascript'),
      ckFetchFirst(['ffmpeg-core.wasm'], 'application/wasm')
    ]);
    const ff = new CKFFmpeg();
    ff.on('progress', ({ progress }) => {
      if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
        __ckProgressCallbacks.forEach(cb => { try { cb(progress); } catch (_) {} });
      }
    });
    ff.on('log', ({ message }) => console.debug('[ConvertKoro media]', message));
    await ff.load({ coreURL, wasmURL });
    __ckFFmpeg = ff;
    return ff;
  })();

  try { return await __ckLoadPromise; }
  catch (e) {
    if (__ckFFmpeg) __ckFFmpeg.terminate();
    __ckFFmpeg = null; __ckLoadPromise = null;
    throw e;
  }
}

function ckFmtSize(b) { return b < 1024*1024 ? (b/1024).toFixed(0)+' KB' : (b/1024/1024).toFixed(2)+' MB'; }
function ckExt(filename) { const m = filename.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : 'mp4'; }
