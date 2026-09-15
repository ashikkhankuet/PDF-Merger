const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);

const MAX_FILE_SIZE = 100 * 1024 * 1024;

async function checkFFmpeg() {
  try {
    await execPromise('which ffmpeg');
    return true;
  } catch {
    return false;
  }
}

async function convertWithSystemFFmpeg(inputPath, outputPath, format) {
  let cmd = `ffmpeg -i "${inputPath}" -vn`;
  
  if (format === 'mp3') {
    cmd += ' -acodec libmp3lame -b:a 192k';
  } else if (format === 'wav') {
    cmd += ' -acodec pcm_s16le';
  } else if (format === 'ogg') {
    cmd += ' -acodec libvorbis -q:a 5';
  } else if (format === 'aac') {
    cmd += ' -acodec aac -b:a 192k';
  }
  
  cmd += ` "${outputPath}" -y 2>&1`;
  
  await execPromise(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 });
}

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

    // Check if ffmpeg exists
    const hasFFmpeg = await checkFFmpeg();
    
    if (!hasFFmpeg) {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return { 
        statusCode: 503, 
        body: JSON.stringify({ error: 'conversion_service_unavailable', useApi: true }) 
      };
    }

    // Use system ffmpeg
    await convertWithSystemFFmpeg(inputFile, outputFile, format);

    if (!fs.existsSync(outputFile)) {
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return { statusCode: 500, body: JSON.stringify({ error: 'Conversion failed' }) };
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
    console.error('Error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
