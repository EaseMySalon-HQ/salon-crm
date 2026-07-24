/** Notification slot → ordered data fields (matches backend platform-template-variable-mapping.js). */
export const WHATSAPP_SLOT_DEFAULT_FIELDS: Record<string, string[]> = {
  welcomeMessage: ['clientName', 'businessName', 'welcomeMessage'],
  platformLeadWelcome: ['firstName'],
  businessAccountCreated: ['businessName', 'businessCode', 'adminName', 'loginUrl'],
  receipt: ['clientName', 'businessName', 'receiptLink'],
  receiptWithFeedback: ['clientName', 'businessName', 'receiptLink', 'feedbackLink'],
  receiptCancellation: ['clientName', 'receiptNumber', 'businessName', 'cancellationReason'],
  appointmentScheduling: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'googleMapsUrl'],
  appointmentConfirmation: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'staffName',
    'businessName',
    'businessPhone',
    'googleMapsUrl',
  ],
  appointmentCancellation: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'businessName',
    'cancellationReason',
    'googleMapsUrl',
  ],
  appointmentReminder: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'businessName',
    'businessPhone',
    'reminderHours',
    'googleMapsUrl',
  ],
  appointmentReschedule: [
    'clientName',
    'businessName',
    'date',
    'time',
    'businessPhone',
  ],
  clientWalletTransaction: [
    'clientName',
    'planName',
    'businessName',
    'transactionTypeLabel',
    'amountFormatted',
    'balanceAfterFormatted',
  ],
  clientWalletExpiryReminder: [
    'clientName',
    'planName',
    'businessName',
    'daysLeft',
    'expiryDateFormatted',
    'balanceFormatted',
  ],
  clientDuesReminder: ['clientName', 'duesAmountFormatted', 'businessName'],
  clientBirthdayReminder: ['clientName', 'businessName', 'businessName'],
  default: ['clientName', 'businessName', 'message'],
}

function receiptButtonField(templateType: string, buttonIndex: number): string {
  if (templateType === 'receiptWithFeedback') {
    if (buttonIndex === 1) return 'receiptLink'
    if (buttonIndex === 2) return 'feedbackLink'
  }
  if (templateType === 'receipt') return 'receiptLink'
  return `button_${buttonIndex}`
}

/** Default body_1… / button_1… mapping when no Gupshup components are available. */
export function buildDefaultWhatsAppVariableMapping(templateType: string): Record<string, string> {
  const fields = WHATSAPP_SLOT_DEFAULT_FIELDS[templateType] || WHATSAPP_SLOT_DEFAULT_FIELDS.default
  const mapping: Record<string, string> = {}
  fields.forEach((field, i) => {
    mapping[`body_${i + 1}`] = field
  })
  if (templateType === 'receipt' || templateType === 'receiptWithFeedback') {
    const buttonCount = templateType === 'receiptWithFeedback' ? 2 : 1
    for (let i = 1; i <= buttonCount; i++) {
      mapping[`button_${i}`] = receiptButtonField(templateType, i)
    }
  }
  return mapping
}
