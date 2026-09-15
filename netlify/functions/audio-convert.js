const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');

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
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputFile, fileBuffer);

    const args = ['-i', inputFile, '-vn'];
    
    if (format === 'mp3') {
      args.push('-acodec', 'libmp3lame', '-b:a', '192k');
    } else if (format === 'wav') {
      args.push('-acodec', 'pcm_s16le');
    } else if (format === 'ogg') {
      args.push('-acodec', 'libvorbis', '-q:a', '5');
    } else if (format === 'aac') {
      args.push('-acodec', 'aac', '-b:a', '192k');
    }
    
    args.push(outputFile);

    return new Promise((resolve) => {
      execFile(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('FFmpeg error:', error);
          if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
          return resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Processing failed' })
          });
        }

        try {
          if (!fs.existsSync(outputFile)) {
            if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
            return resolve({
              statusCode: 500,
              body: JSON.stringify({ error: 'No output file' })
            });
          }

          const output = fs.readFileSync(outputFile);
          const base64 = output.toString('base64');
          fs.rmSync(tempDir, { recursive: true, force: true });

          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              success: true,
              file: base64,
              size: output.length
            })
          });
        } catch (err) {
          if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Read failed' })
          });
        }
      });
    });

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
