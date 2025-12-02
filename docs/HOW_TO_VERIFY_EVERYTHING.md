# How to Verify Everything is Working

This guide provides step-by-step instructions to verify that the email configuration system is working correctly.

## Quick Start

### Option 1: Run Verification Script (Recommended)
```bash
cd backend
node scripts/verify-email-config.js
```

This script will check:
- ✅ Database connection
- ✅ AdminSettings model
- ✅ Email configuration in database
- ✅ Email service initialization
- ✅ Required packages installation

### Option 2: Manual Verification

Follow the steps below to manually verify each component.

## Step-by-Step Verification

### 1. Check Backend Dependencies

```bash
cd backend
npm list resend nodemailer @sendgrid/mail aws-sdk mailgun.js form-data
```

**Expected:** All packages should be listed. If any are missing, install them:
```bash
npm install resend nodemailer @sendgrid/mail aws-sdk mailgun.js form-data
```

### 2. Start Backend Server

```bash
cd backend
npm start
# or for development
npm run dev
```

**Check backend logs for:**
- ✅ `✅ Email service initialized with provider: [provider]` (if configured)
- ⚠️ `⚠️  Email service not configured` (if not configured yet - this is OK)

### 3. Start Frontend

```bash
npm run dev
```

**Check for:**
- ✅ No build errors
- ✅ Frontend loads successfully
- ✅ Can access admin panel

### 4. Access Email Configuration UI

1. Navigate to: **Admin Panel → Settings → Notifications & Alerts**
2. You should see the "Email Configuration" card

**Verify UI elements:**
- [ ] "Enable Email Notifications" toggle
- [ ] "Email Provider" dropdown with 5 options
- [ ] Provider-specific configuration fields
- [ ] "Test Email" input field
- [ ] "Test Email" button

### 5. Test Settings Persistence

1. **Enable** "Email Notifications" toggle
2. **Select** a provider (e.g., "Resend")
3. **Enter** test values (can be fake for this test)
4. **Click "Save"** button (top right of admin settings page)
5. **Refresh** the page (F5)
6. **Verify** settings are still there

### 6. Test Provider-Specific Fields

Test each provider to ensure fields appear correctly:

**Resend:**
- Select "Resend" → Should show "Resend API Key" field

**SMTP:**
- Select "SMTP" → Should show:
  - SMTP Host
  - SMTP Port
  - SMTP Username
  - SMTP Password
  - SMTP Secure toggle

**SendGrid:**
- Select "SendGrid" → Should show "SendGrid API Key" field

**AWS SES:**
- Select "AWS SES" → Should show:
  - AWS SES Access Key ID
  - AWS SES Secret Access Key
  - AWS SES Region

**Mailgun:**
- Select "Mailgun" → Should show:
  - Mailgun API Key
  - Mailgun Domain

### 7. Test Email Functionality

**Prerequisites:** You need valid credentials for at least one provider.

1. **Configure** a provider with valid credentials:
   - For Resend: Get API key from https://resend.com
   - For SMTP: Use Gmail app password or other SMTP credentials
   - For others: Get credentials from respective providers

2. **Enter** a valid test email address

3. **Click** "Test Email" button

4. **Check:**
   - ✅ Button shows "Sending..." while processing
   - ✅ Success toast: "Test email sent to [email]"
   - ✅ Email received in inbox (check spam folder)
   - ✅ Backend logs show: "Email sent successfully"

### 8. Test Error Handling

**Test Invalid Email:**
1. Enter invalid email (e.g., "test")
2. Click "Test Email"
3. Should show error: "Please enter a valid email address"

**Test Invalid Credentials:**
1. Enter invalid API key/password
2. Click "Test Email"
3. Should show specific error message

### 9. Test Server Restart Persistence

1. **Configure** email settings with valid values
2. **Save** settings
3. **Stop** backend server (Ctrl+C)
4. **Restart** backend server
5. **Check** backend logs for initialization message
6. **Verify** settings are still in admin panel
7. **Test** email sending still works

### 10. Test API Endpoints (Optional)

**Get Settings:**
```bash
curl -X GET http://localhost:3001/api/admin/settings/notifications \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Test Email:**
```bash
curl -X POST http://localhost:3001/api/admin/settings/test/email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## Verification Checklist

Use this checklist to ensure everything is working:

### Backend
- [ ] Backend server starts without errors
- [ ] Database connection established
- [ ] Email service initializes (check logs)
- [ ] All required packages installed
- [ ] AdminSettings model loads correctly

### Frontend
- [ ] Frontend builds without errors
- [ ] Can access admin panel
- [ ] Email Configuration UI loads
- [ ] All UI elements visible
- [ ] No console errors

### Functionality
- [ ] Can enable/disable email notifications
- [ ] Can select email provider
- [ ] Provider-specific fields appear
- [ ] Settings save successfully
- [ ] Settings persist after refresh
- [ ] Settings persist after server restart
- [ ] Test email sends successfully (with valid credentials)
- [ ] Error messages display correctly

### Integration
- [ ] Email service reads from admin settings
- [ ] Email service falls back to env variables if no settings
- [ ] Settings update triggers email service reload
- [ ] Multiple providers can be configured

## Common Issues & Quick Fixes

### "Module parse failed: Identifier 'Input' has already been declared"
**Status:** ✅ Fixed - duplicate import removed

### "Email service not configured"
**Solution:** Configure email in admin panel or set `EMAIL_API_KEY` env variable

### Settings not saving
**Check:**
- Backend route has `setupMainDatabase` middleware
- Database connection is working
- Check backend logs for errors

### Test email not received
**Check:**
- Provider credentials are correct
- Email address is valid
- Check spam folder
- Verify email provider account is active
- Check backend logs for specific error

### Settings lost on refresh
**Check:**
- Make sure you clicked "Save" button
- Check browser console for API errors
- Verify backend is saving to database

## Success Indicators

You'll know everything is working when:

1. ✅ Verification script runs without errors
2. ✅ Backend logs show email service initialized
3. ✅ Admin panel loads email configuration UI
4. ✅ Settings save and persist correctly
5. ✅ Test email sends successfully
6. ✅ Settings persist after server restart

## Next Steps

Once verified:
1. Configure production email provider
2. Test with real business notifications
3. Set up email templates
4. Configure alert rules
5. Monitor email delivery in production

## Need Help?

If something isn't working:
1. Check backend logs for errors
2. Check browser console for frontend errors
3. Run verification script: `node backend/scripts/verify-email-config.js`
4. Review the detailed testing guide: `docs/EMAIL_CONFIGURATION_TESTING.md`

