'use strict';

const { logger } = require('../utils/logger');
const { sanitizeReviewText } = require('./execute-public-feedback-submit');

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

function isAiFeedbackGloballyDisabled() {
  const a = String(process.env.AI_FEEDBACK_ENABLED || '').toLowerCase();
  const o = String(process.env.OPENAI_FEEDBACK_ENABLED || '').toLowerCase();
  return a === '0' || a === 'false' || o === '0' || o === 'false';
}

function normalizeProvider(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'anthropic' || v === 'claude') return 'anthropic';
  return 'openai';
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Per-request stylistic dice so drafts don't read like the same paragraph. */
function buildVariationBlock(salonDisplayName) {
  const name = salonDisplayName || 'the salon';
  const lead = pick([
    'Start with a specific moment or detail (chair area, greeting, pacing) before you zoom out.',
    'Start with the outcome (hair/skin/feeling after), then bring in the staff and salon.',
    `Open with how the visit felt—not a slogan—then mention ${name} once when it fits naturally.`,
    `Put ${name} in the first sentence but vary how you attach the compliment (not always “went to”).`,
    'Delay the salon name to sentence two; sentence one should be concrete and observational.',
  ]);

  const rhythm = pick([
    'Use 2–4 sentences; mix one short punchy line with one longer, looser sentence; contractions okay.',
    'About two sentences, one slightly rambly in a believable thumbs-up tone.',
    'Three tight-ish sentences; no semicolons; read like typing on your phone.',
  ]);

  const emphasis = pick([
    'Lean slightly on listening and tailoring the service.',
    'Lean slightly on cleanliness and calm vibes.',
    'Lean slightly on being on time and smooth front-desk → chair flow.',
    'Balance warmth from the team with noticeable technical skill.',
  ]);

  const ban = pick([
    'Do NOT lead with phrases like “I highly recommend”, “Five stars”, “Amazing experience”, “top-notch”, “from start to finish”.',
    'Avoid stacking adjectives (“wonderful, amazing, incredible” together). If one strong word, keep the rest plain.',
    "Don't lean on vague “great service” without tying it to one concrete moment.",
    'No press-release polish; imperfect rhythm is preferable to symmetrical marketing lines.',
    "Don't close with slogans (“Book now”, “Highly recommend”)—trail off naturally when you're done.",
  ]);

  const length = pick([
    'Target roughly 280–460 characters.',
    'Target roughly 400–680 characters.',
    'Target roughly 520–840 characters.',
  ]);

  const diversity = pick([
    'Prefer different verbs than whatever you defaulted to last draft—vary word choice.',
    'If tempted by “perfect” or “flawless”, downgrade one of them to simpler praise.',
    'Alternate between a “whole team felt solid” vibe vs one stylist standing out—it must stay honest.',
  ]);

  return [
    '---',
    'Variation for THIS draft only (follow closely):',
    `- Lead / structure: ${lead}`,
    `- Rhythm: ${rhythm}`,
    `- Emphasis: ${emphasis}`,
    `- Approx length: ${length}`,
    `- Anti-formula: ${ban}`,
    `- Variety: ${diversity}`,
    '- Every click of “generate” must feel like another human voice, not a template.',
  ].join('\n');
}

function rollSamplingParams() {
  return {
    temperature: 0.78 + Math.random() * 0.2,
    topP: 0.88 + Math.random() * 0.11,
  };
}

function buildPrompts({ rating, businessName, itemNames, pastServiceNames }) {
  const biz = String(businessName || 'Salon').replace(/\s+/g, ' ').trim().slice(0, 120);

  const itemList = [...new Set(
    (itemNames || [])
      .map((n) => String(n || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean))
  ].slice(0, 12);

  const pastList = [...new Set(
    (pastServiceNames || [])
      .map((n) => String(n || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean))
  ].slice(0, 35);

  const userBlock = JSON.stringify({
    salonName: biz,
    starRatingFromOneToFive: rating,
    thisVisitLineItems: itemList.length ? itemList : null,
    pastSalonServicesFromEarlierCompletedVisits: pastList.length ? pastList : null,
    notePastList:
      pastList.length > 0
        ? 'pastSalonServicesFromEarlierCompletedVisits comes from other completed invoices for this same client at this business — use only when it helps an honest returning-customer story.'
        : 'No prior linked service history (e.g. walk-in or first visit). Do not claim repeat visits.',
  });

  const system = [
    'You draft ONE authentic Google Maps / Business review a real guest would paste—never corporate marketing.',
    `${rating}-star happiness must read clearly, but show it through specifics, not hype adjectives.`,
    'First person, conversational English. Sound human: tiny imperfections in rhythm are fine; no hashtag/URL/emoji/bullets.',
    `Mention (${biz}) once early in a natural slot (not twice back-to-back).`,
    'Ground truth in JSON thisVisitLineItems; use pastSalonServicesFromEarlierCompletedVisits only when non-empty and honest.',
    'Each response must be structurally and lexically different from what you would write for another random salon—no stock paragraph.',
    'Return ONLY the review text.',
  ].join(' ');

  const variation = buildVariationBlock(biz);
  const userMsg = `Write their Maps-style salon review.\n${userBlock}\n\n${variation}`;
  return { system, userMsg };
}

function clampTimeoutMs(raw, fallbackMs) {
  const n = Number(raw);
  const base = Number.isFinite(n) ? n : fallbackMs;
  return Math.min(Math.max(base, 5000), 55000);
}

/**
 * @returns {Promise<{ provider: 'openai' | 'anthropic', apiKey: string, model: string, timeoutMs: number } | null>}
 */
async function loadPublicFeedbackAiConfig() {
  if (isAiFeedbackGloballyDisabled()) return null;

  try {
    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettingsModel = mainConnection.model(
      'AdminSettings',
      require('../models/AdminSettings').schema
    );
    const doc = await AdminSettingsModel.findOne().lean();
    const fb = doc?.api?.integrations?.openAiFeedback;

    const keyTrim = fb != null ? String(fb.apiKey || '').trim() : '';
    if (fb?.enabled === true && keyTrim) {
      const provider = normalizeProvider(fb.provider);
      let modelDefault = provider === 'anthropic'
        ? (process.env.ANTHROPIC_FEEDBACK_MODEL || 'claude-3-5-haiku-20241022')
        : (process.env.OPENAI_FEEDBACK_MODEL || 'gpt-4o-mini');
      const model =
        (String(fb.model || '').trim() || modelDefault || (provider === 'anthropic'
          ? 'claude-3-5-haiku-20241022'
          : 'gpt-4o-mini')).trim();

      const rawTimeout = fb.timeoutMs != null
        ? Number(fb.timeoutMs)
        : Number(
            provider === 'anthropic'
              ? process.env.ANTHROPIC_FEEDBACK_TIMEOUT_MS || process.env.OPENAI_FEEDBACK_TIMEOUT_MS || 18000
              : process.env.OPENAI_FEEDBACK_TIMEOUT_MS || 18000
          );
      const timeoutMs = clampTimeoutMs(rawTimeout, 18000);

      return { provider, apiKey: keyTrim, model, timeoutMs };
    }
  } catch (err) {
    logger.warn('[public-feedback-ai] Could not load AdminSettings:', err.message);
  }

  const envProvider = normalizeProvider(process.env.PUBLIC_FEEDBACK_AI_PROVIDER || 'openai');
  if (envProvider === 'anthropic') {
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) return null;
    const model = (
      process.env.ANTHROPIC_FEEDBACK_MODEL ||
      process.env.PUBLIC_FEEDBACK_ANTHROPIC_MODEL ||
      'claude-3-5-haiku-20241022'
    ).trim();
    const timeoutMs = clampTimeoutMs(
      Number(process.env.ANTHROPIC_FEEDBACK_TIMEOUT_MS || process.env.OPENAI_FEEDBACK_TIMEOUT_MS || 18000),
      18000
    );
    return { provider: 'anthropic', apiKey, model, timeoutMs };
  }

  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = (process.env.OPENAI_FEEDBACK_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  const timeoutMs = clampTimeoutMs(Number(process.env.OPENAI_FEEDBACK_TIMEOUT_MS || 18000), 18000);
  return { provider: 'openai', apiKey, model, timeoutMs };
}

async function callOpenAi({ apiKey, model, timeoutMs, system, userMsg, temperature, topP }) {
  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 450,
      temperature,
      top_p: topP,
      presence_penalty: 0.35,
      frequency_penalty: 0.2,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    logger.warn('[public-feedback-ai] OpenAI HTTP', res.status, errBody.slice(0, 200));
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const raw =
    typeof data?.choices?.[0]?.message?.content === 'string'
      ? data.choices[0].message.content
      : typeof data?.choices?.[0]?.text === 'string'
        ? data.choices[0].text
        : '';
  const cleaned = sanitizeReviewText(raw.trim());
  return cleaned.length >= 15 ? cleaned : null;
}

async function callAnthropic({ apiKey, model, timeoutMs, system, userMsg, temperature, topP }) {
  const body = {
    model,
    max_tokens: 450,
    temperature,
    system,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (typeof topP === 'number' && Number.isFinite(topP)) {
    body.top_p = topP;
  }

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': process.env.ANTHROPIC_API_VERSION || '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    logger.warn('[public-feedback-ai] Anthropic HTTP', res.status, errBody.slice(0, 200));
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  let raw = '';
  const blocks = data?.content;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block && typeof block.text === 'string') {
        raw += block.text;
      }
    }
  }

  const cleaned = sanitizeReviewText(raw.trim());
  return cleaned.length >= 15 ? cleaned : null;
}

/**
 * Generates receipt feedback text via configured OpenAI or Anthropic (admin or env).
 * @returns {Promise<{ text: string; source: 'openai' | 'anthropic' } | null>}
 */
async function suggestFeedbackCommentViaLlm(params) {
  const r = Number(params?.rating);
  if (!Number.isInteger(r) || r !== 5) return null;

  const cfg = await loadPublicFeedbackAiConfig();
  if (!cfg) return null;

  const { system, userMsg } = buildPrompts(params);
  const { temperature, topP } = rollSamplingParams();

  try {
    if (cfg.provider === 'anthropic') {
      const text = await callAnthropic({
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
        system,
        userMsg,
        temperature,
        topP,
      });
      return text ? { text, source: 'anthropic' } : null;
    }

    const text = await callOpenAi({
      apiKey: cfg.apiKey,
      model: cfg.model,
      timeoutMs: cfg.timeoutMs,
      system,
      userMsg,
      temperature,
      topP,
    });
    return text ? { text, source: 'openai' } : null;
  } catch (err) {
    logger.warn('[public-feedback-ai] LLM request failed:', err.message);
    return null;
  }
}

module.exports = {
  loadPublicFeedbackAiConfig,
  suggestFeedbackCommentViaLlm,
  normalizeProvider,
};
