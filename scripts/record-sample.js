#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SAMPLES_DIR = path.join(__dirname, '..', 'samples');

async function recordSample() {
  if (!fs.existsSync(SAMPLES_DIR)) {
    fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `sample-${timestamp}.wav`;
  const dest = path.join(SAMPLES_DIR, filename);

  console.log('Recording 30 second sample...');
  console.log('Press Ctrl+C to stop early');

  const command = process.platform === 'darwin' 
    ? `sox -t coreaudio default -r 16000 -c 1 -b 16 "${dest}" trim 0 30`
    : `ffmpeg -f pulse -i default -ac 1 -ar 16000 -t 30 "${dest}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Recording failed:', error.message);
      console.log('Try installing sox (macOS) or ffmpeg (Linux)');
      return;
    }
    
    console.log(`Sample recorded: ${filename}`);
    console.log(`File size: ${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB`);
  });
}

if (require.main === module) {
  recordSample();
}