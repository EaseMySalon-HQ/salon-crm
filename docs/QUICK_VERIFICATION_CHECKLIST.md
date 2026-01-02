# Quick Verification Checklist

Use this checklist to quickly verify that the email configuration is working properly.

## ✅ Pre-Flight Checks

### 1. Backend Dependencies
Check if required packages are installed:
```bash
cd backend
npm list resend nodemailer @sendgrid/mail aws-sdk mailgun.js form-data
```

If any are missing, install them:
```bash
npm install resend nodemailer @sendgrid/mail aws-sdk mailgun.js form-data
```

### 2. Backend Server Status
- [ ] Backend server is running on port 3001
- [ ] No errors in backend console
- [ ] Database connection is established
- [ ] Look for: `✅ Email service initialized` in logs

### 3. Frontend Status
- [ ] Frontend is running on port 3000
- [ ] No build errors
- [ ] Can access admin panel
- [ ] Can navigate to Settings → Notifications & Alerts

## 🧪 Quick Tests

### Test 1: UI Loads Correctly
1. Navigate to: **Admin Panel → Settings → Notifications & Alerts**
2. Verify:
   - [ ] "Email Configuration" card is visible
   - [ ] "Enable Email Notifications" toggle exists
   - [ ] Provider dropdown shows all 5 options (Resend, SMTP, SendGrid, SES, Mailgun)
   - [ ] Test Email input field is visible
   - [ ] Test Email button is visible

### Test 2: Settings Persistence
1. Enable "Email Notifications"
2. Select a provider (e.g., Resend)
3. Enter some test values (you don't need real credentials for this test)
4. Click **Save** button (top right of admin settings page)
5. Refresh the page
6. Verify:
   - [ ] Settings are still there after refresh
   - [ ] Toggle is still ON
   - [ ] Provider selection is preserved

### Test 3: Provider-Specific Fields
1. Select **Resend** provider
   - [ ] "Resend API Key" field appears
2. Select **SMTP** provider
   - [ ] SMTP Host, Port, Username, Password fields appear
   - [ ] SMTP Secure toggle appears
3. Select **SendGrid** provider
   - [ ] "SendGrid API Key" field appears
4. Select **AWS SES** provider
   - [ ] Access Key ID, Secret Key, Region fields appear
5. Select **Mailgun** provider
   - [ ] API Key and Domain fields appear

### Test 4: Test Email Functionality (with valid credentials)
1. Configure a provider with **valid credentials**
2. Enter a **valid test email address**
3. Click **"Test Email"** button
4. Verify:
   - [ ] Button shows "Sending..." while processing
   - [ ] Success toast appears: "Test email sent to [email]"
   - [ ] Email is received in inbox (check spam folder too)
   - [ ] Backend logs show: "Email sent successfully"

### Test 5: Error Handling
1. Enter an **invalid email** (e.g., "test")
2. Click "Test Email"
3. Verify:
   - [ ] Error toast: "Please enter a valid email address"

1. Configure provider with **invalid credentials**
2. Click "Test Email"
3. Verify:
   - [ ] Error toast with specific error message
   - [ ] Backend logs show the error

### Test 6: Server Restart Persistence
1. Configure email settings with valid values
2. Save settings
3. **Restart backend server**
4. Check backend logs:
   - [ ] Should see: `✅ Email service initialized with provider: [provider]`
5. Navigate back to admin settings
6. Verify:
   - [ ] Settings are still configured
   - [ ] Can send test email successfully

## 🔍 Backend Log Verification

When backend starts, you should see one of these:

### ✅ Success Messages:
```
✅ Email service initialized with provider: resend
✅ SMTP connection verified
```

### ⚠️ Warning Messages (OK if no config yet):
```
⚠️  Could not load email config from admin settings, falling back to environment variables
⚠️  Email service not configured. No API key found.
```

### ❌ Error Messages (needs fixing):
```
❌ Error setting up email provider: [error]
```

## 🚨 Common Issues Quick Fix

### Issue: "Module parse failed: Identifier 'Input' has already been declared"
**Fix:** Already fixed - removed duplicate import

### Issue: Settings not saving
**Check:**
- Backend route has `setupMainDatabase` middleware
- Database connection is working
- Check backend logs for errors

### Issue: Test email not working
**Check:**
- Provider credentials are correct
- Email address is valid
- Check backend logs for specific error
- Verify email provider account is active

### Issue: Settings lost on refresh
**Check:**
- Make sure you clicked "Save" button
- Check browser console for API errors
- Verify backend is saving to database

## 📊 API Endpoint Quick Test

Test the API directly:

```bash
# Get current settings
curl -X GET http://localhost:3001/api/admin/settings/notifications \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test email (replace with your token and email)
curl -X POST http://localhost:3001/api/admin/settings/test/email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## ✅ Final Verification

Once all tests pass:
- [ ] UI loads without errors
- [ ] Settings persist after save
- [ ] Settings persist after server restart
- [ ] Test email sends successfully
- [ ] Provider switching works
- [ ] Error handling works correctly
- [ ] Backend logs show proper initialization

## 🎯 Next Steps

After verification:
1. Configure production email provider
2. Test with real business email notifications
3. Set up email templates
4. Configure alert rules


