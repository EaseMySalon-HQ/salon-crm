# Feature Gating Implementation Guide

This document explains how to implement feature gating in the application to enforce plan-based access control.

## Overview

The system uses a two-tier approach:
1. **Frontend Gating**: Hide/disable features in the UI based on plan
2. **Backend Gating**: Enforce feature access at the API level

## Architecture (source of truth + caching)

Admin feature toggles are the source of truth and they actually drive access:

- **Plan definitions** are edited in the admin Plan Template Manager and stored
  in the `PlanTemplate` collection. [`backend/lib/plan-resolver.js`](../backend/lib/plan-resolver.js)
  resolves a plan to its features/limits from the DB template (falling back to
  the static `backend/config/plans.js` seed), backed by a short‑TTL in‑memory
  cache that is warmed at startup and invalidated on admin writes.
- **Entitlement resolution** ([`backend/lib/entitlements.js`](../backend/lib/entitlements.js))
  reads from the resolver, so toggling a feature in admin changes what tenants
  can access (after cache invalidation / TTL).
- **Per-business entitlements cache** ([`backend/lib/entitlements-cache.js`](../backend/lib/entitlements-cache.js))
  resolves a business's effective features ONCE and caches them (short TTL), so
  gating does not hit the DB on every request. It is invalidated on plan
  changes (checkout activation, scheduled downgrade apply, admin reassignment)
  and on any plan-template edit.
- **Central route registry** ([`backend/config/feature-routes.js`](../backend/config/feature-routes.js))
  is the single source of truth for which API surfaces each feature gates. Use
  `gate(FEATURE.X)` inline on the matching routes; it is a thin, cache-backed
  wrapper over `requireFeature` (no extra auth, one cache lookup per request).
- **Frontend** uses React Query in [`hooks/use-entitlements.ts`](../hooks/use-entitlements.ts)
  so every `useFeature` / `FeatureGate` call shares ONE cached `/api/business/plan`
  fetch. Call `useInvalidateEntitlements()` (or `refetch`) after plan changes.

### Enforcement status of each feature

| Status | Meaning |
| --- | --- |
| Gated | Enforced at API + UI; toggling changes tenant access |
| Core | Always on for every plan (included for completeness) |
| Planned | Defined but no product surface yet; toggling is a no-op |

- **Gated**: `analytics`, `incentive_management`, `reward_points`, `feedback_management`,
  `advanced_inventory`,
  `advanced_reports`, `data_export`, `custom_receipt_templates`.
- **Core**: `pos`, `appointments`, `crm`, `service_management`,
  `product_management`, `basic_inventory`, `receipts`, `cash_register`,
  `staff_management`, `basic_reports`.
- **Planned (no tenant surface yet)**: `custom_integrations`, `multi_location`,
  `centralized_reporting`, `api_access`, `approval_workflows`. The registry
  already maps `/api/integrations` → `custom_integrations`, so future
  integration routes are gated automatically by adding `gate(FEATURE.CUSTOM_INTEGRATIONS)`.

### Plan tiers (Starter, Growth, Pro)

Built-in subscription plans use ids **`starter`**, **`growth`**, and **`pro`** only.
Admin Plan Template Manager shows these three templates. On startup the server
seeds missing templates, migrates legacy business plan ids to canonical ids,
and deactivates retired plan templates (`free`, `professional`, `enterprise`).

**Incentive Management** (`incentive_management`) gates the full commission
surface: target-based, service-based, and item-based commission profiles,
staff assignments, and the Staff Performance report tab. It is included on
Growth and above, not on Starter. API routes under `/api/commission-profiles`
use `gate(FEATURE.INCENTIVE_MANAGEMENT)`.

Legacy plan templates that still list the removed `staff_commissions` feature
id are aliased to `incentive_management` at entitlement resolution time.

## Frontend Feature Gating

### Using the FeatureGate Component

Wrap any feature that should be plan-restricted with the `FeatureGate` component:

```tsx
import { FeatureGate } from "@/components/ui/feature-gate"

function MyComponent() {
  return (
    <div>
      {/* This feature is available to all plans */}
      <BasicFeature />
      
      {/* This feature is only available to Professional and Enterprise plans */}
      <FeatureGate featureId="analytics">
        <AdvancedAnalytics />
      </FeatureGate>
      
      {/* With custom upgrade message */}
      <FeatureGate 
        featureId="multi_location"
        upgradeMessage="Upgrade to Enterprise plan to manage multiple locations"
      >
        <MultiLocationManager />
      </FeatureGate>
      
      {/* With custom fallback */}
      <FeatureGate 
        featureId="api_access"
        fallback={<div>API access requires Enterprise plan</div>}
        showUpgrade={false}
      >
        <APIAccessSettings />
      </FeatureGate>
    </div>
  )
}
```

### Using the useFeature Hook

For conditional rendering or logic:

```tsx
import { useFeature } from "@/hooks/use-entitlements"

function MyComponent() {
  const { hasAccess, isLoading } = useFeature("advanced_reports")
  
  if (isLoading) return <Loading />
  
  return (
    <div>
      {hasAccess ? (
        <AdvancedReports />
      ) : (
        <UpgradePrompt feature="Advanced Reports" />
      )}
    </div>
  )
}
```

### Using the useEntitlements Hook

For comprehensive plan information:

```tsx
import { useEntitlements } from "@/hooks/use-entitlements"

function MyComponent() {
  const { planInfo, hasFeature, getLimit, canUseAddon } = useEntitlements()
  
  // Check feature access
  const canExport = hasFeature("data_export")
  
  // Check limits
  const maxLocations = getLimit("locations")
  const currentLocations = locations.length
  
  // Check addon
  const canSendWhatsApp = canUseAddon("whatsapp")
  
  return (
    <div>
      <p>Plan: {planInfo?.planName}</p>
      <p>Locations: {currentLocations} / {maxLocations}</p>
      {canExport && <ExportButton />}
      {canSendWhatsApp && <WhatsAppButton />}
    </div>
  )
}
```

## Backend Feature Gating

### Using requireFeature Middleware

Protect API routes with feature requirements:

```javascript
const { requireFeature } = require('../middleware/feature-gate');

// Protect a route that requires analytics. Prefer the central registry:
const { gate, FEATURE } = require('../config/feature-routes');

app.get('/api/analytics/revenue',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  gate(FEATURE.ANALYTICS),
  async (req, res) => {
    // This code only runs if the business plan includes `analytics`
    const analytics = await getAnalytics(req);
    res.json({ success: true, data: analytics });
  }
);
```

### Using requireLimit Middleware

Enforce usage limits:

```javascript
const { requireLimit } = require('../middleware/feature-gate');

// Check location limit before creating a new location
router.post('/api/locations',
  authenticateToken,
  setupBusinessDatabase,
  requireLimit('locations', async (req, business) => {
    // Get current number of locations
    const { Location } = req.businessModels;
    return await Location.countDocuments({ businessId: business._id });
  }),
  async (req, res) => {
    // Create location - limit already checked
    const location = await createLocation(req.body);
    res.json({ success: true, data: location });
  }
);
```

### Using requireAddon Middleware

Check addon availability:

```javascript
const { requireAddon } = require('../middleware/feature-gate');

// Send WhatsApp receipt
router.post('/api/receipts/:id/send-whatsapp',
  authenticateToken,
  setupBusinessDatabase,
  requireAddon('whatsapp'),
  async (req, res) => {
    // Send WhatsApp - addon already verified
    await sendWhatsAppReceipt(req.params.id);
    res.json({ success: true });
  }
);
```

## Feature IDs Reference

Common feature IDs used in the system:

### Core Features (Available in Starter+)
- `pos` - POS & Billing
- `appointments` - Appointment Management
- `crm` - Client Management
- `service_management` - Service Management
- `product_management` - Product Management
- `basic_inventory` - Basic Inventory
- `receipts` - Receipts
- `cash_register` - Cash Register Management
- `staff_management` - Staff Management
- `basic_reports` - Basic Reports

### Growth Features (Available in Starter/Growth+)
- `advanced_inventory` - Advanced Inventory Management
- `advanced_reports` - Advanced Reports
- `analytics` - Analytics
- `incentive_management` - Incentive Management (commission by target, service, or item)
- `reward_points` - Reward Points
- `feedback_management` - Feedback Management
- `custom_receipt_templates` - Custom Receipt Templates
- `data_export` - Data Export

### Enterprise Features
- `multi_location` - Multi-Location Support
- `centralized_reporting` - Centralized Reporting
- `api_access` - API Access
- `custom_integrations` - Custom Integrations
- `approval_workflows` - Approval Workflows

## Examples

### Example 1: Gating a Settings Section

```tsx
// components/settings/advanced-settings.tsx
import { FeatureGate } from "@/components/ui/feature-gate"

export function AdvancedSettings() {
  return (
    <FeatureGate featureId="advanced_reports">
      <div>
        <h2>Advanced Reporting</h2>
        {/* Advanced reporting UI */}
      </div>
    </FeatureGate>
  )
}
```

### Example 2: Conditional Button Rendering

```tsx
import { useFeature } from "@/hooks/use-entitlements"

function ExportButton() {
  const { hasAccess } = useFeature("data_export")
  
  if (!hasAccess) {
    return (
      <Button disabled>
        Export (Upgrade Required)
      </Button>
    )
  }
  
  return <Button onClick={handleExport}>Export Data</Button>
}
```

### Example 3: Backend Route Protection

```javascript
// backend/routes/analytics.js
const { gate, FEATURE } = require('../config/feature-routes');

router.get('/advanced',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.ANALYTICS),
  async (req, res) => {
    // Only accessible to plans that include `analytics`
    const data = await getAnalytics(req);
    res.json({ success: true, data });
  }
);
```

## Best Practices

1. **Always gate on both frontend and backend** - Frontend gating improves UX, backend gating ensures security
2. **Use descriptive feature IDs** - Make it clear what the feature is
3. **Provide helpful upgrade messages** - Tell users what they're missing and how to upgrade
4. **Check limits before operations** - Use `requireLimit` for quota-based features
5. **Log feature access attempts** - Track when users try to access restricted features

## Testing

To test feature gating:

1. Create test businesses with different plans
2. Verify features are hidden/shown correctly in UI
3. Verify API endpoints return proper errors for restricted features
4. Test upgrade flows and prompts

