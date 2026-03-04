# Session Timeout Feature

## Overview

The EaseMySalon now includes an automatic session timeout feature that logs out users after a period of inactivity to enhance security and prevent unauthorized access.

## Features

### ⏰ **Automatic Logout**
- Users are automatically logged out after **3 hours** of inactivity
- Activity is tracked through mouse movements, clicks, keyboard input, scrolling, and touch events

### ⚠️ **Warning System**
- Users receive a warning notification **5 minutes** before automatic logout
- Warning appears as a toast notification with clear instructions
- Users can click anywhere to extend their session

### 📊 **Session Status Indicator**
- Visual indicator in the top navigation shows remaining session time
- Only appears when less than 10 minutes remain
- Color-coded: Green (safe), Yellow (warning), Red (critical)

### 🔧 **Configurable Settings**
- All timeout settings can be easily adjusted in `lib/session-config.ts`
- Easy to modify timeout duration, warning time, and display preferences

## Configuration

Edit `lib/session-config.ts` to customize:

```typescript
export const SESSION_CONFIG = {
  TIMEOUT_MINUTES: 180,        // 3 hours default
  WARNING_MINUTES: 5,          // 5 minutes warning
  SHOW_STATUS_WHEN_MINUTES_LEFT: 10, // Show status indicator
  // ... other settings
}
```

## How It Works

1. **Activity Tracking**: Monitors user interactions (mouse, keyboard, touch, scroll)
2. **Timer Management**: Resets timeout on any user activity
3. **Warning Phase**: Shows notification 5 minutes before logout
4. **Automatic Logout**: Logs out user and redirects to login page
5. **Visual Feedback**: Session status indicator in navigation bar

## Security Benefits

- **Prevents Unauthorized Access**: Automatic logout when users leave their workstation
- **Compliance**: Meets security requirements for session management
- **User Awareness**: Clear warnings and status indicators
- **Configurable**: Easy to adjust for different security requirements

## User Experience

- **Non-Intrusive**: Only shows warnings when necessary
- **Clear Communication**: Toast notifications explain what's happening
- **Easy Extension**: Simply click anywhere to continue session
- **Visual Feedback**: Status indicator shows remaining time

## Technical Implementation

- **Hook-based**: Uses `useSessionTimeout` hook for easy integration
- **Context Integration**: Works seamlessly with existing auth system
- **Performance Optimized**: Efficient event listeners and cleanup
- **TypeScript**: Fully typed for better development experience

## Files Modified

- `hooks/use-session-timeout.tsx` - Main session timeout logic
- `components/auth/session-status.tsx` - Visual status indicator
- `lib/auth-context.tsx` - Integration with authentication
- `components/top-nav.tsx` - Status display in navigation
- `lib/session-config.ts` - Configuration settings

## Testing

To test the session timeout:

1. Login to the application
2. Wait for the session status indicator to appear (when < 10 minutes left)
3. Observe the warning notification (5 minutes before logout)
4. Click anywhere to extend the session
5. Or wait for automatic logout

## Customization

You can easily customize the timeout behavior by:

1. **Changing timeout duration**: Modify `TIMEOUT_MINUTES` in config
2. **Adjusting warning time**: Change `WARNING_MINUTES` in config
3. **Adding custom events**: Extend `ACTIVITY_EVENTS` array
4. **Customizing UI**: Modify the session status component
5. **Adding callbacks**: Use `onTimeout` and `onWarning` options

This feature enhances the security of your EaseMySalon while maintaining a great user experience!
