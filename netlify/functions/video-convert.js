const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const MAX_FILE_SIZE = 500 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, operation, params } = body;

    if (!file || !operation) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing parameters' }) };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-video-'));
    const inputFile = path.join(tempDir, 'input.video');

    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputFile, fileBuffer);

    let outputExt = 'mp4';
    let args = ['-i', inputFile];

    if (operation === 'convert' && params?.format) {
      outputExt = params.format;
      args.push('-c:v', 'libx264', '-c:a', 'aac');
    } else if (operation === 'compress') {
      args.push('-c:v', 'libx264', '-crf', '28', '-preset', 'faster', '-c:a', 'aac');
    } else if (operation === 'resize' && params?.resolution) {
      const [w, h] = params.resolution.split('x');
      args.push('-vf', `scale=${w}:${h}`, '-c:a', 'copy');
    } else if (operation === 'trim' && params?.start && params?.duration) {
      args.unshift('-ss', params.start, '-i', inputFile);
      args.push('-t', params.duration);
    } else if (operation === 'to-gif') {
      outputExt = 'gif';
      args.push('-vf', 'fps=10,scale=800:-1');
    } else if (operation === 'to-mp3') {
      outputExt = 'mp3';
      args.push('-vn', '-acodec', 'libmp3lame', '-b:a', '192k');
    }

    const outputFile = path.join(tempDir, `output.${outputExt}`);
    args.push(outputFile);

    return new Promise((resolve) => {
      execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (error, stdout, stderr) => {
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
