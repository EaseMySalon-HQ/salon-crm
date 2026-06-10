'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const whatsappService = require('../../services/whatsapp-service');

test('getTemplateIdForTest: uses specific slot without falling back to default', () => {
  const previousConfig = whatsappService.config;
  try {
    whatsappService.config = {
      templates: {
        default: 'default_tpl',
        receiptWithFeedback: 'receipt_biz_client_feedback',
      },
    };

    assert.equal(whatsappService.getTemplateIdForTest('receiptWithFeedback'), 'receipt_biz_client_feedback');
    assert.equal(whatsappService.getTemplateIdForTest('receipt'), '');
    assert.equal(whatsappService.getTemplateIdForTest('default'), 'default_tpl');
  } finally {
    whatsappService.config = previousConfig;
  }
});

test('buildReceiptWithFeedbackTestVariables: includes receipt and feedback button paths', () => {
  const vars = whatsappService.buildReceiptWithFeedbackTestVariables();

  assert.equal(vars.body_1, 'Test Client');
  assert.equal(vars.body_2, 'Test Business');
  assert.match(vars.button_1, /^INV-000001\//);
  assert.match(vars.button_2, /^6a24b1a8d7ca686a0bd9ed4c\//);
  assert.doesNotMatch(vars.button_2, /\?/);
});
