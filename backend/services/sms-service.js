const https = require('https');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

class SMSService {
  constructor() {
    this.config = null;
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize SMS service from admin settings or environment variables
   */
  async initialize() {
    if (this.initialized) {
      this.initialized = false;
    }

    try {
      const mainConnection = await databaseManager.getMainConnection();
      const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
      const settings = await AdminSettings.getSettings();
      const smsConfig = settings.notifications?.sms;

      // Enable when MSG91 is configured: enabled + auth key + at least one template (provider can be 'msg91' or legacy 'twilio' default)
      if (smsConfig && smsConfig.enabled && smsConfig.msg91AuthKey) {
        const templates = smsConfig.templates || {};
        const hasTemplate = Object.values(templates).some(tid => tid && String(tid).trim() !== '');
        if (hasTemplate) {
          this.config = { ...smsConfig, provider: 'msg91' };
          this.enabled = true;
          this.initialized = true;
          logger.debug('✅ SMS service initialized with provider: msg91');
          return;
        }
      }
      this.enabled = false;
      this.initialized = true;
    } catch (error) {
      logger.warn('⚠️ Could not load SMS config from admin settings, falling back to env:', error.message);
    }

    if (process.env.MSG91_SMS_AUTH_KEY) {
      this.config = {
        provider: 'msg91',
        msg91AuthKey: process.env.MSG91_SMS_AUTH_KEY,
        templates: {
          receipt: process.env.MSG91_SMS_TEMPLATE_RECEIPT || '',
          appointmentConfirmation: process.env.MSG91_SMS_TEMPLATE_APPOINTMENT_CONFIRMATION || '',
          appointmentCancellation: process.env.MSG91_SMS_TEMPLATE_APPOINTMENT_CANCELLATION || '',
          test: process.env.MSG91_SMS_TEMPLATE_TEST || ''
        }
      };
      this.enabled = true;
      this.initialized = true;
      logger.debug('✅ SMS service initialized from environment variables');
    } else {
      this.enabled = false;
      this.initialized = true;
    }
  }

  async reloadConfiguration() {
    this.initialized = false;
    this.config = null;
    this.enabled = false;
    await this.initialize();
  }

  formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;
    if (cleaned.length !== 12) return null;
    return cleaned;
  }

  getTemplateId(templateType) {
    const templates = this.config?.templates || {};
    return (templates[templateType] && String(templates[templateType]).trim()) || '';
  }

  /**
   * Extract variable names from template body (e.g. {{VAR1}}, #VAR2#, {VAR3})
   * Returns unique list in order of first occurrence.
   */
  static parseVariablesFromTemplateBody(templateBody) {
    if (!templateBody || typeof templateBody !== 'string') return [];
    const vars = new Set();
    const re = /\{\{(\w+)\}\}|#(\w+)#|\{(\w+)\}/g;
    let m;
    while ((m = re.exec(templateBody)) !== null) {
      const name = m[1] || m[2] || m[3];
      if (name) vars.add(name);
    }
    return Array.from(vars);
  }

  /**
   * Fetch template details from MSG91 and return required variable names.
   * Uses Get Template Versions API when available; otherwise returns variables parsed from optional templateBody.
   * @param {string} templateId - MSG91 template/flow ID
   * @param {string} authKey - MSG91 auth key
   * @param {string} [templateBody] - Optional: paste template text to parse variables (fallback)
   * @returns {Promise<{ success: boolean, variables?: string[], templateBody?: string, error?: string }>}
   */
  fetchTemplateDetails(templateId, authKey, templateBody) {
    return new Promise((resolve) => {
      const tryParseFromBody = (body) => {
        const variables = SMSService.parseVariablesFromTemplateBody(body);
        return resolve({ success: true, variables, templateBody: body });
      };

      if (templateBody && String(templateBody).trim()) {
        tryParseFromBody(String(templateBody).trim());
        return;
      }

      if (!templateId || !authKey) {
        return resolve({ success: false, error: 'Template ID and auth key required' });
      }

      const body = JSON.stringify({ template_id: templateId });
      const options = {
        method: 'POST',
        hostname: 'control.msg91.com',
        port: 443,
        path: '/api/v5/flow/get-template-versions',
        headers: {
          accept: 'application/json',
          authkey: authKey,
          'content-type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString();
          let data;
          try {
            data = JSON.parse(responseBody);
          } catch {
            return resolve({ success: false, error: 'Invalid response from MSG91' });
          }
          if (res.statusCode !== 200) {
            return resolve({ success: false, error: data.message || data.error || responseBody });
          }
          const templateBodyFromApi = data.template_body ?? data.body ?? data.data?.template_body ?? data.data?.body ?? data.flow_data?.template ?? '';
          const variablesFromApi = data.variables ?? data.data?.variables ?? data.flow_data?.variables;
          let variables = Array.isArray(variablesFromApi) ? variablesFromApi : SMSService.parseVariablesFromTemplateBody(templateBodyFromApi);
          if (variables.length === 0 && templateBodyFromApi) {
            variables = SMSService.parseVariablesFromTemplateBody(templateBodyFromApi);
          }
          return resolve({ success: true, variables, templateBody: templateBodyFromApi || undefined });
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.write(body);
      req.end();
    });
  }

  /**
   * Low-level: send SMS via MSG91 v5 Flow API (template-based)
   * POST https://control.msg91.com/api/v5/flow
   */
  sendFlowSms({ templateId, recipients }) {
    return new Promise((resolve) => {
      if (!this.config?.msg91AuthKey || !templateId) {
        return resolve({ success: false, error: 'SMS not configured or template ID missing' });
      }
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return resolve({ success: false, error: 'No recipients' });
      }

      const body = JSON.stringify({
        template_id: templateId,
        short_url: '1',
        recipients
      });

      const options = {
        method: 'POST',
        hostname: 'control.msg91.com',
        port: 443,
        path: '/api/v5/flow',
        headers: {
          accept: 'application/json',
          authkey: this.config.msg91AuthKey,
          'content-type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString();
          let data;
          try {
            data = JSON.parse(responseBody);
          } catch {
            return resolve({ success: false, error: responseBody || 'Invalid response' });
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const hasError = data.type === 'error' || data.hasError === true || (data.request_id === undefined && data.flow_id === undefined && data.message === undefined);
            if (hasError) {
              return resolve({ success: false, error: data.message || data.error || JSON.stringify(data), data });
            }
            return resolve({ success: true, data });
          }
          return resolve({ success: false, error: data.message || data.error || responseBody, data });
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.write(body);
      req.end();
    });
  }

  async sendReceipt({ to, clientName, receiptNumber, receiptData, receiptLink }) {
    if (!this.initialized) await this.initialize();
    if (!this.enabled) return { success: false, error: 'SMS service not configured' };

    const templateId = this.getTemplateId('receipt');
    if (!templateId) return { success: false, error: 'Receipt template not configured for SMS' };

    const phone = this.formatPhoneNumber(to);
    if (!phone) return { success: false, error: 'Invalid phone number' };

    const total = receiptData?.total != null ? String(receiptData.total) : '';
    const businessName = receiptData?.businessName || '';
    // Send full URL; MSG91 shortens it via short_url: '1' (m.9m.io) to avoid CTA whitelisting for third-party shorteners.
    const receiptDataObj = {
      clientName: String(clientName || 'Customer'),
      businessName: String(businessName),
      total,
      receiptNumber: String(receiptNumber || ''),
      receiptLink: String(receiptLink || '')
    };

    const mapping = this.config?.receiptVariableMapping && typeof this.config.receiptVariableMapping === 'object'
      ? this.config.receiptVariableMapping
      : { VAR1: 'clientName', VAR2: 'businessName', VAR3: 'total', VAR4: 'receiptNumber' };

    const recipient = { mobiles: phone };
    Object.keys(mapping).forEach((varKey) => {
      const field = mapping[varKey];
      if (field && String(field).trim() !== '' && field !== '__none__' && receiptDataObj.hasOwnProperty(field)) {
        recipient[varKey] = receiptDataObj[field];
      }
    });
    return await this.sendFlowSms({ templateId, recipients: [recipient] });
  }

  async sendAppointmentConfirmation({ to, clientName, appointmentData }) {
    if (!this.initialized) await this.initialize();
    if (!this.enabled) return { success: false, error: 'SMS service not configured' };

    const templateId = this.getTemplateId('appointmentConfirmation');
    if (!templateId) return { success: false, error: 'Appointment confirmation template not configured for SMS' };

    const phone = this.formatPhoneNumber(to);
    if (!phone) return { success: false, error: 'Invalid phone number' };

    const recipients = [{
      mobiles: phone,
      VAR1: String(clientName || 'Customer'),
      VAR2: String(appointmentData?.serviceName || 'Service'),
      VAR3: String(appointmentData?.date || ''),
      VAR4: String(appointmentData?.time || ''),
      VAR5: String(appointmentData?.staffName || 'Not assigned'),
      VAR6: String(appointmentData?.businessName || '')
    }];
    return await this.sendFlowSms({ templateId, recipients });
  }

  async sendAppointmentCancellation({ to, clientName, appointmentData, cancellationReason }) {
    if (!this.initialized) await this.initialize();
    if (!this.enabled) return { success: false, error: 'SMS service not configured' };

    const templateId = this.getTemplateId('appointmentCancellation');
    if (!templateId) return { success: false, error: 'Appointment cancellation template not configured for SMS' };

    const phone = this.formatPhoneNumber(to);
    if (!phone) return { success: false, error: 'Invalid phone number' };

    const recipients = [{
      mobiles: phone,
      VAR1: String(clientName || 'Customer'),
      VAR2: String(appointmentData?.serviceName || 'Service'),
      VAR3: String(appointmentData?.date || ''),
      VAR4: String(appointmentData?.time || ''),
      VAR5: String(appointmentData?.businessName || ''),
      VAR6: String(cancellationReason || 'Cancelled')
    }];
    return await this.sendFlowSms({ templateId, recipients });
  }

  async sendTestSms({ to, message }) {
    if (!this.initialized) await this.initialize();
    if (!this.enabled) return { success: false, error: 'SMS service not configured' };

    const templateId = this.getTemplateId('test');
    if (!templateId) return { success: false, error: 'Test template not configured for SMS' };

    const phone = this.formatPhoneNumber(to);
    if (!phone) return { success: false, error: 'Invalid phone number' };

    const recipients = [{ mobiles: phone, VAR1: String(message || 'Test message from EaseMySalon') }];
    return await this.sendFlowSms({ templateId, recipients });
  }
}

const smsService = new SMSService();
module.exports = smsService;
