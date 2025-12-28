# WhatsApp Receipt Link - Production Configuration Guide

## 📋 Overview

This guide explains how WhatsApp receipt links work in production and how to configure them correctly.

## 🔧 How It Works

### Current Implementation

The system generates receipt links in two ways:

1. **Full URL** (default): `https://www.easemysalon.in/receipt/public/INV-000052/abc123`
2. **Path Only** (when template includes base URL): `INV-000052/abc123`

### The Problem

Your WhatsApp template already includes the base URL `https://www.easemysalon.in/receipt/public/` in the approved template. When we pass a full URL, it gets duplicated:

```
Template: https://www.easemysalon.in/receipt/public/{{variables}}
Passed: https://www.easemysalon.in/receipt/public/INV-000052/abc123
Result: https://www.easemysalon.in/receipt/public/https://www.easemysalon.in/receipt/public/INV-000052/abc123 ❌
```

### The Solution

The system now automatically detects if your template includes the base URL and extracts just the path variables:

```
Template: https://www.easemysalon.in/receipt/public/{{variables}}
Passed: INV-000052/abc123
Result: https://www.easemysalon.in/receipt/public/INV-000052/abc123 ✅
```

## ⚙️ Configuration

### 1. Environment Variables

In your production environment (Railway, Heroku, etc.), set:

```bash
# Production Frontend URL
FRONTEND_URL=https://www.easemysalon.in
```

**Important**: This is still used for generating the full URL in the backend, but the WhatsApp service will extract just the path if needed.

### 2. Admin Settings Configuration

In **Admin Settings → Notifications → WhatsApp**, there's a new option:

- **Template Includes Base URL**: `true` (default)
  - If `true`: The system will extract just the path (`INV-000052/abc123`) from full URLs
  - If `false`: The system will pass the full URL as-is

**For your setup**: Keep this as `true` since your template already has the base URL.

## 🚀 Production Setup Checklist

### Step 1: Set Environment Variables

```bash
# Backend Environment Variables
FRONTEND_URL=https://www.easemysalon.in
NODE_ENV=production
MSG91_API_KEY=your-msg91-api-key
```

### Step 2: Configure Admin Settings

1. Go to **Admin Settings → Notifications → WhatsApp**
2. Enter your MSG91 API credentials
3. Configure your templates
4. **Ensure "Template Includes Base URL" is set to `true`** (default)
5. Test the connection

### Step 3: Verify Receipt Links

After creating a sale/receipt:

1. Check backend logs for: `📱 [WhatsApp] Template includes base URL, extracted path: INV-000052/abc123`
2. The WhatsApp message should have a working link
3. Click the link to verify it opens correctly

## 🔍 How the Code Works

### Automatic Path Extraction

The `extractReceiptPath()` function in `whatsapp-service.js`:

```javascript
// Input: "https://www.easemysalon.in/receipt/public/INV-000052/abc123"
// Output: "INV-000052/abc123"
```

It:
1. Checks if the link is a full URL (starts with `http://` or `https://`)
2. Extracts the path after `/receipt/public/`
3. Returns just the path variables

### Configuration Check

The `sendReceipt()` method checks:

```javascript
const templateIncludesBaseUrl = this.config?.templateIncludesBaseUrl !== false;
```

- Defaults to `true` (safe for production)
- Can be toggled in Admin Settings if needed

## 📝 Example Flow

### Development (localhost)

```
1. Sale created with billNo: "INV-000052", shareToken: "abc123"
2. Backend generates: "http://localhost:3000/receipt/public/INV-000052/abc123"
3. WhatsApp service extracts: "INV-000052/abc123"
4. Template receives: "INV-000052/abc123"
5. Final link in WhatsApp: "https://www.easemysalon.in/receipt/public/INV-000052/abc123" ✅
```

### Production

```
1. Sale created with billNo: "INV-000052", shareToken: "abc123"
2. Backend generates: "https://www.easemysalon.in/receipt/public/INV-000052/abc123"
3. WhatsApp service extracts: "INV-000052/abc123"
4. Template receives: "INV-000052/abc123"
5. Final link in WhatsApp: "https://www.easemysalon.in/receipt/public/INV-000052/abc123" ✅
```

## 🐛 Troubleshooting

### Issue: Links are still duplicated

**Solution**: 
1. Check Admin Settings → WhatsApp → "Template Includes Base URL" is `true`
2. Restart backend server
3. Clear browser cache and test again

### Issue: Links are broken (404)

**Solution**:
1. Verify `FRONTEND_URL` is set correctly in production
2. Check that the receipt route exists: `/receipt/public/:billNo/:shareToken`
3. Verify the shareToken is being generated correctly

### Issue: Links work in development but not production

**Solution**:
1. Check environment variables are set in production
2. Verify the production frontend URL is correct
3. Check CORS settings allow the frontend domain

## 📊 Testing

### Test Receipt Link Generation

1. Create a test sale/receipt
2. Check backend console logs:
   ```
   📱 [WhatsApp] Receipt link generated: https://www.easemysalon.in/receipt/public/INV-000052/abc123
   📱 [WhatsApp] Template includes base URL, extracted path: INV-000052/abc123
   ```
3. Verify the WhatsApp message has the correct link
4. Click the link to ensure it opens correctly

## ✅ Summary

- **Production URL**: Set `FRONTEND_URL=https://www.easemysalon.in`
- **Template Config**: Keep "Template Includes Base URL" as `true` (default)
- **Automatic**: The system automatically extracts path variables when needed
- **Works Everywhere**: Same code works in development and production

The system is now production-ready and will handle receipt links correctly! 🎉

