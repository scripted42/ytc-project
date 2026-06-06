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
 * Analyzes a transcript to find viral segments using the configured AI Provider.
 * @param {Array<{text: string, start: number, duration: number}>} transcript - Array of transcript segments
 * @param {object} campaign - Campaign data containing guidelines, brand, name, etc.
 * @returns {Promise<Array<object>>} - Array of recommended viral clips
 */
export async function analyzeTranscript(transcript, campaign) {
  // format transcript into a readable text with timestamps
  const formattedTranscript = transcript
    .map(t => `[${Math.round(t.start)}s - ${Math.round(t.start + t.duration)}s] ${t.text}`)
    .join('\n');

  const prompt = `
You are a professional social media viral video specialist and growth marketer.
Your task is to analyze the following YouTube video transcript and identify 3 to 5 segments with the highest potential to go viral as a short-form video (TikTok, YouTube Shorts, Instagram Reels).

Here is the Campaign metadata and Guidelines:
- Campaign Name: ${campaign.name}
- Brand: ${campaign.brand}
- Guidelines: 
${campaign.guidelines}

Guidelines Compliance is CRITICAL. Your suggested title, captions, and tags MUST strictly obey all rules (e.g. FTC disclosures like #Ad as the first line, tagging specific handles, etc.).

Here is the Transcript:
${formattedTranscript}

Identify 3 to 5 viral segments. For each segment, you must strictly follow these rules to ensure context integrity, completeness, and suitability for short-form platforms:
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
      "contextCheck": "Starts with: '[exact start words]'. Ends with: '[exact end words]'. Verification: [Explain why the topic is closed/cliffhanger and doesn't cut off. Mention that the next line starting at X seconds is a new topic/thought or the continuation Part 2].",
      "startTime": 45, // in seconds, must be a number
      "endTime": 75, // in seconds, must be a number
      "duration": 30, // in seconds, must be a number
      "suggestedTitle": "The compliant, high-click-through title for the clip (must end with ' - Part 1' for multi-part clips)",
      "suggestedTags": "The compliant caption & tags containing FTC #Ad on the first line and any other handles"
    }
  ]
}
`;

  try {
    let jsonText = '';

    if (AI_PROVIDER === 'siliconflow') {
      const apiKey = process.env.SILICONFLOW_API_KEY;
      if (!apiKey) {
        throw new Error('SILICONFLOW_API_KEY is not defined. Please add it to your backend/.env file to use SiliconFlow.');
      }
      console.log(`[AI Service] Initiating SiliconFlow analysis using model: ${SILICONFLOW_MODEL}...`);
      jsonText = await callOpenAiCompatibleAPI(
        'https://api.siliconflow.cn/v1/chat/completions',
        apiKey,
        SILICONFLOW_MODEL,
        prompt
      );
    } else if (AI_PROVIDER === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not defined. Please add it to your backend/.env file to use OpenRouter.');
      }
      console.log(`[AI Service] Initiating OpenRouter analysis using model: ${OPENROUTER_MODEL}...`);
      jsonText = await callOpenAiCompatibleAPI(
        'https://openrouter.ai/api/v1/chat/completions',
        apiKey,
        OPENROUTER_MODEL,
        prompt
      );
    } else {
      // Default: Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined. Please configure GEMINI_API_KEY, SILICONFLOW_API_KEY, or OPENROUTER_API_KEY in backend/.env.');
      }
      console.log(`[AI Service] Initiating Gemini analysis using model: ${GEMINI_MODEL}...`);

      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        jsonText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (sdkError) {
        console.warn('[AI Service] SDK call failed, attempting fallback HTTP fetch:', sdkError.message);
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
          throw new Error(`Gemini API HTTP Error: ${httpResponse.status} ${httpResponse.statusText} - ${errText}`);
        }

        const resJson = await httpResponse.json();
        jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    }

    if (!jsonText) {
      throw new Error(`Received empty response from AI Provider (${AI_PROVIDER}).`);
    }

    // Clean JSON if the model ignored responseMimeType and wrapped it in markdown
    const cleanJsonText = jsonText.replace(/^\s*```json/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleanJsonText);

    if (!result.segments || !Array.isArray(result.segments)) {
      throw new Error('Invalid JSON structure returned by AI: missing "segments" array.');
    }

    console.log(`[AI Service] Successfully identified ${result.segments.length} viral segments.`);
    return result.segments;
  } catch (error) {
    console.error(`[AI Service] AI analysis failed (${AI_PROVIDER}):`, error);
    throw new Error(`AI Analysis failed: ${error.message}`);
  }
}

/**
 * Analyzes a video frame image to detect the horizontal location of the speaker.
 * @param {string} imagePath - Path to the extracted frame image
 * @returns {Promise<'left' | 'center' | 'right'>}
 */
export async function detectSpeakerFocus(imagePath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[AI Service] GEMINI_API_KEY is not defined. Defaulting crop position to center.');
    return 'center';
  }

  try {
    if (!fs.existsSync(imagePath)) {
      console.warn(`[AI Service] Frame image does not exist at: ${imagePath}. Defaulting to center.`);
      return 'center';
    }

    const fileData = fs.readFileSync(imagePath);
    const base64Data = fileData.toString('base64');

    const prompt = `
You are an expert video editor. Look at this widescreen (16:9) video frame.
Identify the main subject/speaker's face or body.
Determine which third of the horizontal frame they are primarily located in:
- "left": If the subject is on the left side of the frame.
- "center": If the subject is in the middle of the frame.
- "right": If the subject is on the right side of the frame.
- If there are multiple people evenly spread out, or it is a generic shot, return "center".

Return your answer strictly in JSON format matching this schema:
{
  "focus": "left" | "center" | "right"
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
    if (parsed && (parsed.focus === 'left' || parsed.focus === 'center' || parsed.focus === 'right')) {
      console.log(`[AI Service] Detected speaker focus position: ${parsed.focus}`);
      return parsed.focus;
    }
    return 'center';
  } catch (error) {
    console.error('[AI Service] Error detecting speaker focus, defaulting to center:', error);
    return 'center';
  }
}
