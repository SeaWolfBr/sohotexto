import Anthropic from "@anthropic-ai/sdk";

let _client = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL = "claude-sonnet-4-20250514";
const MAX_TRANSCRIPT_CHARS = 28_000;

// ─── PROMPTS ──────────────────────────────────────────────

function summaryPrompt(title, transcript, lang) {
  const labels =
    lang === "pt"
      ? { keyPoints: "Pontos principais", summary: "Resumo", topics: "Tópicos" }
      : { keyPoints: "Key points", summary: "Summary", topics: "Topics" };

  return `You are a precise content analyst. Analyze the following YouTube video transcript and produce a structured summary.

VIDEO TITLE: ${title || "(not available)"}

TRANSCRIPT:
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Respond ONLY in ${lang === "pt" ? "Brazilian Portuguese" : "English"}.
Return ONLY valid JSON with this exact structure — no markdown fences, no extra text:

{
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "text": "A 2-3 paragraph summary of the video content.",
  "topics": ["topic1", "topic2", "topic3", "topic4", "topic5"]
}

Rules:
- keyPoints: 3 to 5 bullet points capturing the most important ideas.
- text: 2-3 paragraphs, clear and informative, capturing the essence of the video.
- topics: 3 to 5 single-word or short-phrase topic tags.
- Be specific to the actual content — no generic filler.`;
}

function socialPostsPrompt(title, transcript, lang) {
  return `You are an expert social media copywriter. Based on the YouTube video transcript below, create ready-to-post content for 3 platforms.

VIDEO TITLE: ${title || "(not available)"}

TRANSCRIPT:
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Respond ONLY in ${lang === "pt" ? "Brazilian Portuguese" : "English"}.
Return ONLY valid JSON with this exact structure — no markdown fences, no extra text:

{
  "twitter": "A compelling tweet (max 270 chars). Can use 1-2 emojis. Make it shareable and engaging.",
  "instagram": "An Instagram caption (150-300 words). Conversational, with line breaks for readability. End with 5-8 relevant hashtags.",
  "linkedin": "A professional LinkedIn post (100-200 words). Insightful, structured with short paragraphs. No hashtags."
}

Rules:
- Each post should stand alone — don't reference the other platforms.
- Capture the most interesting or useful angle from the video.
- Write as if the person posting watched the video and is sharing insights.
- Make it feel authentic, not robotic.
- Twitter: punchy, one core idea.
- Instagram: storytelling or list format, end with hashtags.
- LinkedIn: professional tone, opens with a hook, adds value.`;
}

function contentIdeasPrompt(title, transcript, lang) {
  return `You are a creative content strategist. Based on the YouTube video transcript below, generate content repurposing ideas.

VIDEO TITLE: ${title || "(not available)"}

TRANSCRIPT:
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Respond ONLY in ${lang === "pt" ? "Brazilian Portuguese" : "English"}.
Return ONLY valid JSON with this exact structure — no markdown fences, no extra text:

{
  "titles": [
    "Alternative title 1 for the same content",
    "Alternative title 2 — different angle",
    "Alternative title 3 — different angle"
  ],
  "hooks": [
    "A compelling opening line (first 3 seconds) to grab attention — hook 1",
    "Hook 2 — different approach",
    "Hook 3 — different approach"
  ],
  "angles": [
    "Angle 1: a different perspective or format this content could be repackaged as (e.g., 'This could become a Twitter thread about X')",
    "Angle 2",
    "Angle 3"
  ]
}

Rules:
- titles: 3 catchy, click-worthy alternative titles for the same content.
- hooks: 3 different opening lines designed to grab attention in the first 3 seconds (for Reels, TikTok, YouTube Shorts, etc.).
- angles: 3 creative repurposing suggestions, each specifying the format and the core idea (e.g., "a carousel post about...", "a newsletter issue about...", "a Twitter thread on...").
- Be specific to the actual video content — no generic suggestions.`;
}

// ─── AI CALLS ─────────────────────────────────────────────

async function callClaude(prompt) {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip potential markdown fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned invalid JSON. Raw: " + cleaned.slice(0, 200));
  }
}

// ─── PUBLIC API ───────────────────────────────────────────

export async function generateSummary(transcriptText, title, lang = "en") {
  return callClaude(summaryPrompt(title, transcriptText, lang));
}

export async function generateSocialPosts(transcriptText, title, lang = "en") {
  return callClaude(socialPostsPrompt(title, transcriptText, lang));
}

export async function generateContentIdeas(transcriptText, title, lang = "en") {
  return callClaude(contentIdeasPrompt(title, transcriptText, lang));
}

export async function processAll(transcriptText, title, lang = "en") {
  const [summary, socialPosts, contentIdeas] = await Promise.all([
    generateSummary(transcriptText, title, lang),
    generateSocialPosts(transcriptText, title, lang),
    generateContentIdeas(transcriptText, title, lang),
  ]);

  return { summary, socialPosts, contentIdeas };
}
