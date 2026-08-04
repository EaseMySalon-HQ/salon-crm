'use strict';

const {
  suggestUrlExample,
  missingDynamicUrlExamples,
  applyButtonUrlExamples,
} = require('../../lib/whatsapp-template-url-buttons');

describe('whatsapp-template-url-buttons', () => {
  test('suggestUrlExample replaces placeholders', () => {
    expect(suggestUrlExample('https://example.com/{{1}}/view')).toBe(
      'https://example.com/sample/view'
    );
  });

  test('missingDynamicUrlExamples lists dynamic URL buttons without urlExample', () => {
    const missing = missingDynamicUrlExamples({
      buttons: [
        { type: 'URL', text: 'View', url: 'https://example.com/{{1}}' },
        { type: 'URL', text: 'Static', url: 'https://example.com/fixed' },
        {
          type: 'URL',
          text: 'Ok',
          url: 'https://example.com/{{2}}',
          urlExample: 'https://example.com/abc',
        },
      ],
    });
    expect(missing).toHaveLength(1);
    expect(missing[0].index).toBe(0);
    expect(missing[0].suggestedExample).toBe('https://example.com/sample');
  });

  test('applyButtonUrlExamples merges samples onto button rows', () => {
    const components = {
      buttons: [{ type: 'URL', text: 'View', url: 'https://example.com/{{1}}', urlExample: null }],
    };
    applyButtonUrlExamples(components, { 0: 'https://example.com/inv-1' });
    expect(components.buttons[0].urlExample).toBe('https://example.com/inv-1');
  });
});
