/**
 * Allocate the next sequential business code (BIZ0001, BIZ0002, …).
 * Codes are never reused — deleted businesses keep their code, so we must
 * scan existing codes and pick the lowest free number, not count(active) + 1.
 *
 * @param {import('mongoose').Model} BusinessModel
 * @returns {Promise<string>}
 */
async function generateNextBusinessCode(BusinessModel) {
  const existing = await BusinessModel.find({ code: /^BIZ\d+$/ })
    .select('code')
    .lean();

  let maxNum = 0;
  for (const row of existing) {
    const match = String(row.code).match(/^BIZ(\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }

  let candidate = maxNum + 1;
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = `BIZ${String(candidate).padStart(4, '0')}`;
    const taken = await BusinessModel.findOne({ code }).select('_id').lean();
    if (!taken) {
      return code;
    }
    candidate++;
  }

  throw new Error('Unable to allocate a unique business code after 100 attempts');
}

module.exports = { generateNextBusinessCode };
