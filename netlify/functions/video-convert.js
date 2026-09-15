const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, operation, params } = body;

    if (!file || !operation) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing file or operation' }) };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-video-'));
    const inputFile = path.join(tempDir, 'input.video');
    let outputFile;
    let outputExt = 'mp4';

    // Decode and write input
    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputFile, fileBuffer);

    // Build ffmpeg command based on operation
    let args = ['-i', inputFile];

    if (operation === 'convert' && params?.format) {
      outputExt = params.format;
      args.push('-c:v', 'libx264', '-c:a', 'aac');
    } else if (operation === 'compress') {
      args.push('-c:v', 'libx264', '-crf', '28', '-preset', 'faster', '-c:a', 'aac', '-b:a', '128k');
    } else if (operation === 'resize' && params?.resolution) {
      const [w, h] = params.resolution.split('x');
      args.push('-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`, '-c:a', 'copy');
    } else if (operation === 'trim' && params?.start && params?.duration) {
      args.unshift('-ss', params.start);
      args.push('-t', params.duration);
    } else if (operation === 'to-gif') {
      outputExt = 'gif';
      args.push('-vf', 'fps=10,scale=800:-1', '-f', 'gif');
    } else if (operation === 'to-mp3') {
      outputExt = 'mp3';
      args.push('-vn', '-acodec', 'libmp3lame', '-b:a', '192k');
    }

    outputFile = path.join(tempDir, `output.${outputExt}`);
    args.push(outputFile);

    // Run ffmpeg
    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000
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
            body: JSON.stringify({ error: 'Video processing failed' })
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
