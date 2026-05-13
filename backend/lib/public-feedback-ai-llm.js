'use strict';

const { logger } = require('../utils/logger');
const { finalizeAiSuggestedReviewText } = require('./execute-public-feedback-submit');

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

/** Short anonymised samples; commas at natural pauses (shape only). */
function buildHumanShapeExamples() {
  const pair = pick([
    [
      'Example A shape only salon X pe haircut aur facial, bahut neat kaam, jo bola waisa hi mila, hygiene decent, zaroor recommend',
      'Example B shape only colour yahan kara, stylist ne process samjhaya rush nahi kiya, result jo chahiye tha waisa',
    ],
    [
      'Example A shape only lovely experience yaar, staff friendly, time pe ho gaya, salon clean, thanks team',
      'Example B shape only trim aur cleanup, simple service, paise vasool, polite log, fir se aaungi',
    ],
    [
      'Example A shape only pehla visit, cut bilkul reference jaisa, thank you, happy',
      'Example B shape only pedicure chill tha, pressure adjust kar di, polite log, ek baar worth try',
    ],
  ]);
  return [
    'Shape reference fictional salons copy mat karo sirf flow dekhna comma jaisa rhythm neeche',
    pair[0],
    pair[1],
  ].join('\n');
}

/** Per-request stylistic dice so drafts don't read like the same paragraph. */
function buildVariationBlock(salonDisplayName, itemCount) {
  const name = salonDisplayName || 'the salon';
  const hasItems = Number(itemCount) > 0;

  const lead = pick(
    hasItems
      ? [
          `Say services from JSON thisVisitLineItems first plain words then result then ${name} once`,
          `Start short happy line then bill services aur chota feel jo change`,
          `Two bill lines ho to Went for vibe do teen services warna ek ok`,
          `My stylist bola no invented names phir natural ${name}`,
          `${name} second line outcome first line service only`,
        ]
      : [
          'Outcome team mention ' + name + ' once',
          'Moment concrete shampoo mirror clean tie ' + name,
          'Tiny verdict aur detail aur thanks ya recommend last',
        ]
  );

  const rhythm = pick([
    'Do teen choti lines sms type lamba paragraph nahi',
    'English aur roman hindi mix informal',
    'roman hindi sporadic natural spoken',
  ]);

  const emphasis = pick([
    'Ek service ek feeling bas pamphlet vibe nahi',
    'Stylist team brief listened explained tweaked',
    'Do line items dono bola do ek flowing line ho sake to',
    'WhatsApp aur english vibe',
  ]);

  const ban = pick([
    'Lamba essay nahi chars chhota max teen chunks lines',
    'Devanagari nahi roman hi',
    'Naam nahin banana staff client json naam missing hai',
    'Friendly professional attentive trio cheesy open nahi',
    'Example body copy verbatim nahi vibes only',
  ]);

  const length = pick([
    'Chars lagbhag 110 se 240 chhota sabse badhiya',
    'Chars lagbhag 160 se 320 jitni jaldi done utna mast',
    'Chars lagbhag 200 se 380 aur 420 se upar kabhi mat jao',
  ]);

  const diversity = pick([
    'Ending kabhi dhanyavad kabhi zaroor dubara vibes',
    'Verbs vivid english hindi side qualifiers',
    'Team ya stylist fake names nahin banana',
    'Comma thoughtfully natural clause break har teen shabdon par comma nahin rakho aur har sentence me maximum teen char comma rakho readability ke liye',
  ]);

  return [
    'Variation is draft sirf ye follow kar',
    `Lead structure ${lead}`,
    `Rhythm ${rhythm}`,
    `Emphasis ${emphasis}`,
    `Approx length ${length}`,
    `Anti formula ${ban}`,
    `Variety ${diversity}`,
    'Tone metro india maps hinglish english',
    'Comma style separate chhoti baatein jotting ideas after comma ek space zaroor rakho commas har doosre shabd par mat daalo Oxford list avoid short review hai comma splices limit natural jaise hindi english bolte waqt',
    'OUTPUT commas use karo thoughtfully full stop hyphen dash slash colon bang sawal parentheses quotes bullets mat rakho OUTPUT mein',
    buildHumanShapeExamples(),
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
        ? 'pastSalonServicesFromEarlierCompletedVisits is older completed invoices for same client same business mention only honestly if vibe returning'
        : 'No linked prior services example walk-in or first visit do not claim repeats',
  });

  const system = [
    'You write one very tiny Google Maps style review snippet',
    `${rating} star joy show without rambling`,
    'English aur casual roman hindi mix hinglish spoken',
    'First person chota grammar quirks ok contractions ok apostrophe ok',
    `Name ${biz} exactly once aur natural`,
    'If thisVisitLineItems non empty then weave one exact bill phrase verbatim or near keep whole thing short',
    'Fake names stories areas URLs mat',
    'Optional pastSalonServicesFromEarlierCompletedVisits soft returning nod only honestly still short',
    'Return review snippet ONLY commas as main separator between short phrases one space after comma no space before comma avoid comma after every single word',
    'Speech natural jaise bolte waqt chhota breath comma list spam nahi',
    'Roman script only Devanagari nahi hashtags emoji bullets nahi',
  ].join(' ');

  const variation = buildVariationBlock(biz, itemList.length);
  const userMsg = `SHORT hinglish english maps snippet\n${userBlock}\n\nGrounding truths from JSON stylist names missing so say stylist or inka team no invented titles\n\n${variation}`;
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
      max_tokens: 260,
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
  const cleaned = finalizeAiSuggestedReviewText(raw.trim());
  return cleaned.length >= 15 ? cleaned : null;
}

async function callAnthropic({ apiKey, model, timeoutMs, system, userMsg, temperature, topP }) {
  const body = {
    model,
    max_tokens: 260,
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

  const cleaned = finalizeAiSuggestedReviewText(raw.trim());
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
