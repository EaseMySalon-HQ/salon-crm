# Email Notification System

## Overview

The email notification system allows business owners to receive automated email notifications for various business events including daily summaries, weekly summaries, receipts, appointments, and system alerts.

## Features

### 1. **Email Service Integration**
- Uses Resend as the email service provider
- Supports HTML and plain text email templates
- Handles email sending with error handling and retries

### 2. **Notification Types**

#### Business Owner Notifications:
- **Daily Summary**: End-of-day business summary with sales, appointments, and revenue
- **Weekly Summary**: Comprehensive weekly analytics with growth metrics
- **Appointment Notifications**: New appointments, cancellations, no-shows
- **Receipt Notifications**: Receipt confirmations and high-value transaction alerts
- **Export Notifications**: When reports or data exports are ready
- **System Alerts**: Low inventory, payment failures, system errors

#### Client Notifications (if email saved):
- **Receipt Emails**: PDF receipt attached to email
- **Appointment Confirmations**: When appointments are created
- **Appointment Reminders**: 24 hours before appointment
- **Appointment Cancellations**: When appointments are cancelled

### 3. **Admin-Only Management**
- Only admin/manager can manage email notification settings
- Staff members cannot manage their own preferences
- All preferences are managed centrally in Settings → Notifications

### 4. **Staff Directory Integration**
- Staff members are selected from Staff Directory (no manual email entry)
- Each staff member shows email notification status in Staff Directory
- Admin can configure individual staff preferences via modal

### 5. **Scheduled Jobs**
- Daily summary emails sent at configured time (default: 9 PM)
- Weekly summary emails sent on configured day (default: Sunday 8 PM)
- Uses node-cron for scheduling

## Setup

### 1. Environment Variables

Add to your `.env` file:

```env
# Email Service Configuration (Resend)
EMAIL_API_KEY=your-resend-api-key-here
EMAIL_FROM=noreply@easemysalon.in
EMAIL_FROM_NAME=Ease My Salon
```

### 2. Get Resend API Key

1. Sign up at [Resend.com](https://resend.com)
2. Create an API key
3. Add it to your environment variables

### 3. Verify Domain (Optional but Recommended)

For production, verify your domain in Resend dashboard to improve deliverability.

## Usage

### For Business Owners/Admins:

1. **Navigate to Settings → Notifications**
2. **Select Recipients**: Choose which staff members should receive notifications
3. **Configure Notification Types**:
   - Enable/disable daily summary
   - Set daily summary time
   - Enable/disable weekly summary
   - Set weekly summary day and time
   - Configure appointment notifications
   - Configure receipt notifications
   - Configure system alerts
4. **Configure Individual Staff Preferences**: Click "Configure" next to each staff member to set what they receive
5. **Test Email**: Use "Send Test Email" button to verify configuration
6. **Save Settings**: Click "Save Changes"

### Staff Directory:

- View email notification status for each staff member
- Status shows "ON" or "OFF" with badge
- Admin can click "Configure" to manage preferences (only visible to admin)

## API Endpoints

### Get Email Notification Settings
```
GET /api/email-notifications/settings
```

### Update Email Notification Settings
```
PUT /api/email-notifications/settings
Body: {
  enabled: boolean,
  recipientStaffIds: string[],
  dailySummary: { enabled, time, recipientStaffIds },
  weeklySummary: { enabled, day, time, recipientStaffIds },
  // ... other settings
}
```

### Get Staff Email Notification Preferences
```
GET /api/email-notifications/staff
```

### Update Staff Email Notification Preferences
```
PUT /api/email-notifications/staff/:id
Body: {
  enabled: boolean,
  preferences: {
    dailySummary: boolean,
    weeklySummary: boolean,
    // ... other preferences
  }
}
```

### Send Test Email
```
POST /api/email-notifications/test
Body: { email: string }
```

### Manually Trigger Daily Summary
```
POST /api/email-notifications/send-daily-summary
```

## Data Models

### Staff Model
```javascript
{
  emailNotifications: {
    enabled: Boolean,
    preferences: {
      dailySummary: Boolean,
      weeklySummary: Boolean,
      appointmentAlerts: Boolean,
      receiptAlerts: Boolean,
      exportAlerts: Boolean,
      systemAlerts: Boolean,
      lowInventory: Boolean
    },
    managedBy: 'admin',
    lastUpdatedBy: ObjectId,
    lastUpdatedAt: Date
  }
}
```

### Business Model
```javascript
{
  settings: {
    emailNotificationSettings: {
      enabled: Boolean,
      recipientStaffIds: [ObjectId],
      dailySummary: {
        enabled: Boolean,
        time: String, // "HH:mm"
        recipientStaffIds: [ObjectId]
      },
      weeklySummary: {
        enabled: Boolean,
        day: String, // "sunday" | "monday" | ...
        time: String, // "HH:mm"
        recipientStaffIds: [ObjectId]
      },
      // ... other notification types
    }
  }
}
```

## Email Templates

All email templates are located in `backend/utils/email-templates.js`:

- `dailySummary()` - Daily business summary
- `weeklySummary()` - Weekly business summary
- `receipt()` - Receipt email to client
- `appointmentConfirmation()` - Appointment confirmation
- `appointmentReminder()` - Appointment reminder
- `appointmentCancellation()` - Appointment cancellation
- `exportReady()` - Export ready notification
- `systemAlert()` - System alert
- `lowInventory()` - Low inventory alert

## Scheduled Jobs

Scheduled jobs are configured in `backend/jobs/email-scheduler.js`:

- **Daily Summary**: Runs every day at 9:00 PM IST
- **Weekly Summary**: Runs every Sunday at 8:00 PM IST

Jobs automatically:
1. Fetch all active businesses
2. Check if notifications are enabled
3. Aggregate data for the period
4. Send emails to selected staff members

## Security

- Only admin/manager can manage email notifications
- Staff members cannot modify their own preferences
- All email addresses come from registered staff (no manual entry)
- Email service API key stored in environment variables

## Troubleshooting

### Emails Not Sending

1. Check `EMAIL_API_KEY` is set in environment variables
2. Verify Resend API key is valid
3. Check server logs for email service errors
4. Use "Send Test Email" to verify configuration

### Staff Not Receiving Emails

1. Verify staff has email address in Staff Directory
2. Check staff has `emailNotifications.enabled: true`
3. Verify staff is selected as recipient in notification settings
4. Check staff has specific preference enabled (e.g., `dailySummary: true`)

### Scheduled Jobs Not Running

1. Verify server is running (jobs only run when server is active)
2. Check server logs for cron job execution
3. Verify timezone is set correctly (default: Asia/Kolkata)

## Future Enhancements

- Email template customization UI
- Email delivery logs and analytics
- Unsubscribe functionality
- Email queue for better reliability
- Support for multiple email providers
- SMS notifications integration

