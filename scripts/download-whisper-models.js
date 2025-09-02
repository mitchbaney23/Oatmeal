#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

// Create models directory
const modelsDir = path.join(process.cwd(), 'models');
if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
}

// Whisper model URLs from OpenAI
const models = {
    'ggml-tiny.en.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    'ggml-base.en.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    'ggml-small.en.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
};

async function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${path.basename(filePath)}...`);
        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlink(filePath, () => {});
                downloadFile(response.headers.location, filePath).then(resolve).catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                fs.unlink(filePath, () => {}); // Delete the file on error
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'] || '0');
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r  Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`\n  ✅ Downloaded ${path.basename(filePath)}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {}); // Delete the file on error
            reject(err);
        });
    });
}

async function main() {
    console.log('🎤 Downloading Whisper models for local transcription...\n');
    
    for (const [filename, url] of Object.entries(models)) {
        const filePath = path.join(modelsDir, filename);
        
        if (fs.existsSync(filePath)) {
            console.log(`  ⏭️  ${filename} already exists, skipping...`);
            continue;
        }
        
        try {
            await downloadFile(url, filePath);
        } catch (error) {
            console.error(`  ❌ Failed to download ${filename}:`, error.message);
            process.exit(1);
        }
    }
    
    console.log('\n🎉 All models downloaded successfully!');
    console.log('Models stored in:', modelsDir);
}

main().catch(console.error);