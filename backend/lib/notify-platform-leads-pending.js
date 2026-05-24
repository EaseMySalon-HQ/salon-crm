'use strict';

/**
 * Email platform admins when a new unassigned lead is added (website or admin panel).
 */

const emailService = require('../services/email-service');
const { logger } = require('../utils/logger');
const {
  applyPermissionOverrides,
  normalizePermissionOverrides,
} = require('../utils/permission-helpers');

const EMAIL_DELAY_MS = 600;

function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function adminDisplayName(admin) {
  return (
    admin.name ||
    `${admin.firstName || ''} ${admin.lastName || ''}`.trim() ||
    admin.email ||
    'Admin'
  );
}

function adminPanelLeadsUrl() {
  const base = (
    process.env.ADMIN_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}/admin/leads`;
}

function isLeadNotifyEnabled(settings) {
  if (process.env.PLATFORM_LEAD_NOTIFY_ENABLED === 'false') return false;
  const tpl = settings?.notifications?.templates?.platformLeadPending;
  if (tpl && tpl.enabled === false) return false;
  return true;
}

function adminCanReceiveLeadEmails(admin, roleById, roleByKey) {
  if (!admin?.email) return false;
  if (admin.role === 'super_admin') return true;

  let role = null;
  if (admin.roleId) role = roleById.get(String(admin.roleId));
  if (!role && admin.role) role = roleByKey.get(admin.role);

  const basePermissions = role?.permissions || admin.permissions || [];
  const effective = applyPermissionOverrides(
    basePermissions,
    normalizePermissionOverrides(admin.permissionOverrides || {})
  );

  return effective.some(
    (p) =>
      p.module === 'leads' &&
      Array.isArray(p.actions) &&
      (p.actions.includes('view') ||
        p.actions.includes('update') ||
        p.actions.includes('create'))
  );
}

async function loadRoleMaps(AdminRole) {
  const roles = await AdminRole.find({}).select('key permissions').lean();
  const roleById = new Map();
  const roleByKey = new Map();
  for (const role of roles) {
    roleById.set(String(role._id), role);
    if (role.key) roleByKey.set(role.key, role);
  }
  return { roleById, roleByKey };
}

async function getNotificationRecipients(mainModels) {
  const override = process.env.PLATFORM_LEAD_NOTIFY_EMAILS;
  if (override && String(override).trim()) {
    return String(override)
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .map((email) => ({ email, firstName: 'Admin', lastName: '' }));
  }

  const { Admin, AdminRole } = mainModels;
  const { roleById, roleByKey } = await loadRoleMaps(AdminRole);
  const admins = await Admin.find({
    isActive: true,
    email: { $exists: true, $ne: '' },
  })
    .select('email firstName lastName role roleId permissions permissionOverrides')
    .lean();

  const seen = new Set();
  const recipients = [];
  for (const admin of admins) {
    if (!adminCanReceiveLeadEmails(admin, roleById, roleByKey)) continue;
    const email = String(admin.email).trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push(admin);
  }
  return recipients;
}

async function countUnassignedPendingLeads(PlatformLead) {
  return PlatformLead.countDocuments({
    status: { $in: ['new', 'follow-up'] },
    $or: [{ assignedAdminId: null }, { assignedAdminId: { $exists: false } }],
  });
}

function buildLeadEmail({ lead, pendingCount, adminName }) {
  const leadsUrl = adminPanelLeadsUrl();
  const salon = lead.salonName || '—';
  const city = lead.city || '—';
  const source = lead.source || 'website';
  const phone = lead.phone || '—';
  const email = lead.email || '—';
  const preferred = lead.preferredDemoTime || '—';

  const subject =
    pendingCount > 1
      ? `New lead: ${lead.name} — ${pendingCount} leads awaiting assignment`
      : `New lead: ${lead.name} — assign in Lead Management`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#0f172a;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#7C3AED,#8B5CF6);padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:13px;opacity:0.9;text-transform:uppercase;letter-spacing:0.06em;">Lead Management</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">New lead needs assignment</h1>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 16px;">Hi ${escapeHtml(adminName)},</p>
      <p style="margin:0 0 20px;color:#475569;">
        A new platform lead was added and is <strong>not assigned</strong> yet.
        There are currently <strong>${pendingCount}</strong> lead(s) pending assignment.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#64748b;width:140px;">Contact</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(lead.name)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Salon</td><td style="padding:8px 0;">${escapeHtml(salon)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">City</td><td style="padding:8px 0;">${escapeHtml(city)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Phone</td><td style="padding:8px 0;">${escapeHtml(phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Source</td><td style="padding:8px 0;">${escapeHtml(source)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Preferred time</td><td style="padding:8px 0;">${escapeHtml(preferred)}</td></tr>
      </table>
      <a href="${escapeHtml(leadsUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;font-size:14px;">Open Lead Management</a>
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">EaseMySalon platform admin</p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Hi ${adminName},`,
    '',
    `A new platform lead needs assignment. ${pendingCount} lead(s) are currently unassigned.`,
    '',
    `Contact: ${lead.name}`,
    `Salon: ${salon}`,
    `City: ${city}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Source: ${source}`,
    `Preferred time: ${preferred}`,
    '',
    `Open Lead Management: ${leadsUrl}`,
  ].join('\n');

  return { subject, html, text };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fire-and-forget: notify eligible platform admins by email.
 * Skips if lead already has assignee, notifications disabled, or email off.
 *
 * @param {object} mainModels - req.mainModels from setupMainDatabase
 * @param {object} lead - saved PlatformLead doc (plain or mongoose)
 */
function notifyPlatformAdminsPendingLead(mainModels, lead) {
  if (!lead || lead.assignedAdminId) return;

  setImmediate(async () => {
    try {
      const { PlatformLead, AdminSettings } = mainModels;
      const settings = await AdminSettings.getSettings();
      if (!isLeadNotifyEnabled(settings)) {
        logger.debug('[platform-lead-notify] Disabled via settings or env');
        return;
      }

      await emailService.initialize();
      if (!emailService.enabled) {
        logger.warn('[platform-lead-notify] Email service not enabled — no admin alerts sent');
        return;
      }

      const recipients = await getNotificationRecipients(mainModels);
      if (!recipients.length) {
        logger.warn('[platform-lead-notify] No recipients with leads permission and email');
        return;
      }

      const pendingCount = await countUnassignedPendingLeads(PlatformLead);
      const leadPlain =
        typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };

      for (let i = 0; i < recipients.length; i++) {
        const admin = recipients[i];
        const { subject, html, text } = buildLeadEmail({
          lead: leadPlain,
          pendingCount,
          adminName: adminDisplayName(admin),
        });

        const result = await emailService.sendEmail({
          to: admin.email,
          subject,
          html,
          text,
        });

        if (!result.success) {
          logger.warn(
            '[platform-lead-notify] Failed for %s: %s',
            admin.email,
            result.error || 'unknown'
          );
        } else {
          logger.debug('[platform-lead-notify] Sent to %s', admin.email);
        }

        if (i < recipients.length - 1) {
          await sleep(EMAIL_DELAY_MS);
        }
      }
    } catch (err) {
      logger.error('[platform-lead-notify] Error:', err);
    }
  });
}

const SAMPLE_TEST_LEAD = {
  name: 'Priya Sharma',
  salonName: 'Luxe Hair Studio',
  city: 'Bengaluru',
  phone: '9876543210',
  email: 'priya@luxestudio.example',
  source: 'website',
  preferredDemoTime: '2:00 PM - 3:00 PM',
};

/**
 * Send a sample platform-lead notification (admin settings → test template).
 * @param {string} toEmail
 * @param {string} adminName
 * @param {{ testSettings?: object }} [options]
 */
async function sendPlatformLeadPendingTestEmail(toEmail, adminName, options = {}) {
  const { testSettings } = options;
  const emailService = require('../services/email-service');

  if (testSettings) {
    const originalConfig = emailService.config;
    const originalProvider = emailService.provider;
    const originalEnabled = emailService.enabled;
    const originalInitialized = emailService.initialized;

    emailService.config = { ...emailService.config, ...testSettings };
    emailService.provider = testSettings.provider || emailService.provider;
    emailService.enabled = testSettings.enabled !== false;
    emailService.initialized = false;

    try {
      await emailService.initialize();
      await emailService.setupProvider();
      const { subject, html, text } = buildLeadEmail({
        lead: SAMPLE_TEST_LEAD,
        pendingCount: 3,
        adminName: adminName || 'Admin',
      });
      const result = await emailService.sendEmail({
        to: toEmail,
        subject: `[TEST] ${subject}`,
        html: html.replace(
          '<h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">New lead needs assignment</h1>',
          '<h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">Test: new lead needs assignment</h1>'
        ),
        text: `[TEST]\n${text}`,
      });
      return result;
    } finally {
      emailService.config = originalConfig;
      emailService.provider = originalProvider;
      emailService.enabled = originalEnabled;
      emailService.initialized = originalInitialized;
      if (originalInitialized) {
        await emailService.setupProvider().catch(() => {});
      }
    }
  }

  await emailService.initialize();
  if (!emailService.enabled) {
    return { success: false, error: 'Email service not configured or disabled' };
  }

  const { subject, html, text } = buildLeadEmail({
    lead: SAMPLE_TEST_LEAD,
    pendingCount: 3,
    adminName: adminName || 'Admin',
  });

  return emailService.sendEmail({
    to: toEmail,
    subject: `[TEST] ${subject}`,
    html: html.replace(
      '<h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">New lead needs assignment</h1>',
      '<h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">Test: new lead needs assignment</h1>'
    ),
    text: `[TEST]\n${text}`,
  });
}

module.exports = {
  notifyPlatformAdminsPendingLead,
  sendPlatformLeadPendingTestEmail,
  buildLeadEmail,
  countUnassignedPendingLeads,
  adminPanelLeadsUrl,
};
