import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const THUMBNAILS_DIR = path.join(__dirname, '..', 'thumbnails');
const FRAMES_DIR = path.join(THUMBNAILS_DIR, 'frames');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Ensure directories exist
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

/**
 * Extracts candidate frames from a video file at evenly spaced intervals.
 * @param {string} videoPath - Path to the source video (e.g. original campaign video or clip)
 * @param {string} clipId - Clip ID for naming frames
 * @param {number} startTime - Start time offset in the videoPath (default 0)
 * @param {number} clipDuration - Duration of the clip segment (default null, uses full video duration)
 * @param {number} count - Number of frames to extract (default 5)
 * @returns {Promise<string[]>} Array of frame file paths
 */
export async function extractCandidateFrames(videoPath, clipId, startTime = 0, clipDuration = null, count = 5) {
  // Determine duration to use for interval calculation
  let duration = clipDuration;
  if (!duration) {
    duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(parseFloat(metadata.format.duration));
      });
    });
  }

  // Clean up old frames for this clip
  const existingFrames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith(`frame_${clipId}_`));
  existingFrames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));

  // Calculate timestamps relative to the startTime
  const percentages = [0.10, 0.25, 0.50, 0.75, 0.90];
  const timestamps = percentages.slice(0, count).map(p => {
    const offset = duration * p;
    return Math.max(0, startTime + offset);
  });

  const framePaths = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const outputFile = path.join(FRAMES_DIR, `frame_${clipId}_${i}.jpg`);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .outputOptions(['-q:v', '2'])  // High quality JPEG
        .output(outputFile)
        .on('end', () => {
          framePaths.push(outputFile);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[Thumbnail] Failed to extract frame ${i} at timestamp ${timestamp}:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  console.log(`[Thumbnail] Extracted ${framePaths.length} candidate frames for clip ${clipId}`);
  return framePaths;
}

/**
 * Splits a title string into display lines for the thumbnail.
 * Splits on whitespace, grouping 2-3 words per line.
 * First line gets a badge highlight style, rest are big white/yellow text.
 * @param {string} titleText
 * @returns {Array<{text: string, highlight: boolean, badge: boolean}>}
 */
function splitTitleIntoLines(titleText) {
  const words = titleText.trim().split(/\s+/);
  const lines = [];

  if (words.length <= 2) {
    lines.push({ text: words.join(' '), highlight: true, badge: false });
  } else if (words.length <= 4) {
    // 2 lines
    const mid = Math.ceil(words.length / 2);
    lines.push({ text: words.slice(0, mid).join(' '), highlight: false, badge: false });
    lines.push({ text: words.slice(mid).join(' '), highlight: true, badge: false });
  } else {
    // 3+ lines: first chunk gets a badge, middle is white, last is yellow
    const chunkSize = Math.ceil(words.length / 3);
    const line1 = words.slice(0, Math.min(3, chunkSize));
    const line2 = words.slice(line1.length, line1.length + chunkSize);
    const line3 = words.slice(line1.length + line2.length);

    if (line1.length > 0) lines.push({ text: line1.join(' '), highlight: false, badge: true });
    if (line2.length > 0) lines.push({ text: line2.join(' '), highlight: false, badge: false });
    if (line3.length > 0) lines.push({ text: line3.join(' '), highlight: true, badge: false });
  }

  return lines;
}

/**
 * Renders a viral-style thumbnail using Puppeteer + Sharp.
 * @param {object} params
 * @param {string} params.framePath - Path to the selected frame image
 * @param {string} params.titleText - Title text for the thumbnail
 * @param {string} params.clipId - Clip ID for output naming
 * @returns {Promise<string>} Path to the final rendered thumbnail
 */
export async function renderThumbnail({ framePath, titleText, clipId }) {
  const outputPath = path.join(THUMBNAILS_DIR, `thumb_${clipId}.png`);
  const templatePath = path.join(TEMPLATES_DIR, 'thumbnail.html');

  console.log(`[Thumbnail] Starting render for clip ${clipId}...`);
  console.log(`[Thumbnail] Frame: ${framePath}`);
  console.log(`[Thumbnail] Title: ${titleText}`);

  // Step 1: Process the frame to exactly 720x1280 (no blur, no crop/speaker separation)
  const bgProcessedPath = path.join(THUMBNAILS_DIR, `bg_processed_${clipId}.jpg`);
  await sharp(framePath)
    .resize(720, 1280, { fit: 'cover', position: 'center' })
    .toFile(bgProcessedPath);

  // Step 2: Launch Puppeteer to render the text overlay
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });

    // Load the HTML template
    const templateHtml = fs.readFileSync(templatePath, 'utf-8');
    await page.setContent(templateHtml, { waitUntil: 'networkidle0', timeout: 15000 });

    // Convert processed image to base64 for embedding
    const bgBase64 = fs.readFileSync(bgProcessedPath).toString('base64');

    // Inject background image and title text
    const titleLines = splitTitleIntoLines(titleText);

    await page.evaluate(({ bgBase64, titleLines }) => {
      // Set background
      const bgLayer = document.getElementById('bgLayer');
      bgLayer.style.backgroundImage = `url(data:image/jpeg;base64,${bgBase64})`;

      // Build title lines
      const titleContainer = document.getElementById('titleContainer');
      titleContainer.innerHTML = '';

      titleLines.forEach(line => {
        if (line.badge) {
          const badge = document.createElement('div');
          badge.className = 'badge-highlight';
          badge.textContent = line.text;
          titleContainer.appendChild(badge);
        } else {
          const div = document.createElement('div');
          div.className = `title-line${line.highlight ? ' highlight' : ''}`;
          div.textContent = line.text;
          titleContainer.appendChild(div);
        }
      });
    }, { bgBase64, titleLines });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500));

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 720, height: 1280 }
    });

    console.log(`[Thumbnail] Successfully rendered thumbnail: ${outputPath}`);
  } finally {
    await browser.close();
  }

  // Cleanup temp file
  try {
    if (fs.existsSync(bgProcessedPath)) fs.unlinkSync(bgProcessedPath);
  } catch (e) {
    // Non-critical
  }

  return outputPath;
}

/**
 * Cleans up temporary frame files for a clip.
 * @param {string} clipId
 */
export function cleanupFrames(clipId) {
  try {
    const frames = fs.readdirSync(FRAMES_DIR).filter(f => f.startsWith(`frame_${clipId}_`));
    frames.forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));
    console.log(`[Thumbnail] Cleaned up ${frames.length} temporary frames for clip ${clipId}`);
  } catch (e) {
    // Non-critical
  }
}
