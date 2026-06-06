import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './services/db.js';
import { downloadVideo, ensureYtDlp } from './services/downloader.js';
import { createClip, getVideoMetadata } from './services/videoProcessor.js';
import { getTranscript } from './services/transcript.js';
import { analyzeTranscript } from './services/ai.js';
import { extractCandidateFrames, renderThumbnail, cleanupFrames } from './services/thumbnailGenerator.js';
import { getAuthUrl, getTokensFromCode, uploadVideoToYoutube } from './services/youtubePublisher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Serve static assets, downloads, and generated clips
const CLIPS_DIR = path.join(__dirname, 'clips');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const PUBLIC_DIR = path.join(__dirname, 'public');

const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const THUMB_FRAMES_DIR = path.join(THUMBNAILS_DIR, 'frames');

app.use('/clips', express.static(CLIPS_DIR));
app.use('/downloads', express.static(DOWNLOADS_DIR));
app.use('/public', express.static(PUBLIC_DIR));
app.use('/thumbnails', express.static(THUMBNAILS_DIR));
app.use('/thumbnails/frames', express.static(THUMB_FRAMES_DIR));

// Ensure system directories exist
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(path.join(PUBLIC_DIR, 'assets'))) fs.mkdirSync(path.join(PUBLIC_DIR, 'assets'), { recursive: true });

// Active background jobs store for tracking progress
const activeJobs = new Map();

// Helper to update job status
function updateJob(id, updates) {
  const current = activeJobs.get(id) || {};
  activeJobs.set(id, { ...current, ...updates });
}

// -------------------------------------------------------------
// CAMPAIGNS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/campaigns', (req, res) => {
  res.json(db.getCampaigns());
});

app.post('/api/campaigns', (req, res) => {
  const { name, brand, platform, rate, sourceUrl, guidelines } = req.body;
  if (!name || !rate || !sourceUrl) {
    return res.status(400).json({ error: 'Name, Rate, and Source URL are required.' });
  }
  const campaign = db.addCampaign({ name, brand, platform, rate: parseFloat(rate), sourceUrl, guidelines });
  res.status(201).json(campaign);
});

app.put('/api/campaigns/:id', (req, res) => {
  const campaign = db.updateCampaign(req.params.id, req.body);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

app.delete('/api/campaigns/:id', (req, res) => {
  db.deleteCampaign(req.params.id);
  res.json({ success: true });
});

app.post('/api/campaigns/:id/analyze-transcript', async (req, res) => {
  const { id } = req.params;
  const campaign = db.getCampaignById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  try {
    console.log(`[Server] Starting transcript analysis for: ${campaign.name}`);
    
    // 1. Fetch transcript if not already cached
    let transcript = campaign.transcript;
    if (!transcript) {
      transcript = await getTranscript(campaign.sourceUrl);
      db.updateCampaign(id, { transcript });
    }

    // 2. Perform AI analysis
    const viralInsights = await analyzeTranscript(transcript, campaign);
    
    // 3. Cache the viral insights in the DB
    const updatedCampaign = db.updateCampaign(id, { viralInsights });
    
    res.json(updatedCampaign);
  } catch (error) {
    console.error('[Server] Error during transcript analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:id/split', async (req, res) => {
  const { id } = req.params;
  const { clipDuration, useSplitScreen, cropPosition } = req.body;
  
  const campaign = db.getCampaignById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  
  const duration = parseInt(clipDuration, 10) || 30;
  if (duration < 10) {
    return res.status(400).json({ error: 'Clip duration must be at least 10 seconds.' });
  }

  // Respond immediately since downloading and splitting takes time
  res.json({ message: 'Campaign splitting initiated in the background.' });

  // Run in background
  (async () => {
    try {
      const videoExt = 'mp4';
      const videoName = `campaign_${campaign.id}.${videoExt}`;
      const localVideoFile = path.join(DOWNLOADS_DIR, videoName);
      
      let mainVideoLocalPath = localVideoFile;
      if (!fs.existsSync(localVideoFile)) {
        console.log(`[Bulk Split] Downloading campaign video from ${campaign.sourceUrl}...`);
        mainVideoLocalPath = await downloadVideo(campaign.sourceUrl, videoName);
      }
      
      const metadata = await getVideoMetadata(mainVideoLocalPath);
      const totalDuration = parseFloat(metadata.duration);
      
      console.log(`[Bulk Split] Trailer duration is ${totalDuration}s. Creating clips of ${duration}s...`);
      
      let start = 0;
      let count = 1;
      
      while (start < totalDuration) {
        const remaining = totalDuration - start;
        if (remaining < 10) break; // Campaign rule: minimum 10 seconds duration
        
        const currentDuration = Math.min(duration, remaining);
        
        let title = '';
        let tags = '';
        if (campaign.name.toLowerCase().includes('call of duty') || campaign.name.toLowerCase().includes('cod')) {
          title = `Part ${count}: Hype moment in MW4 Reveal Trailer! 🔥 @callofduty`;
          tags = `#Ad\n#MW4 #ModernWarfare4 #clipping`;
        } else {
          title = `${campaign.name} Part ${count}`;
          tags = `#Ad\n#${campaign.brand?.replace(/\s+/g, '') || 'clipping'}`;
        }
        
        db.addClip({
          campaignId: campaign.id,
          name: `${campaign.name} - Part ${count} (Clip @${start}s)`,
          startTime: start,
          duration: currentDuration,
          useSplitScreen: !!useSplitScreen,
          cropPosition: cropPosition || 'auto',
          title,
          tags,
          status: 'pending',
          progress: 0
        });
        
        start += currentDuration;
        count++;
      }
      
      console.log(`[Bulk Split] Created ${count - 1} clips. Starting queue processor.`);
      processQueue();
    } catch (err) {
      console.error('[Bulk Split] Error splitting campaign:', err);
    }
  })();
});

// -------------------------------------------------------------
// CLIPS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/clips', (req, res) => {
  const clips = db.getClips();
  const campaigns = db.getCampaigns();
  
  // Attach campaign info to clips
  const enrichedClips = clips.map(clip => {
    const campaign = campaigns.find(c => c.id === clip.campaignId);
    return {
      ...clip,
      campaignName: campaign ? campaign.name : 'Unknown Campaign',
      campaignRate: campaign ? campaign.rate : 0
    };
  });
  
  res.json(enrichedClips);
});

app.delete('/api/clips/:id', (req, res) => {
  db.deleteClip(req.params.id);
  res.json({ success: true });
});

// Update view count and recalculate earnings
app.put('/api/clips/:id/views', (req, res) => {
  const { views } = req.body;
  const clip = db.getClipById(req.params.id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  
  const campaign = db.getCampaignById(clip.campaignId);
  const rate = campaign ? campaign.rate : 0;
  const earnings = (parseInt(views, 10) / 1000) * rate;
  
  const updatedClip = db.updateClip(req.params.id, {
    views: parseInt(views, 10),
    earnings: parseFloat(earnings.toFixed(2))
  });
  
  res.json(updatedClip);
});

// -------------------------------------------------------------
// CLIP GENERATION PROCESS (ASYNC JOB)
// -------------------------------------------------------------
// Queue State & Processing Worker
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const clips = db.getClips();
    const nextClip = clips.find(c => c.status === 'pending');
    
    if (nextClip) {
      console.log(`[Queue Worker] Found pending clip ${nextClip.id}. Starting processing...`);
      const campaign = db.getCampaignById(nextClip.campaignId);
      const settings = db.getSettings();
      
      // Update status to processing to run the pipeline
      db.updateClip(nextClip.id, { status: 'processing', progress: 5 });
      
      try {
        await generateClipPipeline(nextClip.id, campaign, settings);
        console.log(`[Queue Worker] Successfully processed clip ${nextClip.id}.`);
      } catch (err) {
        console.error(`[Queue Worker] Pipeline failure for clip ${nextClip.id}:`, err);
        db.updateClip(nextClip.id, { status: 'failed', error: err.message });
      }
      
      // Process next clip
      isProcessingQueue = false;
      setTimeout(processQueue, 1000);
    } else {
      isProcessingQueue = false;
    }
  } catch (error) {
    console.error('[Queue Worker] System error:', error);
    isProcessingQueue = false;
  }
}

app.post('/api/clips/generate', async (req, res) => {
  const { campaignId, startTime, duration, useSplitScreen, title, tags, subtitleOffset, cropPosition } = req.body;
  
  const campaign = db.getCampaignById(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  
  // Create a record in clips DB with status 'pending'
  const clipRecord = db.addClip({
    campaignId,
    name: `${campaign.name} - Clip @${startTime}s`,
    startTime: parseInt(startTime, 10),
    duration: parseInt(duration, 10),
    useSplitScreen,
    title: title || `${campaign.name} Clip`,
    tags: tags || '#clipping #contentrewards',
    subtitleOffset: parseFloat(subtitleOffset) || 0,
    cropPosition: cropPosition || 'auto',
    status: 'pending',
    progress: 0
  });

  res.status(202).json(clipRecord);
  
  // Start queue processing in background
  processQueue();
});

// Background pipeline executor
async function generateClipPipeline(clipId, campaign, settings) {
  db.updateClip(clipId, { status: 'downloading', progress: 10 });
  
  let mainVideoLocalPath = '';
  
  // 1. Download Campaign Video
  try {
    const videoExt = 'mp4';
    const videoName = `campaign_${campaign.id}.${videoExt}`;
    const localVideoFile = path.join(DOWNLOADS_DIR, videoName);
    
    if (fs.existsSync(localVideoFile)) {
      console.log('Campaign video already cached locally.');
      mainVideoLocalPath = localVideoFile;
    } else {
      console.log(`Downloading campaign video from ${campaign.sourceUrl}...`);
      mainVideoLocalPath = await downloadVideo(campaign.sourceUrl, videoName, (percent) => {
        db.updateClip(clipId, { progress: Math.round(10 + percent * 0.4) }); // Max 50% download progress
      });
    }
  } catch (err) {
    throw new Error(`Failed to download campaign video: ${err.message}`);
  }

  // 2. Download Gameplay Video if Split Screen enabled
  let gameplayLocalPath = '';
  if (db.getClipById(clipId).useSplitScreen) {
    try {
      db.updateClip(clipId, { status: 'downloading_gameplay', progress: 50 });
      
      const gpFile = settings.gameplayPath;
      if (gpFile && fs.existsSync(gpFile)) {
        gameplayLocalPath = gpFile;
      } else {
        // Fallback: If gameplay video is not downloaded, download it now
        console.log(`Downloading gameplay video from ${settings.gameplayUrl}...`);
        const gpName = 'gameplay_source.mp4';
        gameplayLocalPath = await downloadVideo(settings.gameplayUrl, gpName, (percent) => {
          db.updateClip(clipId, { progress: Math.round(50 + percent * 0.2) }); // Max 70% gameplay download
        });
        db.updateSettings({ gameplayPath: gameplayLocalPath });
      }
    } catch (err) {
      throw new Error(`Failed to download gameplay overlay: ${err.message}`);
    }
  }

  // 3. Process Video (Cut, Crop, Stack)
  try {
    db.updateClip(clipId, { status: 'processing', progress: 75 });
    
    const outputFilename = `clip_${clipId}.mp4`;
    const finalOutputPath = path.join(CLIPS_DIR, outputFilename);
    const clipData = db.getClipById(clipId);
    
    await createClip({
      inputPath: mainVideoLocalPath,
      gameplayPath: gameplayLocalPath,
      startTime: clipData.startTime,
      duration: clipData.duration,
      outputPath: finalOutputPath,
      useSplitScreen: clipData.useSplitScreen,
      title: clipData.title,
      transcript: campaign.transcript,
      subtitleOffset: clipData.subtitleOffset || 0,
      cropPosition: clipData.cropPosition || 'auto',
      onProgress: (pct) => {
        db.updateClip(clipId, { progress: Math.round(75 + pct * 0.25) }); // Map 0-100 FFmpeg to 75-100% total
      }
    });

    // 4. Mark completed
    db.updateClip(clipId, {
      status: 'completed',
      progress: 100,
      filePath: finalOutputPath,
      fileName: outputFilename
    });
    console.log(`Successfully completed generation of clip ${clipId}`);

  } catch (err) {
    throw new Error(`FFmpeg clipping processing failed: ${err.message}`);
  }
}

// -------------------------------------------------------------
// SETTINGS / UTILS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const s = db.getSettings();
  res.json({
    ...s,
    gameplayDownloaded: !!(s.gameplayPath && fs.existsSync(s.gameplayPath))
  });
});

app.post('/api/settings', (req, res) => {
  const settings = db.updateSettings(req.body);
  res.json(settings);
});

// Trigger download of gameplay video
app.post('/api/settings/download-gameplay', async (req, res) => {
  const settings = db.getSettings();
  const jobKey = 'gameplay-download';
  
  if (activeJobs.has(jobKey) && activeJobs.get(jobKey).status === 'running') {
    return res.status(400).json({ error: 'Download is already in progress' });
  }

  updateJob(jobKey, { status: 'running', progress: 0 });
  res.json({ message: 'Gameplay download started' });

  try {
    const gpName = 'gameplay_source.mp4';
    console.log(`Downloading gameplay video: ${settings.gameplayUrl}`);
    const localPath = await downloadVideo(settings.gameplayUrl, gpName, (percent) => {
      updateJob(jobKey, { progress: Math.round(percent) });
    });
    
    db.updateSettings({ gameplayPath: localPath });
    updateJob(jobKey, { status: 'completed', progress: 100 });
  } catch (err) {
    console.error('Failed to download gameplay video:', err);
    updateJob(jobKey, { status: 'failed', progress: 0, error: err.message });
  }
});

// Get gameplay download progress
app.get('/api/settings/download-status', (req, res) => {
  const jobKey = 'gameplay-download';
  const job = activeJobs.get(jobKey) || { status: 'idle', progress: 0 };
  res.json(job);
});

// -------------------------------------------------------------
// THUMBNAIL GENERATION ENDPOINTS
// -------------------------------------------------------------

// Extract candidate frames from a completed clip
app.post('/api/clips/:id/extract-frames', async (req, res) => {
  const clip = db.getClipById(req.params.id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  if (clip.status !== 'completed') return res.status(400).json({ error: 'Clip must be completed before extracting frames.' });
  if (!clip.filePath || !fs.existsSync(clip.filePath)) return res.status(400).json({ error: 'Clip video file not found on disk.' });

  try {
    const campaign = db.getCampaignById(clip.campaignId);
    const originalVideoName = campaign ? `campaign_${campaign.id}.mp4` : '';
    const originalVideoPath = originalVideoName ? path.join(DOWNLOADS_DIR, originalVideoName) : '';

    let sourceVideoPath = clip.filePath;
    let startTime = 0;
    let duration = null;

    if (originalVideoPath && fs.existsSync(originalVideoPath)) {
      console.log(`[Thumbnail] Extracting from clean original video: ${originalVideoPath} at start=${clip.startTime}s, duration=${clip.duration}s`);
      sourceVideoPath = originalVideoPath;
      startTime = parseFloat(clip.startTime) || 0;
      duration = parseFloat(clip.duration) || null;
    } else {
      console.log(`[Thumbnail] Original video not found. Extracting from clip instead: ${clip.filePath}`);
    }

    const framePaths = await extractCandidateFrames(sourceVideoPath, clip.id, startTime, duration);
    // Convert absolute paths to relative URLs for the frontend
    const frameUrls = framePaths.map(fp => {
      const fileName = path.basename(fp);
      return `/thumbnails/frames/${fileName}`;
    });
    db.updateClip(clip.id, { thumbnailFrames: frameUrls });
    res.json({ frames: frameUrls });
  } catch (err) {
    console.error('[Thumbnail] Frame extraction error:', err);
    res.status(500).json({ error: `Frame extraction failed: ${err.message}` });
  }
});

// Generate the final thumbnail from a selected frame
app.post('/api/clips/:id/generate-thumbnail', async (req, res) => {
  const { frameIndex, titleText, textStyle } = req.body;
  const clip = db.getClipById(req.params.id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  if (!clip.thumbnailFrames || clip.thumbnailFrames.length === 0) {
    return res.status(400).json({ error: 'No frames extracted yet. Please extract frames first.' });
  }
  if (frameIndex < 0 || frameIndex >= clip.thumbnailFrames.length) {
    return res.status(400).json({ error: 'Invalid frame index.' });
  }

  try {
    // Resolve the frame URL back to an absolute file path
    const frameUrl = clip.thumbnailFrames[frameIndex];
    const frameFileName = path.basename(frameUrl);
    const framePath = path.join(THUMB_FRAMES_DIR, frameFileName);

    if (!fs.existsSync(framePath)) {
      return res.status(400).json({ error: 'Selected frame file not found. Re-extract frames.' });
    }

    const thumbnailPath = await renderThumbnail({
      framePath,
      titleText: titleText || clip.title || 'Untitled',
      clipId: clip.id,
      textStyle: textStyle || 'classic'
    });

    const thumbnailUrl = `/thumbnails/${path.basename(thumbnailPath)}`;
    db.updateClip(clip.id, { thumbnailPath: thumbnailUrl });

    // Cleanup extracted frames after successful render
    cleanupFrames(clip.id);
    db.updateClip(clip.id, { thumbnailFrames: [] });

    res.json({ thumbnailUrl });
  } catch (err) {
    console.error('[Thumbnail] Render error:', err);
    res.status(500).json({ error: `Thumbnail rendering failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// YOUTUBE PUBLISHING ENDPOINTS
// -------------------------------------------------------------

// Redirect to Google Consent Screen
app.get('/api/auth/youtube', (req, res) => {
  try {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    console.error('[YouTube Auth] Failed to generate auth URL:', err);
    res.status(500).send(`Authentication setup failed: ${err.message}`);
  }
});

// OAuth Callback handler
app.get('/api/auth/youtube/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code is missing.');
  }

  try {
    const tokens = await getTokensFromCode(code);
    db.updateSettings({ youtubeTokens: tokens });
    console.log('[YouTube Auth] Channel connected and tokens saved.');
    res.redirect('http://localhost:5173/?tab=scheduler&auth=success');
  } catch (err) {
    console.error('[YouTube Auth] Error exchanging code for tokens:', err);
    res.status(500).send(`OAuth callback failed: ${err.message}`);
  }
});

// Check YouTube Auth status
app.get('/api/youtube/status', (req, res) => {
  const settings = db.getSettings();
  const connected = !!(settings.youtubeTokens && settings.youtubeTokens.refresh_token);
  res.json({ connected });
});

// Disconnect YouTube Channel
app.post('/api/youtube/disconnect', (req, res) => {
  db.updateSettings({ youtubeTokens: null });
  res.json({ success: true });
});

// Upload Video + Thumbnail as Private Draft to YouTube
app.post('/api/clips/:id/upload-youtube', async (req, res) => {
  const clip = db.getClipById(req.params.id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });
  if (clip.status !== 'completed') return res.status(400).json({ error: 'Clip video file is not ready yet.' });

  const settings = db.getSettings();
  if (!settings.youtubeTokens) {
    return res.status(401).json({ error: 'YouTube channel is not connected. Please authenticate first.' });
  }

  // Check if video file exists
  if (!clip.filePath || !fs.existsSync(clip.filePath)) {
    return res.status(400).json({ error: 'Clip video file not found on disk.' });
  }

  // Resolve custom thumbnail path if ready
  let thumbnailPath = '';
  if (clip.thumbnailPath) {
    thumbnailPath = path.join(THUMBNAILS_DIR, path.basename(clip.thumbnailPath));
    if (!fs.existsSync(thumbnailPath)) {
      thumbnailPath = ''; // fallback to no custom thumbnail if file missing
    }
  }

  // Update status in DB to uploading
  db.updateClip(clip.id, {
    youtubeUploadStatus: 'uploading',
    youtubeUploadError: null
  });

  // Run upload asynchronously in background
  (async () => {
    try {
      const videoId = await uploadVideoToYoutube({
        videoPath: clip.filePath,
        title: clip.title || 'Untitled Clip',
        description: `${clip.title || ''}\n\n${clip.tags || ''}`,
        thumbnailPath,
        tokens: settings.youtubeTokens
      });

      db.updateClip(clip.id, {
        youtubeVideoId: videoId,
        youtubeUploadStatus: 'success',
        youtubeUploadError: null
      });
    } catch (err) {
      console.error(`[YouTube Upload] Failed for clip ${clip.id}:`, err);
      db.updateClip(clip.id, {
        youtubeUploadStatus: 'failed',
        youtubeUploadError: err.message
      });
    }
  })();

  res.status(202).json({ message: 'YouTube upload started in background' });
});




// Init trigger on startup to make sure yt-dlp is available
ensureYtDlp().then(() => {
  console.log('yt-dlp environment ready.');
  
  // Recovery: Reset any interrupted/processing clips to pending and start queue processing
  try {
    const interruptedClips = db.getClips().filter(c => ['downloading', 'downloading_gameplay', 'processing'].includes(c.status));
    if (interruptedClips.length > 0) {
      console.log(`[Startup Recovery] Found ${interruptedClips.length} interrupted clips. Resetting to pending...`);
      for (const clip of interruptedClips) {
        db.updateClip(clip.id, { status: 'pending', progress: 0 });
      }
    }
    processQueue();
  } catch (err) {
    console.error('[Startup Recovery] Error recovering queue:', err);
  }
}).catch(err => {
  console.error('Failed to initialize yt-dlp environment:', err);
});

// Start Server
app.listen(PORT, () => {
  console.log(`ClipFlow backend server is running on http://localhost:${PORT}`);
});
// Nodemon watch trigger comments
