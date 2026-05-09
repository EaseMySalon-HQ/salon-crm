'use strict';

/**
 * Mutates saleData: sets tip, tipStaffId, tipStaffName, and tipLines consistently.
 * @param {object} saleData - { tip, tipStaffId?, tipStaffName?, tipLines? }
 * @param {import('mongoose').Model|null} Staff
 */
async function normalizeSaleTipPayload(saleData, Staff) {
  const mongoose = require('mongoose');
  const tipNum = Math.max(0, Number(saleData.tip) || 0);

  let lines = Array.isArray(saleData.tipLines) && saleData.tipLines.length > 0 ? saleData.tipLines : null;

  if (!lines && tipNum > 0.005 && saleData.tipStaffId) {
    const sidRaw =
      typeof saleData.tipStaffId === 'object' && saleData.tipStaffId && saleData.tipStaffId._id
        ? saleData.tipStaffId._id
        : saleData.tipStaffId;
    const sid = String(sidRaw != null ? sidRaw : '').trim();
    lines = [
      {
        staffId: sid,
        staffName: saleData.tipStaffName || '',
        amount: tipNum,
      },
    ];
  }

  if (!lines || lines.length === 0) {
    if (tipNum <= 0.005) {
      saleData.tip = 0;
      saleData.tipLines = [];
      saleData.tipStaffId = null;
      saleData.tipStaffName = '';
    }
    return;
  }

  const normalized = [];
  for (const raw of lines) {
    const amt = Math.max(0, Number(raw.amount) || 0);
    if (amt <= 0.005) continue;
    let sidRaw = raw.staffId;
    if (sidRaw != null && typeof sidRaw === 'object' && sidRaw._id) sidRaw = sidRaw._id;
    const sid = String(sidRaw != null ? sidRaw : '').trim();
    if (!sid || !mongoose.Types.ObjectId.isValid(sid)) continue;
    let sname = raw.staffName != null ? String(raw.staffName).trim() : '';
    if (!sname && Staff) {
      try {
        const st = await Staff.findById(sid).select('name').lean();
        if (st && st.name) sname = String(st.name);
      } catch (_) {
        /* ignore */
      }
    }
    if (!sname) sname = 'Staff';
    normalized.push({
      staffId: new mongoose.Types.ObjectId(sid),
      staffName: sname,
      amount: amt,
    });
  }

  const sumTips = normalized.reduce((s, l) => s + l.amount, 0);
  if (sumTips <= 0.005) {
    saleData.tip = 0;
    saleData.tipLines = [];
    saleData.tipStaffId = null;
    saleData.tipStaffName = '';
    return;
  }

  saleData.tip = sumTips;
  saleData.tipLines = normalized;
  const first = normalized[0];
  saleData.tipStaffId = first.staffId;
  saleData.tipStaffName = first.staffName || '';
}

module.exports = { normalizeSaleTipPayload };
