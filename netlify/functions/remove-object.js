// Real server-side object removal (inpainting) for Passport Photo
// Maker's "remove the leaf/unwanted object" request. Uses LaMa
// (Resolution-robust Large Mask Inpainting with Fourier Convolutions,
// WACV 2022, Apache-2.0), the same real, established open-source model
// used by professional tools like IOPaint/Lama Cleaner - not a made-up
// or guessed approach.
//
// I/O CONTRACT, independently confirmed from the model's own published
// spec (not assumed): image input float32[1,3,512,512] RGB normalized
// to [0,1]; mask input float32[1,1,512,512] where 1 = region to erase,
// 0 = keep; output float32[1,3,512,512] RGB values ALREADY in [0,255]
// (no additional *255 scaling needed on the way out - a real, confirmed
// gotcha: getting this wrong would silently produce a washed-out or
// near-black result, not an error).
//
// WHY THE MODEL IS FETCHED FROM BLOBS RATHER THAN BUNDLED (unlike
// u2netp.onnx in remove-background.js): the real LaMa ONNX export
// (Carve/LaMa-ONNX, lama_fp32.onnx) is genuinely 208,044,816 bytes -
// confirmed identically across multiple independent sources including a
// matching SHA-256 from two different mirrors. That's too large to
// safely bundle alongside onnxruntime-node and sharp in the same
// deployed function package without real risk of exceeding Netlify's
// confirmed 250MB function bundle cap. See setup-inpaint-model-
// background.js for the one-time download-and-verify step that puts it
// in Blobs; this function fetches it from there into /tmp (the one
// writable, executable location in this Lambda-based environment - the
// same real constraint already solved for ffmpeg-static) on cold start,
// then reuses that same /tmp copy on warm invocations.

const { getStore, connectLambda } = require('@netlify/blobs');
const sharp = require('sharp');
const ort = require('onnxruntime-node');
const path = require('path');
const os = require('os');
const fs = require('fs');

const BLOBS_SITE_ID = '3471490a-08e9-48b0-af64-6b1e0171be73';
const MODEL_INPUT_SIZE = 512; // LaMa's fixed real input resolution, confirmed from its own published I/O contract
const EXPECTED_SIZE = 208044816;
const EXPECTED_SHA256 = '1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6';

function getBlobsStore(name) {
  return getStore({
    name,
    siteID: BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// Cached across warm invocations - both the /tmp copy and the loaded
// ONNX session, since fetching 208MB from Blobs and parsing the model
// graph are both real, measurable overhead not worth repeating per
// request when the same function instance is reused.
let modelTmpPath = null;
let sessionPromise = null;

async function getSession(event) {
  if (sessionPromise) return sessionPromise;
  if (!modelTmpPath || !fs.existsSync(modelTmpPath)) {
    connectLambda(event);
    const modelStore = getBlobsStore('ai-models');
    const metaStore = getBlobsStore('ai-model-meta');
    const meta = await metaStore.get('lama-v2', { type: 'json' }).catch(() => null);
    if (!meta || meta.size !== EXPECTED_SIZE || meta.sha256 !== EXPECTED_SHA256 || !meta.totalChunks) {
      throw new Error('The inpainting model is not set up yet — run the one-time model setup first');
    }
    const dest = path.join(os.tmpdir(), 'lama_fp32.onnx');
    const fd = fs.openSync(dest, 'w');
    let written = 0;
    try {
      for (let i = 0; i < meta.totalChunks; i++) {
        const key = `lama-v2/chunk-${String(i).padStart(4, '0')}`;
        const ab = await modelStore.get(key, { type: 'arrayBuffer' });
        if (!ab) throw new Error(`Inpainting model chunk ${i + 1}/${meta.totalChunks} is missing`);
        const buf = Buffer.from(ab); fs.writeSync(fd, buf); written += buf.length;
      }
    } finally { fs.closeSync(fd); }
    if (written !== EXPECTED_SIZE) { try { fs.unlinkSync(dest); } catch (_) {} throw new Error(`Inpainting model reconstruction failed (${written}/${EXPECTED_SIZE} bytes)`); }
    modelTmpPath = dest;
  }
  sessionPromise = ort.InferenceSession.create(modelTmpPath);
  return sessionPromise;
}

// Preprocesses the image to LaMa's fixed 512x512 input via a direct
// resize - matching the model's own real, confirmed, WORKING reference
// implementation exactly (a live Gradio demo built by the model's own
// publisher: `Image.open(jpg).resize((512, 512))`, no aspect-preserving
// letterbox/padding). An earlier draft of this function used letterbox
// padding instead, reasoning from the export README's mention of "fixed
// input shape" - that reasoning was wrong: the real, working
// implementation simply resizes directly, and matching a proven
// reference exactly is safer than an untested "improvement," especially
// for a model this size where a live test cycle is expensive.
async function resizeToModelSize(buffer) {
  const metadata = await sharp(buffer).metadata();
  const { width: origWidth, height: origHeight } = metadata;

  const resized = await sharp(buffer)
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  return { resized, origWidth, origHeight };
}

function imageBufferToTensor(rawRgbBuffer) {
  const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const floatData = new Float32Array(3 * pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    floatData[i] = rawRgbBuffer[i * 3] / 255;
    floatData[pixelCount + i] = rawRgbBuffer[i * 3 + 1] / 255;
    floatData[pixelCount * 2 + i] = rawRgbBuffer[i * 3 + 2] / 255;
  }
  return new ort.Tensor('float32', floatData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
}

// The mask arrives from the client as a single-channel image where
// white (255) means "erase this" and black (0) means "keep this" -
// matching how a real brush/marker UI naturally draws (paint the area
// you want removed). Converted to the model's expected [0,1] float
// range via the same direct resize as the image (see resizeToModelSize
// above for why a direct resize, not a letterbox, matches the real
// working reference implementation).
async function resizeMaskToModelSize(maskBuffer) {
  const resized = await sharp(maskBuffer)
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();

  const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const floatData = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    floatData[i] = resized[i] / 255;
  }
  return new ort.Tensor('float32', floatData, [1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
}

// Converts the model's raw output tensor back to a real image buffer,
// resized to the original photo's real dimensions - the inverse of
// resizeToModelSize above.
async function tensorToOutputImage(outputTensor, origWidth, origHeight) {
  const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const raw = outputTensor.data;
  const rgbBuffer = Buffer.alloc(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    // Output is already in [0,255] per the model's confirmed I/O
    // contract - only clamping (the raw float can slightly exceed the
    // valid range at extreme pixels) and rounding, no rescaling. A real,
    // documented gotcha found during research: feeding an UN-scaled
    // image in (skipping the /255 step above) silently produces a
    // near-white result with no error raised - the reverse mistake,
    // scaling the OUTPUT by 255 again here, would be the same class of
    // silent, hard-to-diagnose bug, which is why this is called out
    // explicitly rather than assumed.
    rgbBuffer[i * 3] = Math.max(0, Math.min(255, Math.round(raw[i])));
    rgbBuffer[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(raw[pixelCount + i])));
    rgbBuffer[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(raw[pixelCount * 2 + i])));
  }

  return sharp(rgbBuffer, { raw: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 3 } })
    .resize(origWidth, origHeight)
    .png()
    .toBuffer();
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const { imageBase64, maskBase64 } = payload;
    if (!imageBase64 || !maskBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing image or mask data' }) };
    }

    const inputBuffer = Buffer.from(imageBase64, 'base64');
    const maskBuffer = Buffer.from(maskBase64, 'base64');
    if (inputBuffer.length > 4 * 1024 * 1024) {
      return { statusCode: 413, body: JSON.stringify({ error: 'This image is larger than the 4MB limit for this tool - try a smaller photo.' }) };
    }

    const session = await getSession(event);
    const { resized, origWidth, origHeight } = await resizeToModelSize(inputBuffer);
    const imageTensor = imageBufferToTensor(resized);
    const maskTensor = await resizeMaskToModelSize(maskBuffer);

    // Real, confirmed input names from the model's own working reference
    // implementation (a live Gradio demo built by the model's own
    // publisher) - but that demo downloads a plain lama.onnx, which may
    // not be byte-identical to lama_fp32.onnx actually stored here, so
    // this is verified against the real session's own reported input
    // names rather than assumed blindly: falls back to positional
    // ordering (image first, mask second - the consistent order across
    // every source found during research) if the named keys aren't
    // what this exact file's graph actually calls its inputs.
    let feeds;
    if (session.inputNames.includes('l_image_') && session.inputNames.includes('l_mask_')) {
      feeds = { 'l_image_': imageTensor, 'l_mask_': maskTensor };
    } else {
      feeds = {};
      feeds[session.inputNames[0]] = imageTensor;
      feeds[session.inputNames[1]] = maskTensor;
    }
    const results = await session.run(feeds);
    const outputTensor = results[session.outputNames[0]];

    const outputBuffer = await tensorToOutputImage(outputTensor, origWidth, origHeight);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: outputBuffer.toString('base64') }),
    };
  } catch (err) {
    console.error('remove-object error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err && err.message ? err.message : 'Unknown error removing object' }),
    };
  }
};
