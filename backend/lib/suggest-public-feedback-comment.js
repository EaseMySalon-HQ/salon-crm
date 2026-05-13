'use strict';

const { finalizeAiSuggestedReviewText } = require('./execute-public-feedback-submit');

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Template drafts for public feedback textarea; resolver prefers OpenAI or Anthropic when configured (public-feedback-ai-llm.js).
 */
function buildSuggestedFeedbackComment({ rating, businessName, itemNames, pastServiceNames }) {
  const biz = (businessName || '').trim() || 'the salon';
  const uniqueItems = [
    ...new Set(
      (itemNames || [])
        .map((n) => String(n || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    ),
  ].slice(0, 4);

  const pastForTemplate = [...new Set(
    (pastServiceNames || []).map((n) => String(n || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  )].slice(0, 3);

  const shortHinglishService =
    uniqueItems.length === 1
      ? `${uniqueItems[0]}, acha mast laga`
      : uniqueItems.length >= 2
        ? (() => {
            const copy = [...uniqueItems];
            const last = copy.pop();
            return `${copy.join(' aur ')} aur ${last}, combo mast`;
          })()
        : '';

  let serviceBitEn = '';
  if (uniqueItems.length === 1) {
    serviceBitEn = `, yaad hai ${uniqueItems[0]} khas tha`;
  } else if (uniqueItems.length >= 2) {
    const copy = [...uniqueItems];
    const last = copy.pop();
    serviceBitEn = `, ${copy.join(' aur ')} aur ${last} combo tha`;
  }

  let historyBitShort = '';
  if (pastForTemplate.length >= 1) {
    const ph = pastForTemplate.slice(0, 2).join(' aur ');
    historyBitShort = ph ? `, pehle ${ph} bhi yahan, ab dubara trusted` : '';
  }

  let historyBitEn = '';
  if (pastForTemplate.length >= 1) {
    const ph = pastForTemplate.slice(0, 2).join(' aur ');
    historyBitEn = ph ? `, pehle ${ph} yahan bhi, ab bhi waise hi vibes` : '';
  }

  const r = Math.max(1, Math.min(5, Math.round(Number(rating)) || 3));

  let raw;
  if (r >= 5) {
    const svc = shortHinglishService;
    const c = svc ? `${svc}, ` : '';
    raw = pick([
      `${biz}, ${c}friendly staff, hygiene okay, zaroor try once`,
      `${biz}, ${c}jo bola waisa outcome, time chill, satisfied lagta hai`,
      `${biz}, ${c}mast flow, stylists calm, chaos nahi, recommend vibes clear`,
      `nice ${biz}, ${c}clean jagah, polite log, worth hai bolenge`,
      `${
        uniqueItems.length >= 2
          ? `${uniqueItems[0]} aur ${uniqueItems[1]}, ${biz}, neat kaam`
          : uniqueItems.length === 1
            ? `${uniqueItems[0]} ke liye gaye, neat delivery mile`
            : `${biz}`
      }, dhanywad team`,
      `${biz}, ${c}slow patiently service mila, thanks, fir jaunga zaroor vibes`,
    ]);
  } else if (r === 4) {
    raw = pick([
      `visit ${biz}, accha, fir se aaunga${serviceBitEn}, ek do point aur tight ho sakta, overall solid`,
      `solid ${biz} experience${serviceBitEn}, dubara aur perfect lag sakti feeling pakki hai`,
      `nice appointment overall ${biz}${serviceBitEn}, friends ko easily suggest kara ja sakta hai`,
    ]);
  } else if (r === 3) {
    raw = pick([
      `okay tha, average mix vibes ${biz}${serviceBitEn}, consistency chahenge dubara`,
      `mixed experience ${biz}${serviceBitEn}, basics fine, pacing aur mazboot baat ki kami lagi`,
      `${biz}${serviceBitEn}, kabhi thik, kabhi average, polish se uplift mumkin`,
    ]);
  } else if (r === 2) {
    raw = pick([
      `disappointed ${biz}${serviceBitEn}, clear detail kam laga mujhe poora expectation nahi`,
      `visit hopes se match nahi kara${serviceBitEn}, dubara better chahiye, ${biz} please note kar lo`,
      `achcha experience nahi tha ${biz}${serviceBitEn}, honest note team ke naam`,
    ]);
  } else {
    raw = pick([
      `good experience nahin lagi ${biz}${serviceBitEn}, expected zyada, outputs kam lage mere hisaab`,
      `very disappointing vibes ${biz}${serviceBitEn}, team please dekho, ise seriously samjho`,
      `expectations niche lagi ${biz}${serviceBitEn}, honest low mood feedback rakha hai`,
    ]);
  }

  if (r >= 5 && historyBitShort) {
    raw = `${raw.trimEnd()}${historyBitShort}`.trim();
  } else if (r < 5 && historyBitEn) {
    raw = `${raw.trimEnd()}${historyBitEn}`.trim();
  }

  return finalizeAiSuggestedReviewText(raw);
}

/**
 * Tries OpenAI or Anthropic when configured; otherwise (or on failure) uses templates.
 * @returns {Promise<{ text: string; source: 'openai' | 'anthropic' | 'template' }>}
 */
async function resolveSuggestedFeedbackComment(params) {
  /** @type {'openai' | 'anthropic' | 'template'} */
  let source = 'template';
  let text = '';

  try {
    const { suggestFeedbackCommentViaLlm } = require('./public-feedback-ai-llm');
    const result = await suggestFeedbackCommentViaLlm(params);
    if (result?.text && result.text.length >= 15) {
      text = result.text;
      source = result.source === 'anthropic' ? 'anthropic' : 'openai';
    }
  } catch (_e) {
    /* fallback below */
  }

  if (!text) {
    text = buildSuggestedFeedbackComment(params);
    source = 'template';
  }

  return { text, source };
}

module.exports = { buildSuggestedFeedbackComment, resolveSuggestedFeedbackComment };
