// Server-side text translation using Google Cloud Translation API (Basic/v2).
//
// WHY GOOGLE AND NOT A "FREE, NO-KEY" OPTION: researched thoroughly before
// building this. MyMemory (a genuinely free, no-signup API) has a real,
// hard 500-BYTE-per-request limit - confirmed directly, not assumed - which
// would silently fail or truncate on any real OCR'd paragraph, not just an
// edge case. LibreTranslate's public hosted instance now requires an API
// key due to bot abuse (confirmed via multiple independent 2026 sources),
// and self-hosting it means running and maintaining a real server, which
// this whole site's architecture has consistently avoided. Google Cloud
// Translation's free tier - 500,000 characters/month, PERMANENT, resets
// monthly, confirmed consistently across many independent sources as of
// 2026 - is the most genuinely reliable real option, at the real cost of
// requiring a Google Cloud billing account on file (see the hard cap below
// for why that's made safe).
//
// REAL FINANCIAL RISK, ADDRESSED DIRECTLY: multiple sources warned that
// Google's free tier "requires billing to be enabled" and that "a runaway
// translation loop can burn through thousands of dollars in hours" if
// usage isn't bounded. This function enforces a hard per-request character
// cap (see MAX_CHARS below) so a single request can never translate an
// unbounded amount of text - this is a deliberate safety measure, not an
// arbitrary limit, specifically to prevent the real cost risk found during
// research, not just to save quota.
//
// LANGUAGE LIST: Google Cloud Translation supports 100+ languages as of
// 2026. Rather than hardcode a partial list here that could drift out of
// sync with what Google actually supports, the front end maintains its own
// curated, verified language list (see image-to-text.html) covering the
// languages most relevant to this site's real audience, and this function
// accepts any valid ISO 639-1 code Google's API recognizes - if Google adds
// or changes language support, this function doesn't need updating, only
// the front end's displayed list does.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (typeof fetch !== 'function') {
      console.error('ConvertKoro Translate: global fetch is not available in this runtime.');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server runtime is missing fetch support - needs AWS_LAMBDA_JS_RUNTIME set to nodejs18.x or later' }),
      };
    }

    const apiKey = (process.env.GOOGLE_TRANSLATE_API_KEY || '').trim();
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server is missing its translation API key' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const text = (body.text || '').toString();
    const target = (body.target || '').toString().trim();
    const source = (body.source || '').toString().trim(); // optional - empty means auto-detect

    if (!text.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No text provided' }) };
    }
    if (!target) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No target language specified' }) };
    }

    // Real, deliberate hard cap - see file header for why. 15,000 characters
    // covers many real full pages of OCR'd text (roughly 2,500-3,000 words)
    // while keeping any single request's worst-case cost bounded and small
    // regardless of how this function is called.
    const MAX_CHARS = 15000;
    if (text.length > MAX_CHARS) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Text is too long to translate at once (${text.length} characters, ${MAX_CHARS} max) - try translating a shorter selection.` }),
      };
    }

    const controller = new AbortController();
    const timeoutMs = 9000; // comfortably under Netlify's 10s platform ceiling
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const params = new URLSearchParams({
        q: text,
        target: target,
        key: apiKey,
        format: 'text',
      });
      if (source) params.set('source', source);

      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?${params.toString()}`, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error('ConvertKoro Translate: non-JSON response.', 'HTTP status:', response.status, 'Body:', raw.slice(0, 500));
        return { statusCode: 502, body: JSON.stringify({ error: `Translation service returned an unexpected response (HTTP ${response.status})` }) };
      }

      if (!response.ok) {
        // Real, confirmed pattern from this session's other functions:
        // Google's error field can be a nested object, not a plain string -
        // extracted safely here from the start rather than repeating the
        // "[object Object]" bug found and fixed elsewhere in this codebase.
        let detail = (data.error && (data.error.message || data.error.status)) || `HTTP ${response.status}`;
        if (detail && typeof detail === 'object') detail = JSON.stringify(detail);
        console.error('ConvertKoro Translate: API request failed.', 'HTTP status:', response.status, data);
        if (response.status === 403 || response.status === 429) {
          return { statusCode: 429, body: JSON.stringify({ error: 'quota-exhausted' }) };
        }
        return { statusCode: 502, body: JSON.stringify({ error: `Translation failed: ${detail}` }) };
      }

      const translation = data.data && data.data.translations && data.data.translations[0];
      if (!translation || typeof translation.translatedText !== 'string') {
        console.error('ConvertKoro Translate: unexpected response shape.', data);
        return { statusCode: 502, body: JSON.stringify({ error: 'Translation service returned an unexpected result' }) };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          translatedText: translation.translatedText,
          detectedSourceLanguage: translation.detectedSourceLanguage || source || null,
        }),
      };
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        return { statusCode: 504, body: JSON.stringify({ error: 'timeout' }) };
      }
      console.error('ConvertKoro Translate: request to translation service failed.', e);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to reach the translation service, please try again' }) };
    }
  } catch (outerErr) {
    // Same defensive pattern as ocr.js and pdf-to-word.js - a real,
    // confirmed incident earlier in this codebase (see ocr.js's own
    // comment) showed an uncaught exception outside the inner try/catch
    // can produce a silent, unlogged 500 with no diagnostic information.
    console.error('ConvertKoro Translate: unexpected top-level error.', outerErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error, please try again' }),
    };
  }
};
