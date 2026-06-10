export interface ClientCommunicationConsent {
  promotionalWhatsappEnabled: boolean
  transactionalWhatsappEnabled: boolean
  transactionalSmsEnabled: boolean
}

export const DEFAULT_CLIENT_COMMUNICATION_CONSENT: ClientCommunicationConsent = {
  promotionalWhatsappEnabled: true,
  transactionalWhatsappEnabled: true,
  transactionalSmsEnabled: true,
}

type ConsentSource = {
  promotionalWhatsappEnabled?: boolean
  transactionalWhatsappEnabled?: boolean
  transactionalSmsEnabled?: boolean
  whatsappConsent?: {
    optedIn?: boolean
    waMarketingOptOut?: boolean
  }
  isWalkIn?: boolean
}

/** Normalize API/client records; legacy whatsappConsent maps to promotional only. */
export function normalizeClientCommunicationConsent(
  client?: ConsentSource | null
): ClientCommunicationConsent {
  if (client?.isWalkIn) {
    return {
      promotionalWhatsappEnabled: false,
      transactionalWhatsappEnabled: false,
      transactionalSmsEnabled: false,
    }
  }

  const hasExplicit =
    client?.promotionalWhatsappEnabled !== undefined ||
    client?.transactionalWhatsappEnabled !== undefined ||
    client?.transactionalSmsEnabled !== undefined

  if (hasExplicit) {
    return {
      promotionalWhatsappEnabled: client?.promotionalWhatsappEnabled !== false,
      transactionalWhatsappEnabled: client?.transactionalWhatsappEnabled !== false,
      transactionalSmsEnabled: client?.transactionalSmsEnabled !== false,
    }
  }

  const promoFromLegacy =
    client?.whatsappConsent?.waMarketingOptOut === true
      ? false
      : client?.whatsappConsent?.optedIn !== false

  return {
    promotionalWhatsappEnabled: promoFromLegacy,
    transactionalWhatsappEnabled: true,
    transactionalSmsEnabled: true,
  }
}

export function communicationConsentPayload(
  consent: ClientCommunicationConsent
): ClientCommunicationConsent {
  return {
    promotionalWhatsappEnabled: Boolean(consent.promotionalWhatsappEnabled),
    transactionalWhatsappEnabled: Boolean(consent.transactionalWhatsappEnabled),
    transactionalSmsEnabled: Boolean(consent.transactionalSmsEnabled),
  }
}
