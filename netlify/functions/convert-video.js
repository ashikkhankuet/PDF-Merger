const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getFfmpegPath() {
  const paths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return 'ffmpeg';
}

ffmpeg.setFfmpegPath(getFfmpegPath());

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, operation, params } = body;
    // operation: 'convert', 'compress', 'resize', 'trim', 'to-gif', 'to-mp3'
    // params: { format, resolution, quality, start, duration }

    if (!file) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing file' }) };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-'));
    const inputPath = path.join(tempDir, 'input.video');
    
    // Decode and write input
    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > 500 * 1024 * 1024) { // 500MB limit
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputPath, fileBuffer);

    return new Promise((resolve) => {
      let outputExt = 'mp4';
      let command = ffmpeg(inputPath);

      // Apply operation
      if (operation === 'convert' && params.format) {
        outputExt = params.format;
      } else if (operation === 'compress') {
        command = command.videoCodec('libx264').videoBitrate('1500k').outputOptions('-preset faster');
      } else if (operation === 'resize' && params.resolution) {
        const [w, h] = params.resolution.split('x');
        command = command.size(`${w}x${h}`).autopad();
      } else if (operation === 'trim' && params.start && params.duration) {
        command = command.seekInput(params.start).duration(params.duration);
      } else if (operation === 'to-gif') {
        outputExt = 'gif';
        command = command.fps(10).size('800x?').autopad();
      } else if (operation === 'to-mp3') {
        outputExt = 'mp3';
        command = command.noVideo().audioCodec('libmp3lame').audioBitrate('192k');
      }

      const outputPath = path.join(tempDir, `output.${outputExt}`);

      command
        .output(outputPath)
        .on('end', () => {
          try {
            const output = fs.readFileSync(outputPath);
            const base64 = output.toString('base64');
            
            if (tempDir && fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true, force: true });
            }

            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ success: true, file: base64, size: output.length })
            });
          } catch (err) {
            resolve({ statusCode: 500, body: JSON.stringify({ error: 'Output read failed' }) });
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
          resolve({ statusCode: 500, body: JSON.stringify({ error: 'Processing failed' }) });
        })
        .run();
    });

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
