const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, format } = body;

    if (!file || !format) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing file or format' }) };
    }

    if (!['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(format)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported format' }) };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-audio-'));
    const inputFile = path.join(tempDir, 'input.audio');
    const outputFile = path.join(tempDir, `output.${format}`);

    // Decode base64 and write input file
    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputFile, fileBuffer);

    // Build ffmpeg command
    const args = ['-i', inputFile, '-vn'];

    if (format === 'mp3') {
      args.push('-acodec', 'libmp3lame', '-b:a', '192k');
    } else if (format === 'wav') {
      args.push('-acodec', 'pcm_s16le');
    } else if (format === 'ogg') {
      args.push('-acodec', 'libvorbis', '-q:a', '5');
    } else if (format === 'aac') {
      args.push('-acodec', 'aac', '-b:a', '192k');
    } else if (format === 'flac') {
      args.push('-acodec', 'flac');
    } else if (format === 'm4a') {
      args.push('-acodec', 'aac', '-b:a', '192k');
    }

    args.push(outputFile);

    // Run ffmpeg
    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000
      });

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error('FFmpeg error:', errorOutput);
          if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
          return resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Audio processing failed' })
          });
        }

        if (!fs.existsSync(outputFile)) {
          if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
          return resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'Output file not created' })
          });
        }

        try {
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
            body: JSON.stringify({ error: 'Failed to read output' })
          });
        }
      });

      ffmpeg.on('error', (err) => {
        console.error('FFmpeg spawn error:', err);
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Process error' })
        });
      });
    });

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
