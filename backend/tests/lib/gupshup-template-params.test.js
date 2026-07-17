/**
 * Unit tests for Meta components -> ordered Gupshup params flattening.
 */

const { buildGupshupParams, paramToText } = require('../../lib/gupshup-template-params');

describe('gupshup-template-params', () => {
  it('returns [] for non-array / empty input', () => {
    expect(buildGupshupParams(null)).toEqual([]);
    expect(buildGupshupParams(undefined)).toEqual([]);
    expect(buildGupshupParams([])).toEqual([]);
  });

  it('flattens body text params in order', () => {
    const components = [
      { type: 'body', parameters: [{ type: 'text', text: 'Asha' }, { type: 'text', text: '1200' }] },
    ];
    expect(buildGupshupParams(components)).toEqual(['Asha', '1200']);
  });

  it('orders header params before body params regardless of array order', () => {
    const components = [
      { type: 'body', parameters: [{ type: 'text', text: 'B1' }, { type: 'text', text: 'B2' }] },
      { type: 'header', parameters: [{ type: 'text', text: 'H1' }] },
    ];
    expect(buildGupshupParams(components)).toEqual(['H1', 'B1', 'B2']);
  });

  it('excludes button component params', () => {
    const components = [
      { type: 'body', parameters: [{ type: 'text', text: 'B1' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'ORDER123' }] },
    ];
    expect(buildGupshupParams(components)).toEqual(['B1']);
  });

  it('resolves currency and date_time fallback values', () => {
    const components = [
      {
        type: 'body',
        parameters: [
          { type: 'currency', currency: { fallback_value: 'INR 1,200' } },
          { type: 'date_time', date_time: { fallback_value: '14 Jul' } },
        ],
      },
    ];
    expect(buildGupshupParams(components)).toEqual(['INR 1,200', '14 Jul']);
  });

  it('coerces missing text to empty string (preserves positional count)', () => {
    const components = [
      { type: 'body', parameters: [{ type: 'text' }, { type: 'text', text: 'x' }] },
    ];
    expect(buildGupshupParams(components)).toEqual(['', 'x']);
  });

  it('paramToText handles raw string/number params', () => {
    expect(paramToText('hi')).toBe('hi');
    expect(paramToText(42)).toBe('42');
    expect(paramToText(null)).toBe('');
  });
});
