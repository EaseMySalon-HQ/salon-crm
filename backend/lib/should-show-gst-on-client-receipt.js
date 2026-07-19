/** Whether the tenant GSTIN should appear on client service/product receipts. */
function shouldShowGstOnClientReceipt(businessSettings) {
  if (!businessSettings) return false;
  const gst = String(businessSettings.gstNumber ?? '').trim();
  if (!gst) return false;
  if (typeof businessSettings.showGstOnClientReceipts === 'boolean') {
    return businessSettings.showGstOnClientReceipts;
  }
  return businessSettings.receiptTemplate?.showGstNumber !== false;
}

module.exports = { shouldShowGstOnClientReceipt };
