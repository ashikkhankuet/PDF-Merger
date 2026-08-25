// Server-side, format-preserving PDF -> DOCX conversion via Adobe PDF
// Services API. This function is used ONLY when the user explicitly
// chooses "Keep formatting" mode on pdf-to-word.html - the default "Text
// only" mode never calls this function at all and keeps working entirely
// client-side (pdf.js + JSZip, unchanged from this tool's original
// implementation), so a problem here (quota, outage, misconfiguration)
// can never take down text extraction.
//
// WHY ADOBE (over CloudConvert, used in an earlier version of this
// function): confirmed directly against Adobe's own pricing page - 500
// free document transactions/month, no credit card, no expiration
// (confirmed by an Adobe Community Manager reply, not just marketing
// copy). That free allowance is meaningfully larger than CloudConvert's
// free tier, which resets only 10 credits/day and charges 4 credits per
// PDF-to-Office conversion specifically (confirmed against CloudConvert's
// own credit-cost table) - a much tighter real-world cap for this exact
// use case. The tradeoff, confirmed and worth remembering: Adobe's paid
// tier beyond the free 500/month is enterprise-only (~$25k/year minimum
// per real user reports), with no small self-serve top-up the way
// CloudConvert has - so if usage ever needs to exceed 500/month, this
// integration needs to change, not just get a bigger invoice.
//
// FLOW (verified directly against Adobe's own developer docs, not
// assumed from memory): (1) POST to the PDF-Services-specific token
// endpoint with client_id/client_secret to get a short-lived Bearer
// token, (2) POST to /assets to register an upload and get a pre-signed
// upload URL + assetID, (3) PUT the raw PDF bytes to that upload URL,
// (4) POST to /operation/exportpdf with the assetID and targetFormat
// "docx" to start the conversion job, which returns a "location" URL to
// poll, (5) poll that location URL until status is "done" or "failed",
// (6) GET the resulting asset's own download URL and fetch it, returning
// the bytes (base64-encoded) to the browser. The browser never talks to
// Adobe directly at any point, and the client secret never leaves this
// function.
//
// RELIABILITY PATTERN: mirrors ocr.js and the CloudConvert version of
// this file - one AbortController-backed timeout budget kept under
// Netlify's platform ceiling, an explicit `typeof fetch` check, non-JSON
// response handling at every step, and the entire handler wrapped in an
// outer try/catch so any unexpected failure still returns a real, logged,
// readable JSON error instead of an opaque 500.

const ADOBE_TOKEN_URL = 'https://pdf-services.adobe.io/token';
const ADOBE_API_BASE = 'https://pdf-services.adobe.io';

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (typeof fetch !== 'function') {
      console.error('ConvertKoro PDF-to-Word function: global fetch is not available in this runtime.');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server runtime is missing fetch support - needs AWS_LAMBDA_JS_RUNTIME set to nodejs18.x or later' }),
      };
    }

    const clientId = process.env.ADOBE_PDF_CLIENT_ID;
    const clientSecret = process.env.ADOBE_PDF_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server is missing its document conversion API credentials' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const base64Pdf = (body.file || '').trim();
    const filename = (body.filename || 'document.pdf').trim().replace(/[^\w.\- ]/g, '_');
    if (!base64Pdf) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No PDF file provided' }) };
    }

    const MAX_BASE64_LENGTH = 10_800_000; // ~8MB decoded
    if (base64Pdf.length > MAX_BASE64_LENGTH) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'PDF is too large for format-preserving conversion (8MB limit) - try a smaller file, or switch to Text only mode.' }),
      };
    }

    let pdfBuffer;
    try {
      pdfBuffer = Buffer.from(base64Pdf, 'base64');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not read the provided file data' }) };
    }

    const controller = new AbortController();
    const timeoutMs = 24000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const tokenResponse = await fetch(ADOBE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }).toString(),
        signal: controller.signal,
      });
      const tokenRaw = await tokenResponse.text();
      let tokenData;
      try { tokenData = JSON.parse(tokenRaw); } catch (e) {
        console.error('ConvertKoro PDF-to-Word (Adobe): non-JSON token response.', 'HTTP status:', tokenResponse.status, 'Body:', tokenRaw.slice(0, 500));
        return { statusCode: 502, body: JSON.stringify({ error: `Conversion service authentication failed (HTTP ${tokenResponse.status})` }) };
      }
      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('ConvertKoro PDF-to-Word (Adobe): token request failed.', 'HTTP status:', tokenResponse.status, tokenData);
        return { statusCode: 502, body: JSON.stringify({ error: 'Conversion service authentication failed' }) };
      }
      const accessToken = tokenData.access_token;
      const authHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': clientId,
      };

      const assetResponse = await fetch(`${ADOBE_API_BASE}/assets`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType: 'application/pdf' }),
        signal: controller.signal,
      });
      const assetRaw = await assetResponse.text();
      let assetData;
      try { assetData = JSON.parse(assetRaw); } catch (e) {
        console.error('ConvertKoro PDF-to-Word (Adobe): non-JSON asset-registration response.', 'HTTP status:', assetResponse.status, 'Body:', assetRaw.slice(0, 500));
        return { statusCode: 502, body: JSON.stringify({ error: `Conversion service returned an unexpected response (HTTP ${assetResponse.status})` }) };
      }

      if (assetResponse.status === 429 || (assetResponse.status === 403 && /quota|limit/i.test(JSON.stringify(assetData)))) {
        return { statusCode: 429, body: JSON.stringify({ error: 'quota-exhausted' }) };
      }
      if (!assetResponse.ok || !assetData.uploadUri || !assetData.assetID) {
        console.error('ConvertKoro PDF-to-Word (Adobe): asset registration failed.', 'HTTP status:', assetResponse.status, assetData);
        return { statusCode: 502, body: JSON.stringify({ error: 'Conversion service rejected the upload request' }) };
      }
      const { uploadUri, assetID } = assetData;

      const uploadResponse = await fetch(uploadUri, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfBuffer,
        signal: controller.signal,
      });
      if (!uploadResponse.ok) {
        console.error('ConvertKoro PDF-to-Word (Adobe): file upload failed.', 'HTTP status:', uploadResponse.status);
        return { statusCode: 502, body: JSON.stringify({ error: 'Uploading the file to the conversion service failed' }) };
      }

      const jobResponse = await fetch(`${ADOBE_API_BASE}/operation/exportpdf`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetID, targetFormat: 'docx' }),
        signal: controller.signal,
      });
      if (jobResponse.status === 429) {
        return { statusCode: 429, body: JSON.stringify({ error: 'quota-exhausted' }) };
      }
      const jobLocation = jobResponse.headers.get('location');
      if (!jobResponse.ok || !jobLocation) {
        const jobRaw = await jobResponse.text().catch(() => '');
        console.error('ConvertKoro PDF-to-Word (Adobe): failed to start export job.', 'HTTP status:', jobResponse.status, 'Body:', jobRaw.slice(0, 500));
        return { statusCode: 502, body: JSON.stringify({ error: 'Conversion service could not start the conversion' }) };
      }

      let resultAssetUri = null;
      const pollStart = Date.now();
      const pollBudgetMs = timeoutMs - (Date.now() - pollStart) - 3000;
      while (Date.now() - pollStart < pollBudgetMs) {
        await new Promise((r) => setTimeout(r, 1500));
        const statusResponse = await fetch(jobLocation, { headers: authHeaders, signal: controller.signal });
        const statusRaw = await statusResponse.text();
        let statusData;
        try { statusData = JSON.parse(statusRaw); } catch (e) {
          console.error('ConvertKoro PDF-to-Word (Adobe): non-JSON status-poll response.', 'HTTP status:', statusResponse.status, 'Body:', statusRaw.slice(0, 500));
          continue;
        }
        if (statusData.status === 'done') {
          resultAssetUri = statusData.asset && statusData.asset.downloadUri;
          break;
        }
        if (statusData.status === 'failed') {
          console.error('ConvertKoro PDF-to-Word (Adobe): export job reported failure.', statusData.error);
          const message = (statusData.error && statusData.error.message) || 'Conversion did not complete successfully';
          return { statusCode: 502, body: JSON.stringify({ error: message }) };
        }
      }

      if (!resultAssetUri) {
        console.error('ConvertKoro PDF-to-Word (Adobe): job did not complete within the time budget.');
        return { statusCode: 504, body: JSON.stringify({ error: 'timeout' }) };
      }

      const fileResponse = await fetch(resultAssetUri, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!fileResponse.ok) {
        console.error('ConvertKoro PDF-to-Word (Adobe): failed to download the converted file.', 'HTTP status:', fileResponse.status);
        return { statusCode: 502, body: JSON.stringify({ error: 'Conversion completed but the result could not be retrieved' }) };
      }
      const fileArrayBuffer = await fileResponse.arrayBuffer();
      const fileBase64 = Buffer.from(fileArrayBuffer).toString('base64');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: fileBase64,
          filename: filename.replace(/\.pdf$/i, '.docx'),
        }),
      };
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        return { statusCode: 504, body: JSON.stringify({ error: 'timeout' }) };
      }
      console.error('ConvertKoro PDF-to-Word (Adobe): request to conversion service failed.', e);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to reach the conversion service, please try again' }) };
    }
  } catch (outerErr) {
    console.error('ConvertKoro PDF-to-Word function: unexpected top-level error.', outerErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error, please try again' }),
    };
  }
};
