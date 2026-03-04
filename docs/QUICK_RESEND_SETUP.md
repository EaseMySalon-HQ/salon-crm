# Quick Resend Setup Guide

Follow these steps to quickly set up Resend for email service.

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Resend API Key

1. Go to [https://resend.com](https://resend.com) and sign up
2. Verify your email
3. Go to **API Keys** section
4. Click **"Create API Key"**
5. Copy the key (starts with `re_`) - **Save it! You can only see it once**

### Step 2: Configure in Admin Panel

1. **Start your servers:**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm start

   # Terminal 2: Frontend  
   npm run dev
   ```

2. **Open Admin Panel:**
   - Go to: `http://localhost:3000/admin/settings`
   - Click on **"Notifications & Alerts"** tab

3. **Configure Email:**
   - Toggle **"Enable Email Notifications"** to **ON**
   - Select **"Resend"** from **"Email Provider"** dropdown
   - Paste your **Resend API Key** in the field
   - Set **From Email**: `onboarding@resend.dev` (for testing)
   - Set **From Name**: `EaseMySalon`
   - Set **Reply To**: Your support email

4. **Save:**
   - Click **"Save"** button (top right)

5. **Test:**
   - Enter your email in **"Test Email"** field
   - Click **"Test Email"** button
   - Check your inbox! 📧

## ✅ Verify It Works

### Check Backend Logs
You should see:
```
✅ Email service initialized with provider: resend
```

### Check Your Email
- Look in inbox (and spam folder)
- You should receive: "Test Email from EaseMySalon"

### Check Resend Dashboard
- Go to [resend.com](https://resend.com) → Logs
- You should see the email activity

## 🎯 For Production

1. **Verify Your Domain:**
   - In Resend dashboard → Domains → Add Domain
   - Add DNS records to your domain
   - Wait for verification

2. **Update From Email:**
   - Change to: `noreply@yourdomain.com`
   - Save settings

3. **Done!** Your emails will now send from your verified domain

## 🔧 Alternative: Environment Variables

If you prefer using `.env` file:

1. **Create/Edit `backend/.env`:**
   ```env
   EMAIL_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=noreply@easemysalon.in
   EMAIL_FROM_NAME=EaseMySalon
   EMAIL_REPLY_TO=support@easemysalon.in
   ```

2. **Restart backend server**

3. **Email service will use these values automatically**

## ❌ Troubleshooting

### "Email not received"
- ✅ Check spam folder
- ✅ Verify email address is correct
- ✅ Check Resend dashboard logs
- ✅ Wait a few minutes (rate limiting)

### "Invalid API Key"
- ✅ Make sure key starts with `re_`
- ✅ Check for extra spaces
- ✅ Verify key in Resend dashboard

### "Settings not saving"
- ✅ Click "Save" button
- ✅ Check backend logs for errors
- ✅ Refresh page and check again

## 📚 More Details

See full guide: `docs/SETUP_RESEND.md`

## 🎉 You're Done!

Your email service is now configured. You can:
- Send test emails from admin panel
- Receive business notifications
- Configure email templates
- Set up alert rules



