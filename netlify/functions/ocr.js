// Server-side OCR fallback using OCR.space's free API.

//
// WHY OCR.space AND NOT A CLOUD PROVIDER API: OCR.space's free tier
// (25,000 requests/month) requires NO credit card to sign up and get an API
// key — a real, deliberate choice over Google Cloud Vision (which requires
// billing details on file even to use its free tier) to avoid any billing
// surprise risk for a free public tool.
//
// ENGINE CHOICE: OCR.space offers multiple engines. Engine 3 gives the
// broadest language support (200+ languages including Bengali) and the best
// accuracy on tables/handwriting/stylized text, but has documented reports
// of occasionally taking 15-60+ seconds on some images. Engine 2 is fast and
// reliable but has a much shorter language list. Netlify Functions have a
// hard 10-second execution ceiling on this site's plan - Engine 3's worst
// case can exceed that. Rather than silently picking one and accepting
// either the accuracy loss or the timeout risk, this function accepts an
// `engine` parameter and lets the FRONT END orchestrate a two-step retry:
// try engine 3 first for the best shot at accuracy, and if that times out,
// the front end calls again with engine 2 for a fast, reliable fallback -
// each attempt gets its own full, real timeout budget this way, rather than
// splitting one short window across both and shortchanging both.
//
// TIMEOUT HANDLING: this function sets its OWN abort timeout, comfortably
// under Netlify's platform-level 10-second ceiling, so a slow upstream
// response produces a clear, specific error message from this code instead
// of an opaque platform-level 502 with no useful information.
//
// WHY THE WHOLE HANDLER IS WRAPPED IN ONE OUTER TRY/CATCH: a real, confirmed
// bug in an earlier version of this file crashed with a bare 500 and ZERO
// logged output - diagnosed via the actual Netlify function log showing a
// suspiciously fast ~7ms duration (too fast to have even attempted a real
// network call) and nothing printed, which is the signature of an exception
// thrown before any of this code's own try/catch or console.error calls ran
// (the network-call try/catch alone didn't cover it). Root cause: this
// function's Node runtime did not have native fetch available (native fetch
// only lands in Node 18+, and Netlify's default function runtime version is
// tied to whatever Node version the SITE'S BUILD used, which was never
// explicitly pinned for this project). Wrapping the entire handler body -
// not just the network call - guarantees ANY unexpected failure (this one,
// or a different one in the future) still returns a real, readable JSON
// error and gets logged, rather than crashing silently again.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (typeof fetch !== 'function') {
      // This exact condition caused a real, confirmed silent-crash incident
      // (see file header) - now caught explicitly with a clear, diagnosable
      // message instead of an opaque platform crash.
      console.error('ConvertKoro OCR function: global fetch is not available in this runtime.');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server runtime is missing fetch support - needs AWS_LAMBDA_JS_RUNTIME set to nodejs18.x or later' }),
      };
    }

    const apiKey = process.env.OCRSPACE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server is missing its OCR API key configuration' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const base64Image = (body.image || '').trim();
    if (!base64Image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // OCR.space's free tier caps uploads at 1MB - fail fast with a clear
    // message rather than let a doomed request run out the clock.
    const MAX_BASE64_LENGTH = 1_400_000; // ~1MB decoded, base64 adds ~33% overhead
    if (base64Image.length > MAX_BASE64_LENGTH) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Image is too large for the enhanced OCR service (1MB limit) — try a smaller photo.' }),
      };
    }

    // engine: 2 (fast/reliable, shorter language list) or 3 (best accuracy,
    // 200+ languages incl. Bengali, but can be slow on some images). Defaults
    // to 3 since accuracy/language coverage matters more than speed for this
    // tool's actual use case - see the front end for the fallback-to-2 retry.
    const engine = body.engine === 2 ? 2 : 3;

    // Guessing the mime type from the data URL prefix the front end may have
    // included; default to PNG (OCR.space auto-detects from content either way).
    const mimeType = (body.mimeType || 'image/png').trim();

    // AbortController timeout kept comfortably under Netlify's 10s ceiling for
    // this function, so a slow OCR.space response is caught and reported by
    // THIS code with a specific, honest message rather than Netlify killing
    // the function first with a generic, unhelpful 502.
    const controller = new AbortController();
    const timeoutMs = 9000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const formBody = new URLSearchParams();
      formBody.set('base64Image', `data:${mimeType};base64,${base64Image}`);
      formBody.set('OCREngine', String(engine));
      formBody.set('language', 'auto');
      formBody.set('scale', 'true');
      formBody.set('isTable', 'true');
      formBody.set('detectOrientation', 'true');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const rawBody = await response.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch (parseErr) {
        // A non-JSON response body (e.g. an HTML error page, or a plain-text
        // rejection) was a real, previously-unhandled possibility here -
        // response.json() would throw on this and land silently in the outer
        // catch with no useful detail. Logging the raw body (truncated) makes
        // this diagnosable instead of indistinguishable from a crash.
        console.error('ConvertKoro OCR function: OCR.space returned a non-JSON response.',
          'HTTP status:', response.status, 'Body (truncated):', rawBody.slice(0, 500));
        return {
          statusCode: 502,
          body: JSON.stringify({ error: `OCR service returned an unexpected response (HTTP ${response.status})` }),
        };
      }
      // Log the raw response status + a summary here, always - this was the
      // real remaining gap after the fetch-availability fix: a genuine
      // response FROM OCR.space (success, error, or malformed) was reaching
      // this point but never getting logged, so a real 502/other failure
      // here looked identical to a silent crash from the outside. Logging
      // this unconditionally (not just on error) also means a genuine 200
      // is now visible too, confirming the request really completed.
      console.log('ConvertKoro OCR function: OCR.space HTTP status:', response.status,
        'IsErroredOnProcessing:', data.IsErroredOnProcessing, 'OCRExitCode:', data.OCRExitCode);

      if (data.IsErroredOnProcessing) {
        const message = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : (data.ErrorMessage || 'OCR service returned an error');
        console.error('ConvertKoro OCR function: OCR.space reported a processing error:', message);
        return { statusCode: 502, body: JSON.stringify({ error: message }) };
      }

      const results = data.ParsedResults || [];
      const text = results.map(r => r.ParsedText || '').join('\n').trim();

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, engine }),
      };
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        return {
          statusCode: 504,
          body: JSON.stringify({ error: 'timeout', engine }),
        };
      }
      console.error('ConvertKoro OCR function: request to OCR.space failed.', e);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to reach the OCR service, please try again' }) };
    }
  } catch (outerErr) {
    // Final safety net: guarantees a real, logged, JSON error response no
    // matter what goes wrong anywhere above - this is what should have
    // caught the original silent-crash bug at the platform level even
    // before the fetch-availability check was added.
    console.error('ConvertKoro OCR function: unexpected top-level error.', outerErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error, please try again' }),
    };
  }
};
