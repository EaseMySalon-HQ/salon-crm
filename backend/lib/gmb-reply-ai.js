/**
 * AI-powered GMB review reply generation.
 */

'use strict';

const { logger } = require('../utils/logger');

const DEFAULT_MODEL = process.env.GMB_AI_MODEL || 'claude-sonnet-4-20250514';

function buildPrompt({ salonName, city, reviewerName, starRating, reviewText, tone, language }) {
  const ratingGuide = {
    5: 'Warm thank-you; reference a specific detail from the comment if present; invite them back.',
    4: 'Positive acknowledgment; express hope to serve again.',
    3: 'Acknowledge concern diplomatically; invite back for a better experience.',
    2: 'Sincere apology; offer to resolve offline; provide contact invitation.',
    1: 'Sincere apology; offer to resolve offline; provide contact invitation.',
  };

  const toneGuide = {
    formal: 'Use formal, professional language.',
    friendly: 'Use warm, friendly language.',
    casual: 'Use casual, conversational language.',
  };

  const langGuide = {
    english: 'Reply in English.',
    hindi: 'Reply in Hindi.',
    hinglish: 'Reply in Hinglish (mix of Hindi and English).',
    auto: 'Match the language of the review (English, Hindi, or Hinglish).',
  };

  const hasText = reviewText && reviewText.trim().length > 0;
  const guide = ratingGuide[starRating] || ratingGuide[3];

  return `You are replying to a Google review for ${salonName}${city ? ` in ${city}` : ''}.

Reviewer: ${reviewerName || 'Customer'}
Star rating: ${starRating}/5
Review text: ${hasText ? reviewText : '(star rating only, no written comment)'}

Instructions:
- ${guide}
- ${toneGuide[tone] || toneGuide.friendly}
- ${langGuide[language] || langGuide.auto}
- Keep reply under 100 words.
- End with the salon name "${salonName}".
- Do not use hashtags or emojis excessively.
- Output only the reply text, no quotes or preamble.`;
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

async function generateReply(params, { retry = true } = {}) {
  const prompt = buildPrompt(params);
  try {
    const text = await callAnthropic(prompt);
    if (!text) throw new Error('Empty AI reply');
    return text.slice(0, 600);
  } catch (err) {
    logger.warn('[gmb-reply-ai] generation failed:', err?.message || err);
    if (retry) return generateReply(params, { retry: false });
    throw err;
  }
}

module.exports = { generateReply, buildPrompt };
