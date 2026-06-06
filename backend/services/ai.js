import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch'; // Fallback fetch in case needed
import fs from 'fs';

const AI_PROVIDER = process.env.AI_PROVIDER || 
                    (process.env.SILICONFLOW_API_KEY ? 'siliconflow' : 
                     process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const SILICONFLOW_MODEL = process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

async function callOpenAiCompatibleAPI(url, apiKey, model, prompt) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Universal text generation function with automatic provider fallback
 * tries preferred AI provider first, and falls back to other configured keys.
 */
async function requestTextAI(prompt) {
  const providers = [];
  
  // Preferred provider
  const preferred = process.env.AI_PROVIDER || 
                    (process.env.SILICONFLOW_API_KEY ? 'siliconflow' : 
                     process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini');
  providers.push(preferred);
  
  // Rest of providers as fallbacks
  const allPossible = ['gemini', 'openrouter', 'siliconflow'];
  for (const p of allPossible) {
    if (!providers.includes(p)) {
      providers.push(p);
    }
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      if (provider === 'gemini') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) continue;
        console.log(`[AI Service] Attempting text request with Gemini...`);
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
              responseMimeType: 'application/json'
            }
          });
          const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) return text;
        } catch (sdkError) {
          console.warn(`[AI Service] Gemini SDK call failed, trying HTTP fallback:`, sdkError.message);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
          const httpResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json'
              }
            })
          });

          if (!httpResponse.ok) {
            const errText = await httpResponse.text();
            throw new Error(`Gemini API HTTP Error: ${httpResponse.status} - ${errText}`);
          }

          const resJson = await httpResponse.json();
          const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) return text;
        }
      } else if (provider === 'openrouter') {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) continue;
        console.log(`[AI Service] Attempting text request with OpenRouter (${OPENROUTER_MODEL})...`);
        const text = await callOpenAiCompatibleAPI(
          'https://openrouter.ai/api/v1/chat/completions',
          apiKey,
          OPENROUTER_MODEL,
          prompt
        );
        if (text) return text;
      } else if (provider === 'siliconflow') {
        const apiKey = process.env.SILICONFLOW_API_KEY;
        if (!apiKey) continue;
        console.log(`[AI Service] Attempting text request with SiliconFlow (${SILICONFLOW_MODEL})...`);
        const text = await callOpenAiCompatibleAPI(
          'https://api.siliconflow.cn/v1/chat/completions',
          apiKey,
          SILICONFLOW_MODEL,
          prompt
        );
        if (text) return text;
      }
    } catch (err) {
      console.warn(`[AI Service] Provider ${provider} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('No AI providers could successfully process the request.');
}

/**
 * Analyzes a transcript to find viral segments using the configured AI Provider.
 * @param {Array<{text: string, start: number, duration: number}>} transcript - Array of transcript segments
 * @param {object} campaign - Campaign data containing guidelines, brand, name, etc.
 * @returns {Promise<Array<object>>} - Array of recommended viral clips
 */
/**
 * Analyzes a specific chunk of the transcript.
 */
async function analyzeSingleTranscriptChunk(chunkSegments, campaign, chunkIndex = 0, totalChunks = 1) {
  // format transcript into a readable text with timestamps
  const formattedTranscript = chunkSegments
    .map(t => `[${Math.round(t.start)}s - ${Math.round(t.start + t.duration)}s] ${t.text}`)
    .join('\n');

  const prompt = `
You are a professional social media viral video specialist and growth marketer.
Your task is to analyze this segment of a YouTube video transcript (Part ${chunkIndex + 1} of ${totalChunks}) and identify 2 to 3 segments with the highest potential to go viral as a short-form video (TikTok, YouTube Shorts, Instagram Reels).

Here is the Campaign metadata and Guidelines:
- Campaign Name: ${campaign.name}
- Brand: ${campaign.brand}
- Guidelines: 
${campaign.guidelines}

Guidelines Compliance is CRITICAL. Your suggested title, captions, and tags MUST strictly obey all rules (e.g. FTC disclosures like #Ad as the first line, tagging specific handles, etc.).

Here is the Transcript Segment for Part ${chunkIndex + 1}:
${formattedTranscript}

Identify 2 to 3 viral segments from this part of the video. For each segment, you must strictly follow these rules to ensure context integrity, completeness, and suitability for short-form platforms:
1. CONTEXT COMPLETENESS: Choose a logical beginning and end based on the conversation/action. The segment must be conceptually complete and not cut off mid-thought, mid-sentence, or before the main point is fully answered.
2. DETECT NATURAL SENTENCE BOUNDARIES: Since automatic transcripts lack punctuation, you must identify where sentences naturally start and end based on grammatical flow, subject-verb transitions, and conjunctions (e.g., "But", "So", "Step one", "Yes", "When"). Your startTime MUST align with the exact first word of a sentence or a new topic, and your endTime MUST align with the final word of the closing thought/sentence.
3. LOOKAHEAD CONTEXT CHECK: Look at the transcript text preceding your proposed startTime and following your proposed endTime. Ensure that you are not cutting a sentence in half, and that the person is not in the middle of answering the core question. If the answer extends over multiple transcript lines, you MUST extend your endTime to capture all of it.
4. PREVENT AUDIO BLEEDING & OVERLAP CUTOFFS: YouTube automatic transcript lines often have overlapping timestamps. If your chosen final sentence ends at time X, but the next sentence/speaker starts at time Y (where Y is earlier than X or very close to it), you MUST either:
   - Cut early: Set the endTime at least 1.0 second BEFORE time Y (e.g. Y - 1.0) so the first words of the next sentence are not heard/bled at the end of the clip.
   - Extend: Or, if you want to include that next sentence, extend the endTime to cover the entire next sentence/thought completely. Never let the clip cut off in the middle of the next sentence's audio.
5. SHORT-FORM PORTABILITY & AUTOMATIC MULTI-PART SPLITTING:
   - Single Clip: If a complete viral segment (setup/hook + full answer/resolution) can fit within 20 to 55 seconds, keep it as a single clip.
   - Multi-Part Clips: If a highly valuable viral segment requires more than 60 seconds (up to 120+ seconds) to fully resolve its context and answer the question completely:
     * You MUST split it into consecutive, sequential clips (e.g., Part 1, Part 2, and Part 3 if necessary).
     * Each part must have a duration between 20 and 55 seconds (so it is eligible for YouTube Shorts/Reels/TikTok).
     * Part 1 must capture the setup/hook and start of the explanation, ending at a logical midpoint/cliffhanger sentence boundary.
     * Part 2 must start EXACTLY at the endTime of Part 1 and continue to the logical end of the explanation/resolution.
     * For multi-part clips, you must append " - Part 1", " - Part 2", etc. to the "title" and the "suggestedTitle". Output them as separate, sequential items in the "segments" array.
6. DOUBLE VERIFY CONTEXT: In the "contextCheck" field, you must write a strict verification summary detailing:
   - The exact first 5-10 words of the segment (proving it starts at a natural boundary/thought).
   - The exact last 5-10 words of the segment (proving the thought/sentence is fully closed or ends at a cliffhanger for Part 1).
   - Proof of topic closure: For single clips, confirm the next line is a new topic. For multi-part clips, confirm that Part 1 seamlessly transitions to Part 2, and Part 2 resolves the thought completely. Also verify that you avoided audio bleeding of the next sentence by cutting early or extending fully.

Return the result STRICTLY as a JSON object with a "segments" key containing an array of objects. Do not include any markdown formatting (like \`\`\`json) in your raw response unless using structured output. The JSON schema must be:
{
  "segments": [
    {
      "title": "Brief title of the segment (e.g. 'How to Win MW4 - Part 1')",
      "explanation": "Why this segment has high viral potential (hook, emotional climax, etc.)",
      "contextCheck": "Starts with: '[exact start words]'. Ends with: '[exact end words]'. Verification: [Explain why the topic is closed/cliffhanger and doesn't cut off].",
      "startTime": 45,
      "endTime": 75,
      "duration": 30,
      "suggestedTitle": "The compliant, high-click-through title for the clip",
      "suggestedTags": "The compliant caption & tags containing FTC #Ad on the first line"
    }
  ]
}
`;

  try {
    console.log(`[AI Service] [Chunk ${chunkIndex + 1}/${totalChunks}] Initiating transcript analysis with provider fallback...`);
    const jsonText = await requestTextAI(prompt);

    if (!jsonText) {
      throw new Error('Received empty response from AI Provider.');
    }

    const cleanJsonText = jsonText.replace(/^\s*```json/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleanJsonText);

    if (!result.segments || !Array.isArray(result.segments)) {
      throw new Error('Invalid JSON structure returned by AI: missing "segments" array.');
    }

    console.log(`[AI Service] [Chunk ${chunkIndex + 1}/${totalChunks}] Successfully identified ${result.segments.length} viral segments.`);
    return result.segments;
  } catch (error) {
    console.error(`[AI Service] [Chunk ${chunkIndex + 1}/${totalChunks}] AI analysis failed:`, error);
    return []; // Return empty array on chunk failure to let other chunks succeed
  }
}

/**
 * Analyzes a transcript to find viral segments using the configured AI Provider.
 * Chunks long videos to ensure coverage across the entire duration (beginning, middle, and end).
 * @param {Array<{text: string, start: number, duration: number}>} transcript - Array of transcript segments
 * @param {object} campaign - Campaign data containing guidelines, brand, name, etc.
 * @returns {Promise<Array<object>>} - Array of recommended viral clips
 */
export async function analyzeTranscript(transcript, campaign) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return [];
  }

  const lastSeg = transcript[transcript.length - 1];
  const totalDuration = lastSeg.start + lastSeg.duration;
  const CHUNK_SIZE = 300; // 5 minutes chunk size

  const chunks = [];
  if (totalDuration <= 360) {
    // Short video (<= 6 mins): analyze as single chunk
    chunks.push(transcript);
  } else {
    // Long video (> 6 mins): divide into 5-minute segments
    const numChunks = Math.ceil(totalDuration / CHUNK_SIZE);
    for (let i = 0; i < numChunks; i++) {
      const chunkStart = i * CHUNK_SIZE;
      const chunkEnd = (i + 1) * CHUNK_SIZE;
      const chunkSegments = transcript.filter(s => s.start >= chunkStart && s.start < chunkEnd);
      if (chunkSegments.length > 0) {
        chunks.push(chunkSegments);
      }
    }
  }

  console.log(`[AI Service] Dividing video of ${Math.round(totalDuration)}s into ${chunks.length} chunks for complete scans...`);

  // Analyze all chunks concurrently
  const chunkPromises = chunks.map((chunkSegments, idx) => 
    analyzeSingleTranscriptChunk(chunkSegments, campaign, idx, chunks.length)
  );

  const results = await Promise.all(chunkPromises);
  const allSegments = results.flat();

  console.log(`[AI Service] All Scans complete. Combined ${allSegments.length} viral segments across the entire video.`);
  return allSegments;
}

/**
 * Analyzes a video frame image to detect the horizontal location of the speaker.
 * @param {string} imagePath - Path to the extracted frame image
 * @returns {Promise<number>} - Normalized horizontal coordinate of the subject's face/body (0.0 to 1.0)
 */
export async function detectSpeakerFocus(imagePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AI Service] GEMINI_API_KEY is not defined. Defaulting crop position to 0.5.');
    return 0.5;
  }

  try {
    if (!fs.existsSync(imagePath)) {
      console.warn(`[AI Service] Frame image does not exist at: ${imagePath}. Defaulting to 0.5.`);
      return 0.5;
    }

    const fileData = fs.readFileSync(imagePath);
    const base64Data = fileData.toString('base64');

    const prompt = `
You are an expert video editor and AI face tracker.
Analyze this widescreen (16:9) video frame.
1. Identify the main speaker or subject's face. If there is no face, identify the main subject/action.
2. Estimate the horizontal center position of the speaker's face/body as a normalized value from 0.0 (left edge of the frame) to 1.0 (right edge of the frame).
   - For example:
     * 0.5 is the exact center.
     * 0.25 is halfway between the left edge and the center.
     * 0.75 is halfway between the center and the right edge.

Return your answer strictly in JSON format matching this schema:
{
  "focusX": 0.5
}
`;

    let jsonText = '';
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });
      jsonText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (sdkError) {
      console.warn('[AI Service] SDK vision call failed, using fallback HTTP fetch:', sdkError.message);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const resJson = await response.json();
      jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!jsonText) {
      throw new Error('Empty response from Gemini Vision API.');
    }

    const cleanJson = jsonText.replace(/^\s*```json/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed && typeof parsed.focusX === 'number' && parsed.focusX >= 0 && parsed.focusX <= 1) {
      console.log(`[AI Service] Detected speaker focus X-coordinate: ${parsed.focusX}`);
      return parsed.focusX;
    }
    return 0.5;
  } catch (error) {
    console.error('[AI Service] Error detecting speaker focus, defaulting to 0.5:', error);
    return 0.5;
  }
}

/**
 * Generates a short, punchy 2-4 word clickbait title for a thumbnail.
 * @param {string} clipTitle - The original video title
 * @returns {Promise<string>} - A short 2-4 word clickbait phrase
 */
export async function generateClickbaitThumbnailTitle(clipTitle) {
  try {
    const prompt = `
You are a viral YouTube Shorts and TikTok thumbnail expert.
Take this video title: "${clipTitle}"
Your task is to generate a highly clickbait, punchy, curiosity-inducing thumbnail text overlay that has a main title and a subtitle/hook.

Rules:
1. It MUST consist of a main title and a subtitle separated by a colon (":").
2. The main title (before the colon) must be a high-impact shock/curiosity word (e.g. "MIND GAMES", "HE LIED", "$25M LOST", "DO THIS").
3. The subtitle (after the colon) must be a short resolution or hook (e.g. "THE SECRET", "DON'T LOOK", "MY BIG REGRET", "THE UNTOLD TRUTH").
4. The entire text must be extremely short: strictly 4 to 6 words maximum in total.
5. Examples:
   - "MIND GAMES: THE SECRET"
   - "HE LIED: $25M LOST"
   - "POWER SECRETS: DO THIS"
   - "JEFF BEZOS: MY REGRET"
6. Do not include quotes or extra commentary. Just output the JSON.

Return your response strictly in JSON format matching this schema:
{
  "thumbnailTitle": "YOUR PHRASE HERE"
}
`;

    const jsonText = await requestTextAI(prompt);
    if (!jsonText) {
      return clipTitle.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
    }

    const cleanJson = jsonText.replace(/^\s*```json/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed && parsed.thumbnailTitle) {
      return parsed.thumbnailTitle.toUpperCase();
    }
    return clipTitle.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
  } catch (error) {
    console.error('[AI Service] Error generating thumbnail title:', error);
    return clipTitle.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
  }
}
