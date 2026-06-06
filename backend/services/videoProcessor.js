import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { detectSpeakerFocus } from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const CLIPS_DIR = path.join(__dirname, '..', 'clips');
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');

if (!fs.existsSync(CLIPS_DIR)) {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

/**
 * Extracts a single frame at a specific timestamp.
 * @param {string} videoPath
 * @param {number} timestamp
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
export function extractSingleFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions(['-q:v', '2'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Gets video metadata (duration, width, height, hasAudio)
 * @param {string} videoPath 
 * @returns {Promise<object>}
 */
export function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const stream = metadata.streams.find(s => s.codec_type === 'video');
      const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration,
        width: stream ? stream.width : 0,
        height: stream ? stream.height : 0,
        hasAudio
      });
    });
  });
}

/**
 * Escapes characters for FFmpeg drawtext filter
 */
function escapeDrawtext(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

/**
 * Generates a vertical split screen video:
 * Top: Main content (cropped/fitted to 720x640)
 * Bottom: Gameplay overlay (cropped/fitted to 720x640)
 * 
 * @param {object} params
 * @param {string} params.inputPath - Path to main video
 * @param {string} params.gameplayPath - Path to gameplay background video
 * @param {number} params.startTime - Start time in main video (seconds)
 * @param {number} params.duration - Duration of clip (seconds)
 * @param {string} params.outputPath - Output file path
 * @param {boolean} params.useSplitScreen - If false, just crop main video to 9:16 (720x1280)
 * @param {function} params.onProgress - Progress callback
 */
/**
 * Helper to group an array of words into chunks of 3-4 words.
 * Avoids leaving a single word alone at the end of a segment.
 */
function chunkWords(words) {
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    if (remaining <= 4) {
      chunks.push(words.slice(i));
      break;
    } else {
      chunks.push(words.slice(i, i + 3));
      i += 3;
    }
  }
  return chunks;
}

export function optimizeClipTimings(startTime, duration, transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return { startTime, duration };
  }

  const reqStart = startTime;
  const reqEnd = startTime + duration;

  // Find all segments whose midpoint falls inside the requested range
  const includedIndices = [];
  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    const midpoint = seg.start + (seg.duration / 2);
    if (midpoint >= reqStart && midpoint <= reqEnd) {
      includedIndices.push(i);
    }
  }

  if (includedIndices.length === 0) {
    return { startTime, duration };
  }

  const firstIdx = includedIndices[0];
  const lastIdx = includedIndices[includedIndices.length - 1];

  // Align start time with the beginning of the first included segment (giving 0.1s pre-buffer)
  const cleanStart = Math.max(0, transcript[firstIdx].start - 0.1);

  // Align end time to avoid bleeding or mid-sentence cutoffs
  let cleanEnd = reqEnd;
  const lastSeg = transcript[lastIdx];
  const lastSegEnd = lastSeg.start + lastSeg.duration;

  if (lastIdx + 1 < transcript.length) {
    const nextSeg = transcript[lastIdx + 1];
    
    // If our requested end overlaps/bleeds into the next segment's speech
    if (reqEnd > nextSeg.start) {
      const bleedDuration = reqEnd - nextSeg.start;
      
      // If we only bleed a tiny bit of the next segment (less than 1.5s), cut EARLY to avoid hearing it
      if (bleedDuration < 1.5) {
        cleanEnd = nextSeg.start - 0.2;
      } else {
        // If we bleed heavily (1.5s or more), we've cut mid-thought. EXTEND to include the next segment fully.
        cleanEnd = nextSeg.start + nextSeg.duration;
      }
    } else {
      // No overlap, cut clean at the end of the last included segment
      cleanEnd = lastSegEnd;
    }
  } else {
    // End of the video
    cleanEnd = lastSegEnd;
  }

  let cleanDuration = cleanEnd - cleanStart;
  if (cleanDuration < 10) {
    cleanDuration = 10; // maintain minimum duration requirement
  }

  return {
    startTime: parseFloat(cleanStart.toFixed(2)),
    duration: parseFloat(cleanDuration.toFixed(2))
  };
}

/**
 * Generates a vertical split screen video:
 * Top: Main content (cropped/fitted to 720x640)
 * Bottom: Gameplay overlay (cropped/fitted to 720x640)
 * 
 * @param {object} params
 * @param {string} params.inputPath - Path to main video
 * @param {string} params.gameplayPath - Path to gameplay background video
 * @param {number} params.startTime - Start time in main video (seconds)
 * @param {number} params.duration - Duration of clip (seconds)
 * @param {string} params.outputPath - Output file path
 * @param {boolean} params.useSplitScreen - If false, just crop main video to 9:16 (720x1280)
 * @param {function} params.onProgress - Progress callback
 */
export async function createClip({
  inputPath,
  gameplayPath,
  startTime,
  duration,
  outputPath,
  useSplitScreen = true,
  title,
  transcript = [],
  subtitleOffset = 0,
  cropPosition = 'auto',
  onProgress = () => {}
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const metadata = await getVideoMetadata(inputPath);
      const mainDuration = parseFloat(metadata.duration);
      const hasAudio = metadata.hasAudio;

      // 1. Optimize start time and duration based on transcript segment boundaries to prevent cutoffs/bleeding
      let actualStart = startTime;
      let actualDuration = duration;

      if (Array.isArray(transcript) && transcript.length > 0) {
        const optimized = optimizeClipTimings(startTime, duration, transcript);
        actualStart = optimized.startTime;
        actualDuration = optimized.duration;
        console.log(`[Timing Optimizer] Adjusted clip boundaries from start=${startTime}s, dur=${duration}s to start=${actualStart}s, dur=${actualDuration}s`);
      }
      
      // Ensure we don't go out of bounds
      const finalDuration = Math.min(actualDuration, mainDuration - actualStart);
      if (finalDuration <= 0) {
        return reject(new Error('Start time is beyond video duration'));
      }

      // 1.5. Resolve subject focus position (0.0 to 1.0) and calculate crop coordinates
      let focusX = 0.5; // default to center
      if (cropPosition === 'left') {
        focusX = 0.15;
      } else if (cropPosition === 'right') {
        focusX = 0.85;
      } else if (cropPosition === 'center') {
        focusX = 0.5;
      } else {
        // cropPosition is 'auto'
        const middleTimestamp = actualStart + (finalDuration / 2);
        const tempFrameName = `temp_focus_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const tempFramePath = path.join(CLIPS_DIR, tempFrameName);

        try {
          console.log(`[Auto Reframe] Extracting focus frame from ${inputPath} at ${middleTimestamp.toFixed(2)}s...`);
          await extractSingleFrame(inputPath, middleTimestamp, tempFramePath);
          console.log('[Auto Reframe] Scanning speaker/face coordinates with Gemini Vision...');
          focusX = await detectSpeakerFocus(tempFramePath);
        } catch (focusError) {
          console.error('[Auto Reframe] Subject auto-detection failed, falling back to 0.5:', focusError);
          focusX = 0.5;
        } finally {
          // Cleanup temp frame
          try {
            if (fs.existsSync(tempFramePath)) fs.unlinkSync(tempFramePath);
          } catch (e) {
            console.error('[Auto Reframe] Failed to clean up temp frame:', e);
          }
        }
      }

      console.log(`[Auto Reframe] Subject focus X coordinate resolved to: ${focusX} (${(focusX * 100).toFixed(1)}%)`);

      // Calculate dynamic crop coordinate based on resolution and focus
      const scaleHeightTop = 640;
      const scaleHeightFull = 1280;

      // Calculate Top/Split-Screen scale & crop parameters
      const topScaleFactor = scaleHeightTop / metadata.height;
      const topScaledWidth = metadata.width * topScaleFactor;
      let topCropX = 0;
      if (topScaledWidth > 720) {
        const subjectPixelX = focusX * topScaledWidth;
        topCropX = Math.round(subjectPixelX - 360);
        // Clamp topCropX between 0 and topScaledWidth - 720
        topCropX = Math.max(0, Math.min(topScaledWidth - 720, topCropX));
      }

      // Calculate Full-Screen scale & crop parameters
      const fullScaleFactor = scaleHeightFull / metadata.height;
      const fullScaledWidth = metadata.width * fullScaleFactor;
      let fullCropX = 0;
      if (fullScaledWidth > 720) {
        const subjectPixelX = focusX * fullScaledWidth;
        fullCropX = Math.round(subjectPixelX - 360);
        // Clamp fullCropX between 0 and fullScaledWidth - 720
        fullCropX = Math.max(0, Math.min(fullScaledWidth - 720, fullCropX));
      }

      // Check if gameplay file exists if split screen is enabled
      if (useSplitScreen && (!gameplayPath || !fs.existsSync(gameplayPath))) {
        return reject(new Error(`Gameplay background video not found at: ${gameplayPath}`));
      }

      // Split transcript segments into individual words and filter those overlapping with this clip's time range
      let clipWords = [];
      if (Array.isArray(transcript) && transcript.length > 0) {
        const segmentStart = actualStart;
        const segmentEnd = actualStart + finalDuration;
        
        // Apply subtitle offset to transcript segments (still supported if users want a custom global shift)
        const shiftedTranscript = transcript.map(t => ({
          ...t,
          start: t.start + (subtitleOffset || 0)
        }));

        // 1. Sort the entire transcript by start time to be safe
        const sortedTranscript = [...shiftedTranscript].sort((a, b) => a.start - b.start);
        
        // 2. Process segments to resolve display overlaps and get clean, non-overlapping boundaries
        const cleanSegments = [];
        for (let i = 0; i < sortedTranscript.length; i++) {
          const seg = sortedTranscript[i];
          const nextSeg = sortedTranscript[i + 1];
          
          const start = seg.start;
          let end = nextSeg ? Math.min(start + seg.duration, nextSeg.start) : start + seg.duration;
          if (end <= start) {
            end = start + 0.5; // fallback
          }
          const duration = end - start;
          
          // Clean and split words, removing punctuation (periods, commas, quotes, brackets, etc.)
          const rawWords = seg.text.trim().split(/\s+/);
          const words = [];
          rawWords.forEach(w => {
            const cleaned = w
              .replace(/[.,\/#!?@$%\^&\*;:{}=\_`~()\"'\[\]]/g, '')
              .replace(/^[>\-\s#]+/, '')
              .replace(/[>\-\s#]+$/, '')
              .trim();
            if (cleaned.length > 0) {
              words.push(cleaned);
            }
          });
          
          if (words.length > 0) {
            cleanSegments.push({
              words,
              start,
              end,
              duration,
              wordDuration: duration / words.length
            });
          }
        }

        // 3. Generate phrase-level chunks (3-4 words) and filter those inside the clip range
        for (const seg of cleanSegments) {
          const chunks = chunkWords(seg.words);
          let currentWordIndex = 0;
          
          for (const chunk of chunks) {
            const firstWordIdx = currentWordIndex;
            const lastWordIdx = currentWordIndex + chunk.length - 1;
            currentWordIndex += chunk.length;
            
            const chunkStart = seg.start + (firstWordIdx * seg.wordDuration);
            const chunkEnd = seg.start + ((lastWordIdx + 1) * seg.wordDuration);
            const textPhrase = chunk.join(' ');
            
            if (chunkStart < segmentEnd && chunkEnd > segmentStart) {
              clipWords.push({
                text: textPhrase,
                start: chunkStart,
                end: chunkEnd
              });
            }
          }
        }

        // 4. Sort phrases by start time and resolve any minor phrase-level overlaps
        clipWords.sort((a, b) => a.start - b.start);
        for (let i = 0; i < clipWords.length - 1; i++) {
          if (clipWords[i].end > clipWords[i + 1].start) {
            clipWords[i].end = clipWords[i + 1].start;
          }
        }
      }

      // Helper to generate dynamic drawtext filters for overlays
      const getDrawtextFilters = () => {
        return clipWords.map(word => {
          const relStart = Math.max(0, word.start - actualStart);
          const relEnd = Math.min(finalDuration, word.end - actualStart);
          const cleanText = escapeDrawtext(word.text.toUpperCase());
          // Using fontcolor=yellow, fontsize=40, borderw=4, bordercolor=black for premium viral styled subtitles
          return `drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='${cleanText}':fontcolor=yellow:fontsize=40:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.65:enable='between(t,${relStart.toFixed(3)},${relEnd.toFixed(3)})'`;
        });
      };

      let cmd = ffmpeg();
      // Use frame-accurate input seeking and duration limiting
      cmd.input(inputPath).inputOptions([`-ss ${actualStart}`, `-t ${finalDuration}`, '-accurate_seek']);

      // Calculate fade-out transition parameters (1.0 second duration or 15% of clip if shorter)
      const fadeDuration = Math.min(1.0, finalDuration * 0.15);
      const fadeStart = finalDuration - fadeDuration;

      if (useSplitScreen) {
        // Get gameplay duration to select a random start point
        const gameplayMetadata = await getVideoMetadata(gameplayPath);
        const gpDuration = parseFloat(gameplayMetadata.duration);
        
        // Pick a random start point in the gameplay video that can fit the clip duration
        let gpStart = 0;
        if (gpDuration > finalDuration) {
          gpStart = Math.floor(Math.random() * (gpDuration - finalDuration));
        }

        cmd.input(gameplayPath);

        const vstackOut = (clipWords.length > 0) ? '[mergedv]' : '[outv]';

        // FFmpeg filter graph:
        // 1. Scale and crop input 0 (main video, already seeked and cut at input level)
        // 2. Scale, crop and trim input 1 (gameplay)
        // 3. Stack vertically (vstack)
        // 4. Align audio
        const filterGraph = [
          `[0:v]scale=${Math.round(topScaledWidth)}:640:force_original_aspect_ratio=increase,crop=720:640:${topCropX}:0,setpts=PTS-STARTPTS[top]`,
          `[1:v]scale=1138:640:force_original_aspect_ratio=increase,crop=720:640,trim=start=${gpStart}:duration=${finalDuration},setpts=PTS-STARTPTS[bottom]`,
          `[top][bottom]vstack=inputs=2${vstackOut}`
        ];

        if (clipWords.length > 0) {
          const drawtextFilters = getDrawtextFilters();
          filterGraph.push(`[mergedv]${drawtextFilters.join(',')}[outv]`);
        }

        // Add video fade filter
        filterGraph.push(`[outv]fade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[fadedv]`);

        if (hasAudio) {
          filterGraph.push(`[0:a]asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[fadeda]`);
        }

        cmd
          .complexFilter(filterGraph)
          .map('[fadedv]');

        if (hasAudio) {
          cmd.map('[fadeda]');
        }
      } else {
        // Single video: Crop to 9:16 (720x1280) with dynamic focus offset
        let videoFilter = `[0:v]scale=${Math.round(fullScaledWidth)}:1280:force_original_aspect_ratio=increase,crop=720:1280:${fullCropX}:0,setpts=PTS-STARTPTS`;
        
        if (clipWords.length > 0) {
          const drawtextFilters = getDrawtextFilters();
          videoFilter += `,${drawtextFilters.join(',')}`;
        }
        
        videoFilter += '[outv]';
        const filterGraph = [videoFilter];

        // Add video fade filter
        filterGraph.push(`[outv]fade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[fadedv]`);

        if (hasAudio) {
          filterGraph.push(`[0:a]asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}[fadeda]`);
        }

        cmd
          .complexFilter(filterGraph)
          .map('[fadedv]');

        if (hasAudio) {
          cmd.map('[fadeda]');
        }
      }

      cmd.duration(finalDuration);

      cmd
        .outputOptions([
          '-c:v libx264',
          '-profile:v main',
          '-level:v 3.0',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart' // Good for web playback/streaming
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('progress', (progress) => {
          // progress.percent is sometimes NaN or unreliable with complex filters
          if (progress.percent) {
            onProgress(Math.min(99, Math.round(progress.percent)));
          } else if (progress.timemark) {
            // Estimate based on timemark vs finalDuration
            const timeParts = progress.timemark.split(':');
            const seconds = parseFloat(timeParts[0]) * 3600 + parseFloat(timeParts[1]) * 60 + parseFloat(timeParts[2]);
            const pct = Math.min(99, Math.round((seconds / finalDuration) * 100));
            onProgress(pct);
          }
        })
        .on('end', () => {
          onProgress(100);
          resolve({ outputPath, focusX });
        })
        .on('error', (err) => {
          console.error('FFmpeg processing error:', err);
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

// Trigger restart again and again and again
