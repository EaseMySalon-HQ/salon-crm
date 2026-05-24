'use strict';

/**
 * Platform-level kill switch: when true, no tenant-operational email is sent
 * (summaries, appointment/receipt/export alerts, marketing-style comms).
 * Auth/password and super-admin emails are unaffected.
 */
function isPlatformEmailDisabled(business) {
  return business?.settings?.platformEmailDisabled === true;
}

function throwIfPlatformEmailDisabled(business) {
  if (isPlatformEmailDisabled(business)) {
    const err = new Error(
      'Email notifications are disabled for this business by the platform administrator.'
    );
    err.code = 'PLATFORM_EMAIL_DISABLED';
    throw err;
  }
}

module.exports = {
  isPlatformEmailDisabled,
  throwIfPlatformEmailDisabled,
};
