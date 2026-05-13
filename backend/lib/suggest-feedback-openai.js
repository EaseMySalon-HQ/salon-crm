'use strict';

/**
 * Back-compat re-export. Logic lives in public-feedback-ai-llm.js (OpenAI + Anthropic).
 */

const llm = require('./public-feedback-ai-llm');

module.exports = {
  suggestFeedbackCommentViaOpenAi: async (params) => {
    const r = await llm.suggestFeedbackCommentViaLlm(params);
    return r ? r.text : null;
  },
  loadOpenAiFeedbackConfig: llm.loadPublicFeedbackAiConfig,
};
