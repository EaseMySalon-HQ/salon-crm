/** Mirrors backend/services/reward-points-service.js preview for POS UI */

export type RewardPointsSettingsLike = {
  enabled?: boolean
  redeemPointsStep?: number
  redeemRupeeStep?: number
  minRedeemPoints?: number
  minBillAmountForRedemption?: number
  maxRedeemPercentOfBill?: number
}

function billMeetsMinAmountForRedemption(
  settings: RewardPointsSettingsLike,
  subtotalBeforeLoyalty: number
) {
  const minBill = Math.max(0, Number(settings.minBillAmountForRedemption) || 0)
  if (minBill <= 0) return true
  return (Number(subtotalBeforeLoyalty) || 0) >= minBill
}

function maxRedeemPointsForBill(
  settings: RewardPointsSettingsLike,
  subtotalBeforeLoyalty: number,
  currentBalance: number
) {
  if (!billMeetsMinAmountForRedemption(settings, subtotalBeforeLoyalty)) {
    return 0
  }
  const pct = Math.min(100, Math.max(0, Number(settings.maxRedeemPercentOfBill) || 0))
  const maxDiscount = (Number(subtotalBeforeLoyalty) || 0) * (pct / 100)
  const step = Number(settings.redeemPointsStep) || 1
  const rupee = Number(settings.redeemRupeeStep) || 0
  if (rupee <= 0 || step <= 0) return 0
  const maxFromPct = Math.floor((maxDiscount * step) / rupee / step) * step
  return Math.min(Math.max(0, currentBalance), Math.max(0, maxFromPct))
}

function rupeeDiscountFromPoints(settings: RewardPointsSettingsLike, points: number) {
  const step = Number(settings.redeemPointsStep) || 1
  const rupee = Number(settings.redeemRupeeStep) || 0
  if (points <= 0 || rupee <= 0) return 0
  return Math.floor(points / step) * rupee
}

export function previewRedemptionLive(
  settings: RewardPointsSettingsLike,
  billSubtotalBeforeLoyalty: number,
  pointsRequested: number,
  currentBalance: number
): { ok: boolean; error?: string; pointsToRedeem: number; discountRupees: number } {
  const minR = Number(settings.minRedeemPoints) || 0
  let pts = Math.floor(Number(pointsRequested) || 0)
  const minBill = Math.max(0, Number(settings.minBillAmountForRedemption) || 0)
  if (pts > 0 && minBill > 0 && !billMeetsMinAmountForRedemption(settings, billSubtotalBeforeLoyalty)) {
    return {
      ok: false,
      error: `Reward points can only be redeemed on bills above ₹${minBill}`,
      pointsToRedeem: 0,
      discountRupees: 0,
    }
  }
  if (pts > 0 && pts < minR) {
    return { ok: false, error: `Minimum redemption is ${minR} points`, pointsToRedeem: 0, discountRupees: 0 }
  }
  const cap = maxRedeemPointsForBill(settings, billSubtotalBeforeLoyalty, currentBalance)
  pts = Math.min(pts, cap)
  const step = Number(settings.redeemPointsStep) || 1
  pts = Math.floor(pts / step) * step
  if (pts < minR) {
    pts = 0
  }
  const discountRupees = rupeeDiscountFromPoints(settings, pts)
  return { ok: true, pointsToRedeem: pts, discountRupees }
}
