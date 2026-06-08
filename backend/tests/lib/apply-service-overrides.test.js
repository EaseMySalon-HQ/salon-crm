const {
  applyOverridesToServiceDoc,
  applyOverridesToServiceDocs,
} = require('../../lib/apply-service-overrides');

describe('apply-service-overrides', () => {
  const overrides = {
    'haircut': { price: 499, durationMinutes: 45, enabled: false },
    'sku-abc': { price: 1200 },
  };

  it('applies price, duration, and enabled by catalog key', () => {
    const out = applyOverridesToServiceDoc(
      { name: 'Haircut', price: 300, duration: 30, isActive: true },
      overrides
    );
    expect(out.price).toBe(499);
    expect(out.duration).toBe(45);
    expect(out.isActive).toBe(false);
    expect(out.hasBranchOverride).toBe(true);
  });

  it('matches by sku when present', () => {
    const out = applyOverridesToServiceDoc(
      { name: 'Color', sku: 'SKU-ABC', price: 800, duration: 60 },
      overrides
    );
    expect(out.price).toBe(1200);
  });

  it('returns doc unchanged when no override', () => {
    const svc = { name: 'Spa', price: 2000, duration: 90 };
    const out = applyOverridesToServiceDoc(svc, overrides);
    expect(out.price).toBe(2000);
    expect(out.hasBranchOverride).toBeUndefined();
  });

  it('maps arrays', () => {
    const list = applyOverridesToServiceDocs(
      [
        { name: 'Haircut', price: 300, duration: 30 },
        { name: 'Spa', price: 2000, duration: 90 },
      ],
      overrides
    );
    expect(list[0].price).toBe(499);
    expect(list[1].price).toBe(2000);
  });
});
