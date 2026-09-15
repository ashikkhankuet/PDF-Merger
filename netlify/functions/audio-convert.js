const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FILE_SIZE = 100 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, format } = body;

    if (!file || !format) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing parameters' }) };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-audio-'));
    const inputFile = path.join(tempDir, 'input.audio');
    const outputFile = path.join(tempDir, `output.${format}`);

    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > MAX_FILE_SIZE) {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputFile, fileBuffer);

    let codec = 'libmp3lame';
    let bitrate = '192k';
    
    if (format === 'wav') {
      codec = 'pcm_s16le';
      bitrate = '';
    } else if (format === 'ogg') {
      codec = 'libvorbis';
      bitrate = '-q:a 5';
    } else if (format === 'aac') {
      codec = 'aac';
      bitrate = '192k';
    }

    const cmd = bitrate 
      ? `ffmpeg -i "${inputFile}" -vn -acodec ${codec} -b:a ${bitrate} "${outputFile}" -y 2>&1`
      : `ffmpeg -i "${inputFile}" -vn -acodec ${codec} "${outputFile}" -y 2>&1`;

    try {
      execSync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 });
    } catch (err) {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return { statusCode: 500, body: JSON.stringify({ error: 'FFmpeg failed' }) };
    }

    if (!fs.existsSync(outputFile)) {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return { statusCode: 500, body: JSON.stringify({ error: 'No output' }) };
    }

    const output = fs.readFileSync(outputFile);
    const base64 = output.toString('base64');
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        file: base64,
        size: output.length
      })
    };

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
