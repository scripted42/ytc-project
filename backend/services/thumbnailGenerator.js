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

function splitTitleIntoLines(titleText) {
  let text = titleText.trim();
  
  // Clean trailing punctuation
  if (text.endsWith('.') && !text.endsWith('...')) {
    const periods = text.match(/\./g) || [];
    if (periods.length === 1) {
      text = text.slice(0, -1);
    }
  }

  // Split by common sentence/clause boundaries: ?, !, :, -, and keep punctuation attached
  let initialLines = text.split(/([?!:-]+)/).map(s => s.trim()).filter(Boolean);
  
  const cleanLines = [];
  for (let i = 0; i < initialLines.length; i++) {
    const part = initialLines[i];
    if (/^[?!:-]+$/.test(part) && cleanLines.length > 0) {
      cleanLines[cleanLines.length - 1] += part;
    } else {
      cleanLines.push(part);
    }
  }

  // Re-split excessively long lines (> 4 words) into balanced sub-lines
  const finalLines = [];
  cleanLines.forEach(line => {
    const words = line.split(/\s+/);
    if (words.length > 4) {
      const mid = Math.ceil(words.length / 2);
      finalLines.push(words.slice(0, mid).join(' '));
      finalLines.push(words.slice(mid).join(' '));
    } else if (line.length > 0) {
      finalLines.push(line);
    }
  });

  // Fallback to word-count division if punctuation split didn't yield multiple lines
  if (finalLines.length <= 1) {
    const words = text.split(/\s+/);
    if (words.length <= 3) {
      return [{ text: text, highlight: true, badge: false }];
    } else if (words.length <= 5) {
      const mid = Math.ceil(words.length / 2);
      return [
        { text: words.slice(0, mid).join(' '), highlight: false, badge: false },
        { text: words.slice(mid).join(' '), highlight: true, badge: false }
      ];
    } else {
      const chunkSize = Math.ceil(words.length / 3);
      const line1 = words.slice(0, Math.min(3, chunkSize));
      const line2 = words.slice(line1.length, line1.length + chunkSize);
      const line3 = words.slice(line1.length + line2.length);

      const res = [];
      if (line1.length > 0) res.push({ text: line1.join(' '), highlight: false, badge: false });
      if (line2.length > 0) res.push({ text: line2.join(' '), highlight: false, badge: false });
      if (line3.length > 0) res.push({ text: line3.join(' '), highlight: true, badge: false });
      return res;
    }
  }

  // Map to formatting objects, highlighting the last line
  return finalLines.slice(0, 4).map((lineText, idx, arr) => {
    return {
      text: lineText,
      highlight: idx === arr.length - 1,
      badge: false
    };
  });
}

/**
 * Renders a viral-style thumbnail using Puppeteer + Sharp.
 * @param {object} params
 * @param {string} params.framePath - Path to the selected frame image
 * @param {string} params.titleText - Title text for the thumbnail
 * @param {string} params.clipId - Clip ID for output naming
 * @returns {Promise<string>} Path to the final rendered thumbnail
 */
export async function renderThumbnail({ framePath, titleText, clipId, textStyle = 'classic', focusX = 0.5 }) {
  const outputPath = path.join(THUMBNAILS_DIR, `thumb_${clipId}.png`);
  const templatePath = path.join(TEMPLATES_DIR, 'thumbnail.html');

  console.log(`[Thumbnail] Starting render for clip ${clipId}...`);
  console.log(`[Thumbnail] Frame: ${framePath}`);
  console.log(`[Thumbnail] Title: ${titleText}`);
  console.log(`[Thumbnail] Text Style: ${textStyle}`);
  console.log(`[Thumbnail] Focus X: ${focusX}`);

  // Step 1: Process the frame to exactly 720x1280, centering on focusX
  const bgProcessedPath = path.join(THUMBNAILS_DIR, `bg_processed_${clipId}.jpg`);
  
  try {
    const meta = await sharp(framePath).metadata();
    const scaleFactor = 1280 / (meta.height || 1080);
    const scaledWidth = Math.round((meta.width || 1920) * scaleFactor);
    
    const subjectPixelX = focusX * scaledWidth;
    let cropX = Math.round(subjectPixelX - 360);
    // Clamp cropX to bounds
    cropX = Math.max(0, Math.min(scaledWidth - 720, cropX));

    console.log(`[Thumbnail] Resizing frame to ${scaledWidth}x1280 and cropping at X=${cropX}`);
    
    await sharp(framePath)
      .resize(scaledWidth, 1280)
      .extract({ left: cropX, top: 0, width: 720, height: 1280 })
      .toFile(bgProcessedPath);
  } catch (sharpErr) {
    console.error('[Thumbnail] Sharp processing failed, falling back to center cover:', sharpErr);
    await sharp(framePath)
      .resize(720, 1280, { fit: 'cover', position: 'center' })
      .toFile(bgProcessedPath);
  }

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

    await page.evaluate(({ bgBase64, titleLines, textStyle }) => {
      // Set background
      const bgLayer = document.getElementById('bgLayer');
      bgLayer.style.backgroundImage = `url(data:image/jpeg;base64,${bgBase64})`;

      // Apply the selected text style class to the canvas wrapper
      const canvasEl = document.querySelector('.canvas');
      if (canvasEl) {
        canvasEl.classList.remove('style-classic', 'style-cyber', 'style-bubble');
        canvasEl.classList.add(`style-${textStyle}`);
      }

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

      // Auto-scale font size of title lines to prevent wrapping
      // Thresholds tuned for 115px base (Anton font ~10.5px/char at 115px)
      const titleLinesElements = document.querySelectorAll('.title-line');
      titleLinesElements.forEach(line => {
        const textLength = line.textContent.length;
        const currentSize = parseFloat(window.getComputedStyle(line).fontSize);
        if (textLength > 22) {
          line.style.fontSize = (currentSize * 0.58) + 'px';  // Very long: e.g. "EVERYTHING YOU NEED TO KNOW"
        } else if (textLength > 17) {
          line.style.fontSize = (currentSize * 0.70) + 'px';  // Long: e.g. "THE REAL TRUTH IS"
        } else if (textLength > 12) {
          line.style.fontSize = (currentSize * 0.85) + 'px';  // Medium: e.g. "LIVE BETTER?"
        }
        // ≤12 chars: stays at full size (e.g. "LIVE LONGER")
      });
    }, { bgBase64, titleLines, textStyle });

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
