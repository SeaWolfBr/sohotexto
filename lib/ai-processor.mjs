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
  return `You are a senior analyst summarizing a video for another professional who did not watch it. Your job is to extract what matters, including nuance, constraints, assumptions, tensions, and non-obvious takeaways. Do not inflate weak material.

lang: ${lang}
title: ${title || "(not available)"}
transcript: ${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Instructions:

* Write in the language specified by lang.
* If lang is "pt", write in natural Brazilian Portuguese.
* If lang is "en", write in natural English.
* Return only valid JSON. No markdown fences, no commentary, no preface, no notes.
* Output exactly this schema:
  {
    "keyPoints": ["..."],
    "text": "...",
    "topics": ["..."]
  }
* keyPoints must contain 3 to 5 concise points.
* Each key point should capture a meaningful takeaway, caveat, contrast, or implication — not just the obvious topic.
* text must be 2 to 3 paragraphs inside one JSON string. Separate paragraphs with \\n\\n.
* The summary must sound like an experienced analyst briefing a colleague: direct, precise, calm, and specific.
* topics must be a compact array of specific topical tags in lower case. No hashtags. No generic filler tags.
* Base every claim on the transcript and title. Do not infer details that are not supported.
* If the transcript is thin, noisy, repetitive, vague, or too short to support depth, say that plainly and keep the summary narrow instead of inventing nuance.
* Prefer concrete nouns and verbs over abstract praise.
* Do not use generic enthusiasm, inflated framing, or promotional language.
* Explicitly avoid words and phrases such as: "dive into", "explore", "incredible", "fascinating", "amazing", "game-changing", "must-watch", "powerful", "unlock", or close equivalents in the target language.
* Do not use obvious numbered prose patterns in the summary body such as "first... second... third...".
* Do not use artificial transitions such as "overall", "in conclusion", "to wrap up", "that said", "needless to say", or their equivalents in the target language.
* Do not end with a motivational or generic concluding line.
* Do not output anything outside the JSON object.`;
}

function socialPostsPrompt(title, transcript, lang) {
  return `You are a professional content writer repurposing a video into social posts for someone who actually watched it and wants to share one clear takeaway, tension, or perspective. The goal is not to summarize the whole video. The goal is to surface a specific insight that feels observed, grounded, and human.

lang: ${lang}
title: ${title || "(not available)"}
transcript: ${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Instructions:

* Write in the language specified by lang.
* If lang is "pt", write in natural Brazilian Portuguese.
* If lang is "en", write in natural English.
* Return only valid JSON. No markdown fences, no commentary, no notes.
* Output exactly this schema:
  {
    "twitter": "...",
    "instagram": "...",
    "linkedin": "..."
  }
* twitter must be 270 characters or fewer.
* instagram must be 150 to 300 words and include 3 to 6 hashtags at the end.
* linkedin must be 100 to 200 words and must not include hashtags.
* Each post must focus on one specific observation, argument, tension, lesson, or implication from the video.
* Do not write generic synopses of the full video.
* twitter must express a perspective, not a recap.
* instagram may carry emotion, but keep it restrained, specific, and credible.
* linkedin should sound informed and authoritative without sounding self-important or preachy.
* Use details that are clearly grounded in the transcript and title.
* If the source material is too thin to support a strong angle, be honest and choose the most defensible narrow insight instead of fabricating depth.
* Avoid generic social copy patterns such as "3 lessons from this video", "this changed my perspective", "you need to watch this", "let's break this down", "here's the thing", or close equivalents in the target language.
* Avoid vague enthusiasm and promotional filler.
* Explicitly avoid words and phrases such as: "dive into", "explore", "incredible", "fascinating", "amazing", "game-changing", "must-watch", "powerful", "unlock", or close equivalents in the target language.
* Do not use all-caps headlines except for standard acronyms.
* Do not use obvious numbered prose structures in the body.
* Do not use artificial transitions or motivational endings.
* Instagram hashtags must be specific to the subject, niche, or audience. Do not use generic filler hashtags such as #motivation, #success, #viral, #mindset, or their equivalents.
* Do not output anything outside the JSON object.`;
}

function contentIdeasPrompt(title, transcript, lang) {
  return `You are an editorial strategist generating repurposing options from a video transcript. Your job is to create options that are specific to the actual material, not generic creator clichés. Aim for precision, tension, and originality without fake drama.

lang: ${lang}
title: ${title || "(not available)"}
transcript: ${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

Instructions:

* Write in the language specified by lang.
* If lang is "pt", write in natural Brazilian Portuguese.
* If lang is "en", write in natural English.
* Return only valid JSON. No markdown fences, no commentary, no notes.
* Output exactly this schema:
  {
    "titles": ["...", "...", "..."],
    "hooks": ["...", "...", "..."],
    "angles": [
      { "format": "...", "theme": "...", "idea": "..." },
      { "format": "...", "theme": "...", "idea": "..." },
      { "format": "...", "theme": "...", "idea": "..." }
    ]
  }
* titles must contain exactly 3 alternative titles.
* hooks must contain exactly 3 opening lines for short videos.
* angles must contain exactly 3 repurposing suggestions, each with:
  * format: the content format or packaging
  * theme: the precise subject focus
  * idea: the specific execution angle
* Titles should be intriguing, specific, and credible. They must not feel like obvious clickbait.
* Hooks should create real curiosity, tension, contrast, or stakes without fake urgency.
* Angles must be creative but still anchored in the actual video content.
* Do not generate generic options that could apply to any video.
* If the transcript is thin, keep the options narrower and more modest instead of manufacturing drama or complexity.
* Avoid fake urgency, inflated mystery, and creator clichés such as "you won't believe", "nobody talks about this", "watch till the end", "this changes everything", or close equivalents in the target language.
* Avoid vague enthusiasm and promotional adjectives.
* Explicitly avoid words and phrases such as: "dive into", "explore", "incredible", "fascinating", "amazing", "game-changing", "must-watch", "powerful", "unlock", or close equivalents in the target language.
* Do not use all caps except for standard acronyms.
* Do not use formulaic title patterns unless the transcript truly supports them.
* Do not output anything outside the JSON object.`;
}

// ─── AI CALLS ─────────────────────────────────────────────

async function callClaude(prompt) {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

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
