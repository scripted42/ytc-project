import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import https from 'https';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

// Ensure directories exist
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Function to download yt-dlp.exe if it doesn't exist or is empty
export async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    const stats = fs.statSync(YTDLP_PATH);
    if (stats.size > 0) {
      return YTDLP_PATH;
    }
    console.log('yt-dlp.exe is empty. Deleting and re-downloading...');
    try {
      fs.unlinkSync(YTDLP_PATH);
    } catch (e) {
      console.error('Failed to delete empty yt-dlp.exe:', e);
    }
  }

  console.log('yt-dlp.exe not found. Downloading the latest version...');
  const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download yt-dlp: ${res.statusText} (${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(YTDLP_PATH, Buffer.from(buffer));
    console.log(`yt-dlp.exe downloaded successfully. Size: ${buffer.byteLength} bytes.`);
    return YTDLP_PATH;
  } catch (err) {
    console.error('Failed to download yt-dlp.exe:', err);
    if (fs.existsSync(YTDLP_PATH)) {
      try { fs.unlinkSync(YTDLP_PATH); } catch (e) {}
    }
    throw err;
  }
}

/**
 * Downloads a video using yt-dlp
 * @param {string} url The URL of the video (YouTube, TikTok, etc.)
 * @param {string} outputName Output file name (without path)
 * @param {function} onProgress Callback for download progress (percentage)
 * @returns {Promise<string>} Path to the downloaded video
 */
export async function downloadVideo(url, outputName, onProgress = () => {}) {
  await ensureYtDlp();

  const outputPath = path.join(DOWNLOADS_DIR, outputName);
  
  return new Promise((resolve, reject) => {
    // yt-dlp arguments:
    // Restrict height to 720p for fast download, and supply the ffmpeg path for merging
    const args = [
      url,
      '--newline',
      '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--ffmpeg-location', path.dirname(ffmpegInstaller.path),
      '--merge-output-format', 'mp4',
      '-o', outputPath,
      '--no-playlist'
    ];

    console.log(`Running yt-dlp with args: ${args.join(' ')}`);
    const proc = spawn(YTDLP_PATH, args);

    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // yt-dlp progress format is typically like: [download]  10.5% of 15.00MiB at ...
      const match = output.match(/\[download\]\s+(\d+\.\d+)%/);
      if (match && match[1]) {
        const percent = parseFloat(match[1]);
        onProgress(percent);
      }
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // yt-dlp might append .mp4 automatically if we didn't specify it, but outputPath includes it.
        // Let's verify file existence
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else if (fs.existsSync(outputPath + '.mp4')) {
          fs.renameSync(outputPath + '.mp4', outputPath);
          resolve(outputPath);
        } else {
          // Look for any video file starting with the outputName in the downloads directory
          const files = fs.readdirSync(DOWNLOADS_DIR);
          const found = files.find(f => 
            f.startsWith(path.basename(outputName, path.extname(outputName))) && 
            !f.endsWith('.m4a') && 
            !f.endsWith('.part') && 
            !f.endsWith('.ytdl')
          );
          if (found) {
            const foundPath = path.join(DOWNLOADS_DIR, found);
            fs.renameSync(foundPath, outputPath);
            resolve(outputPath);
          } else {
            reject(new Error(`Download completed, but output file not found at ${outputPath}`));
          }
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}. Error: ${errorOutput}`));
      }
    });
  });
}
