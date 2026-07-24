/** CRM data fields available for WhatsApp template variable mapping. */
export const WHATSAPP_DATA_FIELD_OPTIONS: { value: string; label: string; group?: string }[] = [
  { value: 'clientName', label: 'Client name', group: 'Client' },
  { value: 'firstName', label: 'First name', group: 'Client' },
  { value: 'businessName', label: 'Business name', group: 'Business' },
  { value: 'businessCode', label: 'Business code', group: 'Business' },
  { value: 'businessPhone', label: 'Business phone', group: 'Business' },
  { value: 'adminName', label: 'Admin name', group: 'Business' },
  { value: 'loginUrl', label: 'Login URL', group: 'Business' },
  { value: 'welcomeMessage', label: 'Welcome message', group: 'Business' },
  { value: 'serviceName', label: 'Service name', group: 'Appointment' },
  { value: 'date', label: 'Appointment date', group: 'Appointment' },
  { value: 'time', label: 'Appointment time', group: 'Appointment' },
  { value: 'staffName', label: 'Staff name', group: 'Appointment' },
  { value: 'reminderHours', label: 'Reminder hours', group: 'Appointment' },
  { value: 'cancellationReason', label: 'Cancellation reason', group: 'Appointment' },
  { value: 'googleMapsUrl', label: 'Google Maps link', group: 'Links' },
  { value: 'receiptNumber', label: 'Receipt number', group: 'Billing' },
  { value: 'receiptLink', label: 'Receipt link', group: 'Links' },
  { value: 'feedbackLink', label: 'Feedback link', group: 'Links' },
  { value: 'duesAmountFormatted', label: 'Due amount (formatted)', group: 'Billing' },
  { value: 'planName', label: 'Wallet plan name', group: 'Wallet' },
  { value: 'transactionType', label: 'Transaction type (code)', group: 'Wallet' },
  { value: 'transactionTypeLabel', label: 'Transaction type (label)', group: 'Wallet' },
  { value: 'amountFormatted', label: 'Amount (formatted)', group: 'Wallet' },
  { value: 'balanceAfterFormatted', label: 'Balance after (formatted)', group: 'Wallet' },
  { value: 'balanceFormatted', label: 'Current balance (formatted)', group: 'Wallet' },
  { value: 'daysLeft', label: 'Days until expiry', group: 'Wallet' },
  { value: 'expiryDateFormatted', label: 'Expiry date (formatted)', group: 'Wallet' },
  { value: 'description', label: 'Description', group: 'Other' },
  { value: 'message', label: 'Message text', group: 'Other' },
]

export function whatsappDataFieldLabel(field: string): string {
  return WHATSAPP_DATA_FIELD_OPTIONS.find((o) => o.value === field)?.label || field
}

export function sortTemplateVariableKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const at = a.startsWith('button_') ? 1 : 0
    const bt = b.startsWith('button_') ? 1 : 0
    if (at !== bt) return at - bt
    return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0)
  })
}

export function nextTemplateVariableKey(existingKeys: string[]): string {
  const bodyNums = existingKeys
    .filter((k) => k.startsWith('body_'))
    .map((k) => parseInt(k.replace('body_', ''), 10) || 0)
  const buttonNums = existingKeys
    .filter((k) => k.startsWith('button_'))
    .map((k) => parseInt(k.replace('button_', ''), 10) || 0)
  if (bodyNums.length === 0 && buttonNums.length === 0) return 'body_1'
  if (buttonNums.length > 0) return `button_${Math.max(...buttonNums) + 1}`
  return `body_${Math.max(...bodyNums) + 1}`
}

/** Gupshup placeholder index for a slot key (body_1 → {{1}}). */
export function gupshupPlaceholderLabel(varName: string): string {
  const n = parseInt(varName.replace(/\D/g, ''), 10)
  if (!Number.isFinite(n)) return varName
  return varName.startsWith('button_') ? `button ${n}` : `{{${n}}}`
}
