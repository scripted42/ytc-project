import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Creates and configures a Google OAuth2 client.
 * @returns {object} Google OAuth2 client
 */
export function getOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5000/api/auth/youtube/callback';

  console.log('[YouTube Auth] Attempting to load credentials:');
  console.log('  ClientId:', clientId ? `${clientId.substring(0, 15)}...` : 'undefined');
  console.log('  ClientSecret:', clientSecret ? `${clientSecret.substring(0, 5)}...` : 'undefined');
  console.log('  RedirectUri:', redirectUri);

  if (!clientId || !clientSecret || clientId === 'your_client_id_here' || clientSecret === 'your_client_secret_here') {
    throw new Error('Google YouTube OAuth credentials are not configured in backend/.env. Please configure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google OAuth authorization URL.
 * @returns {string} Auth URL
 */
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Crucial to obtain a refresh token
    prompt: 'consent',     // Forces consent screen to ensure refresh token is returned
    scope: ['https://www.googleapis.com/auth/youtube.upload']
  });
}

/**
 * Exchanges auth code for access & refresh tokens.
 * @param {string} code - Auth code from Google callback
 * @returns {Promise<object>} Auth tokens object
 */
export async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Uploads a video and sets its custom thumbnail on YouTube as a private draft.
 * @param {object} params
 * @param {string} params.videoPath - Path to the mp4 video file
 * @param {string} params.title - Video title
 * @param {string} params.description - Video description / tags
 * @param {string} [params.thumbnailPath] - Optional path to the thumbnail file
 * @param {object} params.tokens - Saved OAuth2 tokens
 * @param {function} [params.onProgress] - Optional upload progress callback
 * @returns {Promise<string>} YouTube Video ID
 */
export async function uploadVideoToYoutube({ videoPath, title, description, thumbnailPath, tokens, onProgress }) {
  console.log(`[YouTube Upload] Initializing upload for video: ${videoPath}`);
  
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found at path: ${videoPath}`);
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Auto refresh tokens if they are close to expiration
  oauth2Client.on('tokens', (newTokens) => {
    console.log('[YouTube Upload] Tokens refreshed automatically by client');
    // Save new tokens (should be handled via event listener or returned)
  });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client
  });

  // Step 1: Upload the video file (set privacy status to private, behaves as draft)
  const videoInsertParams = {
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: title.substring(0, 100), // Max 100 characters for YouTube titles
        description: description,
        categoryId: '22', // Category: People & Blogs
        defaultLanguage: 'id' // Default to Indonesian or allow language option
      },
      status: {
        privacyStatus: 'private', // Uploaded as private draft
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  };

  const response = await youtube.videos.insert(videoInsertParams);
  const videoId = response.data.id;
  console.log(`[YouTube Upload] Video uploaded successfully. Video ID: ${videoId}`);

  // Step 2: Upload custom thumbnail if it exists
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      console.log(`[YouTube Upload] Uploading custom thumbnail: ${thumbnailPath}`);
      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          mimeType: 'image/png', // or check file extension
          body: fs.createReadStream(thumbnailPath)
        }
      });
      console.log(`[YouTube Upload] Custom thumbnail uploaded successfully for Video ID: ${videoId}`);
    } catch (thumbErr) {
      console.error(`[YouTube Upload] Failed to set thumbnail:`, thumbErr.message);
      // Non-blocking error: video upload is already successful
    }
  }

  return videoId;
}
