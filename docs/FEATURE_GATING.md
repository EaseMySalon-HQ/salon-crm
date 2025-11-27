# Feature Gating Implementation Guide

This document explains how to implement feature gating in the application to enforce plan-based access control.

## Overview

The system uses a two-tier approach:
1. **Frontend Gating**: Hide/disable features in the UI based on plan
2. **Backend Gating**: Enforce feature access at the API level

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
      <FeatureGate featureId="advanced_analytics">
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

// Protect a route that requires advanced analytics
router.get('/api/analytics/advanced', 
  authenticateToken,
  setupBusinessDatabase,
  requireFeature('advanced_analytics'),
  async (req, res) => {
    // This code only runs if business has access to advanced_analytics
    const analytics = await getAdvancedAnalytics(req.business);
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
- `incentive_management` - Incentive Management

### Growth Features (Available in Professional+)
- `advanced_inventory` - Advanced Inventory Management
- `advanced_reports` - Advanced Reports
- `analytics` - Analytics
- `staff_commissions` - Staff Commission Tracking
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
const { requireFeature } = require('../middleware/feature-gate');

router.get('/advanced',
  authenticateToken,
  setupBusinessDatabase,
  requireFeature('advanced_analytics'),
  async (req, res) => {
    // Only accessible to Professional+ plans
    const data = await getAdvancedAnalytics(req.business);
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

