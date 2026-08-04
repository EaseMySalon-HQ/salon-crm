'use strict';

const {
  gupshupSubmissionErrorMessage,
  isGupshupTransientSubmitFailure,
  isGupshupTemplateDuplicateError,
} = require('../../lib/gupshup-template-submit');

describe('gupshup-template-submit failure classification', () => {
  test('rate limited submissions are retryable, not rejections', () => {
    const submission = { success: false, status: 429, error: 'Too many requests' };
    expect(isGupshupTransientSubmitFailure(submission)).toBe(true);
    expect(gupshupSubmissionErrorMessage(submission)).toMatch(/rate limit/i);
  });

  test('upstream 5xx is retryable', () => {
    expect(isGupshupTransientSubmitFailure({ success: false, status: 502 })).toBe(true);
    expect(isGupshupTransientSubmitFailure({ success: false, status: 408 })).toBe(true);
  });

  test('validation errors are not retryable and keep the Gupshup message', () => {
    const submission = {
      success: false,
      status: 400,
      error: { message: 'Template elementName already exists' },
    };
    expect(isGupshupTransientSubmitFailure(submission)).toBe(false);
    expect(gupshupSubmissionErrorMessage(submission)).toBe('Template elementName already exists');
    expect(isGupshupTemplateDuplicateError(gupshupSubmissionErrorMessage(submission))).toBe(true);
  });

  test('missing status is not treated as retryable', () => {
    expect(isGupshupTransientSubmitFailure({ success: false, error: 'boom' })).toBe(false);
  });
});
