const { buildClientSearchQuery, annotateSharedPreviewClient } = require('../../lib/share-clients-across-branches');

describe('share-clients-across-branches', () => {
  it('buildClientSearchQuery returns null for short queries', () => {
    expect(buildClientSearchQuery('a')).toBeNull();
    expect(buildClientSearchQuery('  ab  ')).not.toBeNull();
  });

  it('buildClientSearchQuery uses phone prefix for digit queries', () => {
    const q = buildClientSearchQuery('9876');
    expect(q.$or[0].phone.$regex).toBe('^9876');
  });

  it('annotateSharedPreviewClient marks sibling matches without Mongo ids', () => {
    const preview = annotateSharedPreviewClient(
      { name: 'Alex', phone: '9876543210', email: 'a@b.com' },
      'branch-a'
    );
    expect(preview.sharedPreview).toBe(true);
    expect(preview.sourceBranchId).toBe('branch-a');
    expect(preview.id).toBe('shared-preview:9876543210');
    expect(preview._id).toBeUndefined();
  });
});
