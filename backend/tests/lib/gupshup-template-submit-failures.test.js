'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  gupshupSubmissionErrorMessage,
  isGupshupTransientSubmitFailure,
  isGupshupTemplateDuplicateError,
} = require('../../lib/gupshup-template-submit');

describe('gupshup-template-submit failure classification', () => {
  test('rate limited submissions are retryable, not rejections', () => {
    const submission = { success: false, status: 429, error: 'Too many requests' };
    assert.strictEqual(isGupshupTransientSubmitFailure(submission), true);
    assert.match(gupshupSubmissionErrorMessage(submission), /rate limit/i);
  });

  test('upstream 5xx is retryable', () => {
    assert.strictEqual(isGupshupTransientSubmitFailure({ success: false, status: 502 }), true);
    assert.strictEqual(isGupshupTransientSubmitFailure({ success: false, status: 408 }), true);
  });

  test('validation errors are not retryable and keep the Gupshup message', () => {
    const submission = {
      success: false,
      status: 400,
      error: { message: 'Template elementName already exists' },
    };
    assert.strictEqual(isGupshupTransientSubmitFailure(submission), false);
    assert.strictEqual(
      gupshupSubmissionErrorMessage(submission),
      'Template elementName already exists'
    );
    assert.strictEqual(isGupshupTemplateDuplicateError(gupshupSubmissionErrorMessage(submission)), true);
  });

  test('missing status is not treated as retryable', () => {
    assert.strictEqual(isGupshupTransientSubmitFailure({ success: false, error: 'boom' }), false);
  });
});
