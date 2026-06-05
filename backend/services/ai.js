import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch'; // Fallback fetch in case needed

/**
 * Analyzes a transcript to find viral segments using Gemini API.
 * @param {Array<{text: string, start: number, duration: number}>} transcript - Array of transcript segments
 * @param {object} campaign - Campaign data containing guidelines, brand, name, etc.
 * @returns {Promise<Array<object>>} - Array of recommended viral clips
 */
export async function analyzeTranscript(transcript, campaign) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined. Please add it to your backend/.env file to use AI analysis.');
  }

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

Identify 3 to 5 viral segments. For each segment, you must strictly follow these rules to ensure context integrity and prevent any premature cutoffs:
1. Choose a logical beginning and end based on the conversation/action.
   CRITICAL: Ensure the segment is conceptually COMPLETE. It must include both the hook/question/setup and the full resolution/answer. It MUST NOT cut off mid-thought, mid-sentence, or before the main point is fully answered.
2. DETECT NATURAL SENTENCE BOUNDARIES: Since automatic transcripts lack punctuation, you must identify where sentences naturally start and end based on grammatical flow, subject-verb transitions, and conjunctions (e.g., "But", "So", "Step one", "Yes", "When"). Your startTime MUST align with the exact first word of a sentence or a new topic, and your endTime MUST align with the final word of the closing thought/sentence.
3. LOOKAHEAD CONTEXT CHECK: Look at the transcript text preceding your proposed startTime and following your proposed endTime. Ensure that you are not cutting a sentence in half, and that the person is not in the middle of answering the core question. If the answer extends over multiple transcript lines, you MUST extend your endTime to capture all of it.
4. PREVENT AUDIO BLEEDING & OVERLAP CUTOFFS: YouTube automatic transcript lines often have overlapping timestamps. If your chosen final sentence ends at time X, but the next sentence/speaker starts at time Y (where Y is earlier than X or very close to it), you MUST either:
   - Cut early: Set the endTime at least 1.0 second BEFORE time Y (e.g. Y - 1.0) so the first words of the next sentence are not heard/bled at the end of the clip.
   - Extend: Or, if you want to include that next sentence, extend the endTime to cover the entire next sentence/thought completely. Never let the clip cut off in the middle of the next sentence's audio.
5. CLIP DURATION FLEXIBILITY: The duration of each segment should be between 15 and 60 seconds. Do not artificially shorten a clip to 15-25 seconds if the speaker is still resolving the point. It is a severe failure to cut a segment before the answer is completed. Prioritize completeness and satisfaction over shorter lengths.
6. DOUBLE VERIFY CONTEXT: In the "contextCheck" field, you must write a strict verification summary detailing:
   - The exact first 5-10 words of the segment (proving it starts at a natural boundary/thought).
   - The exact last 5-10 words of the segment (proving the thought/sentence is fully closed).
   - Proof of topic closure: Confirm that the next transcript line immediately following the endTime begins a completely new topic or speaker transition, proving this segment is self-contained. Also verify that you avoided audio bleeding of the next sentence by cutting early or extending fully.

Return the result STRICTLY as a JSON object with a "segments" key containing an array of objects. Do not include any markdown formatting (like \`\`\`json) in your raw response unless using structured output. The JSON schema must be:
{
  "segments": [
    {
      "title": "Brief title of the segment",
      "explanation": "Why this segment has high viral potential (hook, emotional climax, etc.)",
      "contextCheck": "Starts with: '[exact start words]'. Ends with: '[exact end words]'. Verification: [Explain why the topic is closed and doesn't cut off. Mention that the next line starting at X seconds is a new topic/thought].",
      "startTime": 45, // in seconds, must be a number
      "endTime": 75, // in seconds, must be a number
      "duration": 30, // in seconds, must be a number
      "suggestedTitle": "The compliant, high-click-through title for the clip",
      "suggestedTags": "The compliant caption & tags containing FTC #Ad on the first line and any other handles"
    }
  ]
}
`;

  try {
    console.log('[AI Service] Initiating Gemini analysis...');
    let jsonText = '';

    try {
      // Primary: Use the official SDK
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      jsonText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (sdkError) {
      console.warn('[AI Service] SDK call failed, attempting fallback HTTP fetch:', sdkError.message);
      // Fallback: Direct HTTP POST fetch
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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

    if (!jsonText) {
      throw new Error('Received empty response from Gemini API.');
    }

    // Clean JSON if the model ignored responseMimeType and wrapped it in markdown
    const cleanJsonText = jsonText.replace(/^\s*```json/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleanJsonText);

    if (!result.segments || !Array.isArray(result.segments)) {
      throw new Error('Invalid JSON structure returned by Gemini: missing "segments" array.');
    }

    console.log(`[AI Service] Successfully identified ${result.segments.length} viral segments.`);
    return result.segments;
  } catch (error) {
    console.error('[AI Service] Gemini analysis failed:', error);
    throw new Error(`AI Analysis failed: ${error.message}`);
  }
}
