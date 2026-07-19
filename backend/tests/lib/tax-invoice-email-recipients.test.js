'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTaxInvoiceEmailRecipients } = require('../../lib/send-wallet-invoice');

test('resolveTaxInvoiceEmailRecipients includes business contact and billing email', () => {
  const recipients = resolveTaxInvoiceEmailRecipients(
    { contact: { email: 'Salon@Example.com' } },
    'billing@easemysalon.in'
  );
  assert.deepEqual(recipients, ['salon@example.com', 'billing@easemysalon.in']);
});

test('resolveTaxInvoiceEmailRecipients dedupes identical emails', () => {
  const recipients = resolveTaxInvoiceEmailRecipients(
    { contact: { email: 'billing@easemysalon.in' } },
    'billing@easemysalon.in'
  );
  assert.deepEqual(recipients, ['billing@easemysalon.in']);
});

test('resolveTaxInvoiceEmailRecipients skips blank values', () => {
  const recipients = resolveTaxInvoiceEmailRecipients(
    { contact: { email: '  ' } },
    null
  );
  assert.deepEqual(recipients, []);
});
