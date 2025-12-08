# Next Steps: Email Service Setup Guide

Now that your Resend email service is working, here are the recommended next steps to fully configure and test your email system.

## Step 1: Verify Your Domain (For Production) ⭐

### Why This Matters
- Better email deliverability (less likely to go to spam)
- Professional sender address (e.g., `noreply@yourdomain.com`)
- Higher sending limits
- Better reputation

### How to Do It

1. **Go to Resend Dashboard**
   - Visit: https://resend.com
   - Log in to your account
   - Navigate to **"Domains"** section

2. **Add Your Domain**
   - Click **"Add Domain"**
   - Enter your domain (e.g., `easemysalon.in`)
   - Click **"Add"**

3. **Add DNS Records**
   Resend will provide you with DNS records to add:
   - **SPF Record** (for email authentication)
   - **DKIM Record** (for email signing)
   - **DMARC Record** (optional, for security)

4. **Update DNS Settings**
   - Go to your domain registrar (where you bought the domain)
   - Access DNS management
   - Add the records provided by Resend
   - Save changes

5. **Wait for Verification**
   - DNS propagation can take 5 minutes to 24 hours
   - Resend will show verification status
   - Once verified, you'll see a green checkmark

6. **Update Admin Panel Settings**
   - Go back to Admin Panel → Settings → Notifications & Alerts
   - Change **"From Email"** from `onboarding@resend.dev` to `noreply@yourdomain.com`
   - Click **"Save Changes"**

**✅ Confirm when your domain is verified**

---

## Step 2: Test Business Email Notifications

Let's verify that business-side emails are working correctly.

### Test 1: Receipt Email

1. **Create a Test Receipt**
   - Go to your business dashboard
   - Create a new receipt for a client
   - Make sure the client has an email address saved

2. **Check Email Delivery**
   - Check the client's email inbox
   - Verify receipt PDF is attached
   - Check backend logs for email sending confirmation

**✅ Confirm if receipt email was received**

### Test 2: Appointment Confirmation

1. **Create a Test Appointment**
   - Go to Appointments section
   - Create a new appointment
   - Make sure the client has an email address

2. **Check Email Delivery**
   - Check the client's email inbox
   - Verify appointment details are correct
   - Check backend logs

**✅ Confirm if appointment email was received**

### Test 3: Daily/Weekly Summary

1. **Check Email Scheduler**
   - Backend logs should show: "Email scheduler jobs configured"
   - Daily summary: Every day at 9:00 PM IST
   - Weekly summary: Every Sunday at 8:00 PM IST

2. **Wait for Scheduled Time** (or manually trigger)
   - Check if summary emails are sent
   - Verify recipients receive emails

**✅ Confirm if summary emails are working**

---

## Step 3: Configure Email Templates

Customize the email templates for your business branding.

### Where to Configure

1. **Go to Admin Panel**
   - Navigate to: Settings → Notifications & Alerts
   - Scroll down to **"Notification Templates"** section

2. **Available Templates**
   - **Business Created**: Welcome email for new businesses
   - **Business Inactive**: Alert for inactive businesses
   - **System Alert**: System notifications
   - **User Created**: Welcome email for new users

### Customization Tips

- Use variables like `{businessCode}`, `{days}`, `{alertType}`, `{message}`
- Add your business branding
- Include contact information
- Make it professional and clear

**✅ Confirm when templates are customized**

---

## Step 4: Configure Alert Rules

Set up automated alerts for important events.

### Available Alert Types

1. **System Health Alerts**
   - CPU threshold monitoring
   - Memory threshold monitoring
   - Disk space monitoring
   - Recipients: Admin emails

2. **Business Inactive Alerts**
   - Days threshold (e.g., 7 days)
   - Recipients: Admin emails

3. **Error Alerts**
   - Error level (error, warn, info)
   - Recipients: Admin/Dev emails

4. **Security Alerts**
   - Failed login threshold
   - Recipients: Security team emails

### How to Configure

1. **Go to Admin Panel**
   - Settings → Notifications & Alerts
   - Scroll to **"Alert Rules"** section

2. **Enable Alerts**
   - Toggle alerts you want enabled
   - Set thresholds
   - Add recipient email addresses

3. **Save Settings**
   - Click "Save Changes"

**✅ Confirm when alert rules are configured**

---

## Step 5: Monitor Email Delivery

### Check Resend Dashboard

1. **Go to Resend Dashboard**
   - Visit: https://resend.com
   - Navigate to **"Logs"** or **"Activity"** section

2. **Monitor**
   - Email delivery status
   - Bounce rates
   - Spam complaints
   - API usage/quota

### Check Backend Logs

Look for these messages:
- `✅ Email sent successfully`
- `❌ Error sending email: [error]`
- `⚠️  Email service not configured`

### Best Practices

- Monitor bounce rates (should be < 5%)
- Handle spam complaints promptly
- Check API quota usage
- Review failed deliveries

**✅ Confirm when monitoring is set up**

---

## Step 6: Test All Email Types

Create a comprehensive test checklist:

### Email Types to Test

- [ ] **Receipt Emails** - Client receives receipt with PDF
- [ ] **Appointment Confirmations** - Client receives appointment details
- [ ] **Appointment Reminders** - Client receives reminder before appointment
- [ ] **Appointment Cancellations** - Client notified of cancellation
- [ ] **Daily Summary** - Staff receives daily business summary
- [ ] **Weekly Summary** - Staff receives weekly business summary
- [ ] **System Alerts** - Admin receives system notifications
- [ ] **Low Inventory Alerts** - Staff notified of low stock
- [ ] **Export Ready** - User notified when export is ready

**✅ Confirm when all email types are tested**

---

## Step 7: Production Checklist

Before going live, verify:

### Configuration
- [ ] Domain verified in Resend
- [ ] From Email uses verified domain
- [ ] All email templates customized
- [ ] Alert rules configured
- [ ] Recipient emails are correct

### Testing
- [ ] Test emails work
- [ ] Business notifications work
- [ ] Scheduled emails work
- [ ] Error handling works

### Monitoring
- [ ] Resend dashboard access
- [ ] Backend logs monitoring
- [ ] Email delivery tracking
- [ ] Error alerting set up

**✅ Confirm when production ready**

---

## Troubleshooting Common Issues

### Emails Going to Spam

**Solutions:**
- Verify your domain in Resend
- Add SPF, DKIM, DMARC records
- Use professional "From" name
- Avoid spam trigger words
- Warm up your domain gradually

### Emails Not Sending

**Check:**
- API key is correct
- Email service is enabled
- Recipient email is valid
- Check backend logs for errors
- Verify Resend account is active

### High Bounce Rate

**Solutions:**
- Verify email addresses before sending
- Remove invalid emails from database
- Use double opt-in for subscriptions
- Monitor bounce reports

---

## Support Resources

- **Resend Documentation**: https://resend.com/docs
- **Resend Support**: support@resend.com
- **Resend Status**: https://status.resend.com
- **Resend Dashboard**: https://resend.com

---

## Quick Reference

### Admin Panel Path
`Admin Panel → Settings → Notifications & Alerts`

### Key Settings
- Email Provider: Resend
- From Email: `noreply@yourdomain.com` (after verification)
- From Name: Your Business Name
- Reply To: Support Email

### Backend Logs Location
Check terminal where backend is running, or log files

### Test Email Endpoint
`POST /api/admin/settings/test/email`

---

## Next Actions

1. **Start with Step 1** - Verify your domain
2. **Then Step 2** - Test business notifications
3. **Then Step 3** - Customize templates
4. **Then Step 4** - Configure alerts
5. **Finally** - Monitor and optimize

Let me know which step you'd like to start with!

