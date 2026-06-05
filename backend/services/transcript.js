import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Extracts the 11-character YouTube video ID from various YouTube URL formats.
 * @param {string} url - YouTube video URL
 * @returns {string|null} - Video ID or null
 */
export function getYoutubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Fetches the transcript for a YouTube video.
 * @param {string} url - YouTube URL
 * @returns {Promise<Array<{text: string, start: number, duration: number}>>}
 */
export async function getTranscript(url) {
  const videoId = getYoutubeId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Could not extract video ID.');
  }

  try {
    console.log(`[Transcript Service] Fetching transcript for video: ${videoId}`);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(item => ({
      text: item.text,
      start: item.offset / 1000,
      duration: item.duration / 1000
    }));
  } catch (error) {
    console.error(`[Transcript Service] Failed to fetch transcript for video ID ${videoId}:`, error);
    throw new Error(`Failed to retrieve transcript: ${error.message || error}`);
  }
}
