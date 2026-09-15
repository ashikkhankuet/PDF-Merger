const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to get ffmpeg binary path
function getFfmpegPath() {
  // On Netlify, ffmpeg is typically available in /usr/bin
  const paths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return 'ffmpeg'; // fallback
}

ffmpeg.setFfmpegPath(getFfmpegPath());

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let tempDir = null;

  try {
    const body = JSON.parse(event.body);
    const { file, format } = body; // file is base64, format is 'mp3' or 'wav'

    if (!file || !format) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing file or format' }) };
    }

    if (!['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(format)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported format' }) };
    }

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-'));
    const inputPath = path.join(tempDir, 'input.audio');
    const outputPath = path.join(tempDir, `output.${format}`);

    // Decode and write input file
    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > 100 * 1024 * 1024) { // 100MB limit
      return { statusCode: 413, body: JSON.stringify({ error: 'File too large' }) };
    }
    fs.writeFileSync(inputPath, fileBuffer);

    // Process with ffmpeg
    return new Promise((resolve) => {
      let command = ffmpeg(inputPath)
        .noVideo()
        .audioCodec(format === 'mp3' ? 'libmp3lame' : 'aac')
        .audioBitrate('192k')
        .audioChannels(2)
        .audioFrequency(44100)
        .output(outputPath)
        .on('end', () => {
          try {
            const output = fs.readFileSync(outputPath);
            const base64 = output.toString('base64');
            
            // Cleanup
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
          resolve({ statusCode: 500, body: JSON.stringify({ error: 'Processing failed: ' + err.message }) });
        });

      if (format === 'wav') {
        command = command.audioCodec('pcm_s16le');
      } else if (format === 'ogg') {
        command = command.audioCodec('libvorbis');
      } else if (format === 'm4a') {
        command = command.audioCodec('aac');
      }

      command.run();
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
