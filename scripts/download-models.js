#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const MODELS = [
  {
    name: 'whisper-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    size: '39MB'
  },
  {
    name: 'whisper-base.bin', 
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    size: '142MB'
  }
];

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      const total = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', chunk => {
        downloaded += chunk.length;
        const percent = ((downloaded / total) * 100).toFixed(1);
        process.stdout.write(`\r${path.basename(dest)}: ${percent}%`);
      });

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`\n${path.basename(dest)} downloaded successfully`);
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  console.log('Downloading whisper models...');
  
  for (const model of MODELS) {
    const dest = path.join(MODELS_DIR, model.name);
    
    if (fs.existsSync(dest)) {
      console.log(`${model.name} already exists, skipping`);
      continue;
    }
    
    console.log(`Downloading ${model.name} (${model.size})...`);
    await downloadFile(model.url, dest);
  }
  
  console.log('All models downloaded!');
}

if (require.main === module) {
  main().catch(console.error);
}