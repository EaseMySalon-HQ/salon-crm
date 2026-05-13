/**
 * Public feedback suggestion: template resolver and OpenAI path when configured.
 */

const {
  resolveSuggestedFeedbackComment,
  buildSuggestedFeedbackComment,
} = require('../../lib/suggest-public-feedback-comment');

describe('suggest-public-feedback-comment', () => {
  const savedKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = savedKey || '';
    if (!savedKey) delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_FEEDBACK_ENABLED;
  });

  it('returns non-empty sanitized template text', () => {
    const t = buildSuggestedFeedbackComment({
      rating: 3,
      businessName: 'Test Salon ',
      itemNames: ['Haircut ', 'Haircut'],
    });
    expect(t.length).toBeGreaterThan(20);
    expect(t).not.toContain('<');
  });

  it('resolve uses template source when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await resolveSuggestedFeedbackComment({
      rating: 4,
      businessName: 'X',
      itemNames: [],
    });
    expect(r.source).toBe('template');
    expect(r.text.length).toBeGreaterThan(15);
  });
});