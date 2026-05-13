'use strict';

const { sanitizeReviewText } = require('./execute-public-feedback-submit');

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

  let serviceBit = '';
  if (uniqueItems.length === 1) {
    serviceBit = ` I especially appreciated ${uniqueItems[0]}.`;
  } else if (uniqueItems.length >= 2) {
    const copy = [...uniqueItems];
    const last = copy.pop();
    serviceBit = ` Highlights for me were ${copy.join(', ')} and ${last}.`;
  }

  let historyBit = '';
  if (pastForTemplate.length >= 1) {
    const ph = pastForTemplate.slice(0, 2).join(' & ');
    historyBit = ph ? ` Earlier visits included ${ph}—this time was just as thoughtful.` : '';
  }

  const r = Math.max(1, Math.min(5, Math.round(Number(rating)) || 3));

  let raw;
  if (r >= 5) {
    raw = pick([
      `${biz} was an easy yes for me.${serviceBit} The stylist actually listened instead of speeding through, and I left looking like I'd pictured.`,
      `Walked into ${biz} on a whim and stayed because the vibe was calm and intentional.${serviceBit} I'd book again.`,
      `${serviceBit.trim() ? `${serviceBit.trim()} ` : ''}${biz} has that rare mix—you feel looked after without anyone hovering.`,
      `${biz}: quick check-in, clear expectations, and my hair behaved for days.${serviceBit} Thanks for treating it like craftsmanship, not rushed volume.`,
      `I'm picky about salons; ${biz} earned the hype from my appointment.${serviceBit} Clean space, kind people, steady hands.`,
      `Left ${biz} feeling lighter in the best way—not just the haircut.${serviceBit} They checked in enough to get it right, not so much it felt scripted.`,
      `If you're scrolling reviews for ${biz}, my visit was quietly great.${serviceBit} No drama, solid skill, genuinely friendly front desk.`,
      `First time trying ${biz}.${serviceBit} They explained choices in plain English and didn't upsell nonsense—really appreciated that.`,
      `Been to ${biz} more than once at this point; this visit still felt fresh.${serviceBit} Same attention to detail, still easy conversation.`,
      `Hard to articulate, but ${biz} nailed the mood—bright, organized, unrushed.${serviceBit} Recommend telling them what vibe you want; they steer well.`,
      `Posting this because friends keep asking where I went: ${biz}.${serviceBit} Book with buffer so you're not squeezed; worth it.`,
    ]);
  } else if (r === 4) {
    raw = pick([
      `I enjoyed my visit to ${biz} and would come again.${serviceBit} A few small things could be even tighter, but overall it was a very good experience.`,
      `Solid experience at ${biz}.${serviceBit} The team was welcoming; with a little more consistency it would be perfect.`,
      `Overall a great appointment at ${biz}.${serviceBit} Thank you—I'm happy to recommend you to friends.`,
    ]);
  } else if (r === 3) {
    raw = pick([
      `My visit to ${biz} was okay.${serviceBit} Some parts went well and others felt average—there's room to make the experience more consistent.`,
      `Mixed experience at ${biz}.${serviceBit} The basics were fine, but I think communication and pacing could improve.`,
      `${biz} met my expectations in parts but not across the board.${serviceBit} With a bit more polish I'd rate it higher next time.`,
    ]);
  } else if (r === 2) {
    raw = pick([
      `I was disappointed with my visit to ${biz}.${serviceBit} I think clearer communication and attention to detail would help a lot.`,
      `Unfortunately this visit didn't go as hoped.${serviceBit} I'd appreciate a more thoughtful experience if I return.`,
      `Several things felt off during my appointment at ${biz}.${serviceBit} I'm sharing this in the hope it helps the team improve.`,
    ]);
  } else {
    raw = pick([
      `I did not have a good experience at ${biz}.${serviceBit} I expected better service and follow-through.`,
      `Very disappointed with my visit to ${biz}.${serviceBit} I hope the team can take this feedback seriously.`,
      `This visit fell well short of what I expect.${serviceBit} I'm leaving honest feedback so ${biz} can improve.`,
    ]);
  }

  if (r >= 5 && historyBit) {
    raw = `${raw.trimEnd()} ${historyBit.trim()}`.trim();
  }

  return sanitizeReviewText(raw);
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
