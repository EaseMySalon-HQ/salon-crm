export interface PlanFeatureOverrides {
  features: string[]
  disabledFeatures: string[]
  expiresAt: string
  notes: string
}

export function isPlanFeatureEnabled(
  featureId: string,
  planFeatures: string[],
  overrides: Pick<PlanFeatureOverrides, 'features' | 'disabledFeatures'>,
): boolean {
  const isInPlan = planFeatures.includes(featureId)
  const isGranted = overrides.features.includes(featureId)
  const isDisabled = overrides.disabledFeatures.includes(featureId)
  return (isInPlan || isGranted) && !isDisabled
}

export function togglePlanFeatureOverride(
  featureId: string,
  planFeatures: string[],
  overrides: PlanFeatureOverrides,
): PlanFeatureOverrides {
  const isInPlan = planFeatures.includes(featureId)
  const isGranted = overrides.features.includes(featureId)
  const isDisabled = overrides.disabledFeatures.includes(featureId)
  const currentlyEnabled = (isInPlan || isGranted) && !isDisabled

  if (currentlyEnabled) {
    if (isGranted) {
      return {
        ...overrides,
        features: overrides.features.filter((id) => id !== featureId),
      }
    }
    if (isInPlan) {
      return {
        ...overrides,
        disabledFeatures: [...overrides.disabledFeatures, featureId],
      }
    }
    return overrides
  }

  if (isDisabled) {
    return {
      ...overrides,
      disabledFeatures: overrides.disabledFeatures.filter((id) => id !== featureId),
    }
  }
  if (!isInPlan) {
    return {
      ...overrides,
      features: [...overrides.features, featureId],
    }
  }
  return overrides
}

export function buildPlanFeatureOverridesFromBusiness(
  planFeatures: string[],
  effectiveFeatures: string[],
  storedOverrides?: Partial<PlanFeatureOverrides> | null,
): PlanFeatureOverrides {
  return {
    features: storedOverrides?.features?.length
      ? [...storedOverrides.features]
      : effectiveFeatures.filter((id) => !planFeatures.includes(id)),
    disabledFeatures: storedOverrides?.disabledFeatures?.length
      ? [...storedOverrides.disabledFeatures]
      : planFeatures.filter((id) => !effectiveFeatures.includes(id)),
    expiresAt: storedOverrides?.expiresAt
      ? new Date(storedOverrides.expiresAt).toISOString().split('T')[0]
      : '',
    notes: storedOverrides?.notes || '',
  }
}
