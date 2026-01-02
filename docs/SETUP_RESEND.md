# Setting Up Resend Email Service

This guide will help you set up Resend as your email service provider.

## Step 1: Create Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Click **"Sign Up"** or **"Get Started"**
3. Create an account using:
   - Email address
   - Password
   - Or sign up with GitHub/Google

## Step 2: Verify Your Email

1. Check your email inbox for verification email
2. Click the verification link
3. Complete the account setup

## Step 3: Get Your API Key

1. After logging in, go to **API Keys** section (usually in Settings or Dashboard)
2. Click **"Create API Key"**
3. Give it a name (e.g., "Ease My Salon Production")
4. Select permissions (usually "Full Access" for sending emails)
5. Click **"Add"** or **"Create"**
6. **Copy the API key immediately** - it starts with `re_` and looks like: `re_xxxxxxxxxxxxx`
   - ⚠️ **Important:** You can only see this key once! Save it securely.

## Step 4: Add and Verify Domain (Recommended for Production)

For production use, you should verify your domain:

1. Go to **Domains** section in Resend dashboard
2. Click **"Add Domain"**
3. Enter your domain (e.g., `easemysalon.in`)
4. Resend will provide DNS records to add:
   - **SPF Record** (for email authentication)
   - **DKIM Record** (for email signing)
   - **DMARC Record** (optional, for email security)
5. Add these DNS records to your domain's DNS settings
6. Wait for verification (usually takes a few minutes to 24 hours)
7. Once verified, you can use emails like `noreply@yourdomain.com`

### For Testing (Quick Start)

If you just want to test quickly:
- Resend provides a test domain you can use
- Look for "Test Domain" in your Resend dashboard
- You can send from `onboarding@resend.dev` for testing
- Note: Test domain has sending limits

## Step 5: Configure in Admin Panel

### Option A: Via Admin Panel UI (Recommended)

1. **Start your backend and frontend servers**

2. **Navigate to Admin Panel:**
   - Go to: **Settings → Notifications & Alerts**
   - Or directly: `http://localhost:3000/admin/settings` (select "Notifications & Alerts")

3. **Enable Email Notifications:**
   - Toggle **"Enable Email Notifications"** to ON

4. **Select Resend Provider:**
   - In **"Email Provider"** dropdown, select **"Resend"**

5. **Enter API Key:**
   - In **"Resend API Key"** field, paste your API key (starts with `re_`)

6. **Configure Email Settings:**
   - **From Email:** 
     - For testing: `onboarding@resend.dev` (Resend test domain)
     - For production: `noreply@yourdomain.com` (your verified domain)
   - **From Name:** `Ease My Salon` (or your business name)
   - **Reply To:** `support@yourdomain.com` (or your support email)

7. **Save Settings:**
   - Click **"Save"** button (top right of admin settings page)
   - You should see a success message

8. **Test Email:**
   - Enter a valid email address in **"Test Email"** field
   - Click **"Test Email"** button
   - Check your inbox (and spam folder) for the test email
   - You should see a success toast notification

### Option B: Via Environment Variables (Alternative)

If you prefer to use environment variables:

1. **Add to `.env` file in backend directory:**
```env
EMAIL_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@easemysalon.in
EMAIL_FROM_NAME=Ease My Salon
EMAIL_REPLY_TO=support@easemysalon.in
```

2. **Restart backend server**

3. **Email service will automatically use these values**

## Step 6: Verify It's Working

### Check Backend Logs

When backend starts, you should see:
```
✅ Email service initialized with provider: resend
```

Or if using env variables:
```
✅ Email service initialized from environment variables
```

### Test Email Sending

1. In admin panel, use the **"Test Email"** button
2. Enter your email address
3. Click **"Test Email"**
4. Check your inbox for the test email

### Check Resend Dashboard

1. Go to Resend dashboard
2. Check **"Logs"** or **"Activity"** section
3. You should see email sending activity
4. Check delivery status (delivered, bounced, etc.)

## Step 7: Production Configuration

For production use:

1. **Verify Your Domain:**
   - Add your domain in Resend
   - Add DNS records
   - Wait for verification

2. **Update From Email:**
   - Change "From Email" to use your verified domain
   - Example: `noreply@easemysalon.in`

3. **Set Up Email Templates:**
   - Go to **Notification Templates** section in admin panel
   - Customize email templates for your business

4. **Monitor Usage:**
   - Check Resend dashboard for:
     - Email delivery rates
     - Bounce rates
     - Spam complaints
     - API usage/quota

## Troubleshooting

### Issue: "Resend API key not found"

**Solution:**
- Make sure you copied the full API key (starts with `re_`)
- Check for extra spaces when pasting
- Verify the key is saved in admin settings

### Issue: "Email not received"

**Possible causes:**
1. **Check spam folder** - Test emails often go to spam initially
2. **Invalid email address** - Verify the test email is correct
3. **Domain not verified** - If using custom domain, make sure it's verified
4. **Rate limiting** - Free tier has limits, wait a few minutes
5. **Check Resend dashboard** - Look at logs to see delivery status

### Issue: "Unauthorized" or "Invalid API Key"

**Solution:**
- Verify API key is correct
- Check if API key was revoked in Resend dashboard
- Generate a new API key if needed

### Issue: "Domain not verified"

**Solution:**
- If using custom domain, verify it in Resend dashboard
- Check DNS records are correct
- Wait for DNS propagation (can take up to 24 hours)
- Use test domain (`onboarding@resend.dev`) for testing

### Issue: Settings not saving

**Solution:**
- Make sure you clicked "Save" button
- Check backend logs for errors
- Verify database connection is working
- Check browser console for API errors

## Resend Pricing & Limits

### Free Tier:
- 3,000 emails/month
- 100 emails/day
- Test domain available
- Basic analytics

### Paid Plans:
- Start at $20/month
- Higher sending limits
- Custom domain support
- Advanced analytics
- Priority support

## Best Practices

1. **Use Environment Variables for Production:**
   - Don't hardcode API keys
   - Use `.env` file (and add to `.gitignore`)
   - Use different keys for development/production

2. **Verify Your Domain:**
   - Required for production
   - Improves email deliverability
   - Prevents emails going to spam

3. **Monitor Email Delivery:**
   - Check Resend dashboard regularly
   - Monitor bounce rates
   - Handle spam complaints

4. **Test Before Production:**
   - Always test with test domain first
   - Verify emails are received
   - Check spam folder behavior

5. **Set Up Email Templates:**
   - Customize templates in admin panel
   - Use your branding
   - Include unsubscribe links (if required)

## Quick Reference

### Resend Dashboard
- URL: https://resend.com
- API Keys: Dashboard → API Keys
- Domains: Dashboard → Domains
- Logs: Dashboard → Logs/Activity

### Configuration Locations
- **Admin Panel:** Settings → Notifications & Alerts → Email Configuration
- **Environment Variables:** `backend/.env`
- **Backend Code:** `backend/services/email-service.js`

### Test Email Format
```
From: Ease My Salon <noreply@easemysalon.in>
To: test@example.com
Subject: Test Email from Ease My Salon
Body: This is a test email to verify email service configuration.
```

## Next Steps

After setting up Resend:

1. ✅ Test email sending works
2. ✅ Verify domain (for production)
3. ✅ Configure email templates
4. ✅ Set up alert rules
5. ✅ Test business notifications (receipts, appointments, etc.)
6. ✅ Monitor email delivery in Resend dashboard

## Support

- **Resend Documentation:** https://resend.com/docs
- **Resend Support:** support@resend.com
- **Resend Status:** https://status.resend.com


