const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const gupshupConfig = require('../lib/gupshup-config');
const { loadBusinessWhatsAppTemplateConfig } = require('../lib/business-whatsapp-template-config');
const { resolveGupshupTemplateForSend } = require('../lib/gupshup-resolve-template-for-send');

/**
 * Flatten an MSG91-style variable map ({ body_1, body_2, button_1 } or numeric
 * { 1, 2 }) into Gupshup's ordered positional params array. Body variables come
 * before button variables; within each, numeric order. Values are stringified
 * and empties preserved so positional count matches the approved template.
 */
function buildOrderedParamsFromVariables(variables) {
  const keys = Object.keys(variables || {});
  if (!keys.length) return [];
  const named = keys.filter((k) => k.startsWith('body_') || k.startsWith('button_'));
  const source = named.length ? named : keys;
  const sorted = source.sort((a, b) => {
    const at = a.startsWith('button_') ? 1 : 0;
    const bt = b.startsWith('button_') ? 1 : 0;
    if (at !== bt) return at - bt;
    return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0);
  });
  return sorted.map((k) => String(variables[k] ?? ''));
}

class WhatsAppService {
  constructor() {
    this.config = null;
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize WhatsApp service from admin settings or environment variables
   */
  async initialize() {
    if (this.initialized) {
      // Even if initialized, reload config to get latest settings
      // This ensures settings changes are picked up
      this.initialized = false;
    }

    try {
      // Try to load from admin settings
      const mainConnection = await databaseManager.getMainConnection();
      const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
      const settings = await AdminSettings.getSettings();
      const whatsappConfig = settings.notifications?.whatsapp;

      logger.debug('📱 [WhatsApp Service] Loading config from admin settings:', {
        hasWhatsappConfig: !!whatsappConfig,
        enabled: whatsappConfig?.enabled,
        hasTemplates: !!whatsappConfig?.templates,
        gupshupReady: await gupshupConfig.isPlatformConfiguredAsync(),
      });

      if (whatsappConfig && whatsappConfig.enabled) {
        const templates = whatsappConfig.templates || {};
        const hasTemplate = Object.values(templates).some(
          (templateId) => templateId && String(templateId).trim() !== ''
        );
        const gupshupReady = await gupshupConfig.isPlatformConfiguredAsync();

        if (hasTemplate && gupshupReady) {
          this.config = { ...whatsappConfig, provider: 'gupshup' };
          this.enabled = true;
          this.initialized = true;
          logger.debug('✅ WhatsApp service initialized with Gupshup');
          return;
        }

        if (!hasTemplate) {
          logger.warn('⚠️  WhatsApp service enabled but no templates configured');
        } else {
          logger.warn('⚠️  WhatsApp service enabled but Gupshup platform app is not configured');
        }
        this.enabled = false;
        this.initialized = true;
        return;
      }

      logger.warn('⚠️  WhatsApp service not enabled in admin settings');
      this.enabled = false;
      this.initialized = true;
    } catch (error) {
      logger.warn('⚠️  Could not load WhatsApp config from admin settings:', error.message);
      this.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Reload configuration from admin settings
   */
  async reloadConfiguration() {
    this.initialized = false;
    this.config = null;
    this.enabled = false;
    await this.initialize();
  }

  /**
   * Check if current time is within quiet hours
   */
  isQuietHours(quietHoursConfig) {
    if (!quietHoursConfig || !quietHoursConfig.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = quietHoursConfig.start || '22:00';
    const end = quietHoursConfig.end || '08:00';

    // Handle quiet hours that span midnight
    if (start > end) {
      // Quiet hours span midnight (e.g., 22:00 to 08:00)
      return currentTime >= start || currentTime <= end;
    } else {
      // Quiet hours within same day
      return currentTime >= start && currentTime <= end;
    }
  }

  /**
   * Format phone number for MSG91 (should be in format: 91XXXXXXXXXX)
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If starts with 0, remove it
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    
    // If doesn't start with country code, assume India (91)
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }

    // 10-digit national mobiles can start with "91" (e.g. 9102401334). That is still missing the
    // leading country code — prepend 91 → 919102401334 (12 digits for MSG91).
    if (cleaned.length === 10 && cleaned.startsWith('91')) {
      cleaned = '91' + cleaned;
    }

    // Duplicate country code: 9191XXXXXXXXXX → 91XXXXXXXXXX
    if (cleaned.startsWith('9191') && cleaned.length === 13) {
      cleaned = cleaned.slice(2);
    }
    
    // Validate length (should be 12 digits: 91 + 10 digits)
    if (cleaned.length !== 12) {
      return null;
    }
    
    return cleaned;
  }

  /**
   * Send WhatsApp message via MSG91
   */
  async sendMessage({ to, message, templateId, flowId, variables = {}, businessId = null }) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.enabled) {
      logger.warn('WhatsApp service not enabled');
      return { success: false, error: 'WhatsApp service not configured' };
    }

    try {
      // Format phone number (remove + and ensure it starts with country code)
      const phoneNumber = this.formatPhoneNumber(to);
      
      if (!phoneNumber) {
        return { success: false, error: 'Invalid phone number format' };
      }

      // Use template message if templateId is provided
      if (templateId) {
        return await this.sendTemplateMessage({
          to: phoneNumber,
          templateId,
          variables,
          businessId,
        });
      } else {
        return { success: false, error: 'Template ID is required' };
      }
    } catch (error) {
      logger.error('Error sending WhatsApp message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gupshup transactional send (migration path). Reuses the already-mapped
   * MSG91 variable map: the AdminSettings template slot now holds a Gupshup
   * template id, and the body_/button_ map is flattened to ordered params.
   * Sender resolution (salon's own app first, shared platform fallback) is done
   * inside the Gupshup service via businessId. Returns an MSG91-shaped result so
   * every existing caller (logging + wallet) keeps working unchanged.
   */
  async sendViaGupshup({ to, templateId, variables, businessId = null }) {
    try {
      const gupshup = require('./gupshup-whatsapp-service');
      const destination = this.formatPhoneNumber(to) || String(to || '').replace(/\D/g, '');
      if (!destination) return { success: false, error: 'Invalid phone number format' };
      if (!templateId || !String(templateId).trim()) {
        return { success: false, error: 'Gupshup template id not configured for this notification' };
      }
      const params = buildOrderedParamsFromVariables(variables || {});
      const result = await gupshup.sendTemplate({
        businessId: businessId || undefined,
        to: destination,
        templateId: String(templateId).trim(),
        params,
      });
      if (result.success) {
        return { success: true, data: result.data, requestId: result.messageId || null, provider: 'gupshup' };
      }
      return { success: false, error: result.error || 'Gupshup send failed', responseData: result.error };
    } catch (err) {
      logger.error('❌ [Gupshup] transactional send failed:', err?.message || err);
      return { success: false, error: err?.message || 'Gupshup send failed' };
    }
  }

  /**
   * Send template message via Gupshup Partner Portal.
   */
  async sendTemplateMessage({ to, templateId, variables, businessId = null }) {
    const gupshupAvailable =
      (await gupshupConfig.isPlatformConfiguredAsync()) ||
      (businessId &&
        gupshupConfig.isBusinessAppUsable(await gupshupConfig.loadAccount(businessId)));
    if (!gupshupAvailable) {
      return {
        success: false,
        error: 'Gupshup is not configured. Connect a salon WhatsApp app or configure the shared platform app.',
      };
    }
    return this.sendViaGupshup({ to, templateId, variables, businessId });
  }

  /** @deprecated Use Gupshup template manager under Settings → WhatsApp Templates. */
  async createTemplate() {
    return {
      success: false,
      error: 'WhatsApp templates are managed via Gupshup. Use Settings → WhatsApp Templates or Admin → Platform templates.',
    };
  }

  /**
   * Get template ID for a specific notification type
   */
  getTemplateId(templateType) {
    const templates = this.config?.templates || {};
    return templates[templateType] || templates.default || '';
  }

  /**
   * Resolve template ID for tests — do not fall back to default when a specific type was requested.
   */
  getTemplateIdForTest(templateType = 'default') {
    const templates = this.config?.templates || {};
    const specific = templates[templateType];
    if (specific && String(specific).trim()) {
      return String(specific).trim();
    }
    if (templateType === 'default') {
      return this.getTemplateId('default');
    }
    return '';
  }

  buildReceiptWithFeedbackTestVariables() {
    const sampleReceipt =
      'https://www.easemysalon.in/receipt/public/INV-000001/samplesharetoken0123456789abcdef0123456789ab';
    const sampleFeedback =
      'https://www.easemysalon.in/feedback/6a24b1a8d7ca686a0bd9ed4c/samplefeedbacktoken0123456789abcdef0123456789ab?s=whatsapp';
    return {
      body_1: 'Test Client',
      body_2: 'Test Business',
      button_1: this.extractReceiptPath(sampleReceipt),
      button_2: this.extractFeedbackPath(sampleFeedback),
    };
  }

  /**
   * Get variable mapping for a specific template type
   * Returns the mapping of template variables (body_1, body_2, etc.) to data field names
   */
  getTemplateVariableMapping(templateType) {
    const templateVariables = this.config?.templateVariables || {};
    return templateVariables[templateType] || {};
  }

  /**
   * Resolve template slots for a send: connected salons with mapped business
   * templates use Business.settings; shared-number salons use AdminSettings.
   */
  async getEffectiveTemplateConfig(businessId) {
    if (businessId) {
      try {
        const account = await gupshupConfig.loadAccount(businessId);
        if (gupshupConfig.isBusinessAppUsable(account)) {
          const bizCfg = await loadBusinessWhatsAppTemplateConfig(businessId);
          if (bizCfg) {
            return {
              templates: bizCfg.templates || {},
              templateVariables: bizCfg.templateVariables || {},
              scope: 'business',
            };
          }
          // Tenant app connected but notification slots not synced yet — use admin mappings.
          return {
            templates: this.config?.templates || {},
            templateVariables: this.config?.templateVariables || {},
            scope: 'admin',
          };
        }
      } catch (err) {
        logger.warn('[WhatsApp] business template config load failed, using admin:', err?.message);
      }
    }
    return {
      templates: this.config?.templates || {},
      templateVariables: this.config?.templateVariables || {},
      scope: 'admin',
    };
  }

  async resolveTemplateForSend(templateType, businessId = null) {
    const cfg = await this.getEffectiveTemplateConfig(businessId);
    const rawId =
      cfg.templates[templateType] ||
      cfg.templates.default ||
      '';
    const templateId = String(rawId || '').trim();
    if (!templateId) {
      return {
        templateId: '',
        error: `No WhatsApp template configured for "${templateType}". Map one in Admin → Notifications.`,
      };
    }

    const resolved = await resolveGupshupTemplateForSend({
      businessId,
      templateId,
      slotKey: templateType,
    });
    if (!resolved.success) {
      return { templateId: '', error: resolved.error };
    }
    if (resolved.replacedStaleId) {
      logger.info(
        `[WhatsApp] Resolved ${templateType} template for business ${businessId}: ${templateId} → ${resolved.templateId} (${resolved.elementName || 'tenant app'})`
      );
    }
    return { templateId: resolved.templateId, error: null };
  }

  async resolveTemplateId(templateType, businessId = null) {
    const { templateId } = await this.resolveTemplateForSend(templateType, businessId);
    return templateId;
  }

  async resolveVariableMapping(templateType, businessId = null) {
    const cfg = await this.getEffectiveTemplateConfig(businessId);
    return cfg.templateVariables[templateType] || {};
  }

  async mapDataToTemplateVariablesForBusiness(templateType, data, businessId = null) {
    const variableMapping = await this.resolveVariableMapping(templateType, businessId);
    const mappedVariables = {};
    Object.keys(variableMapping).forEach((templateVar) => {
      const dataField = variableMapping[templateVar];
      const value =
        data[dataField] !== undefined && data[dataField] !== null ? String(data[dataField]) : '';
      mappedVariables[templateVar] = value;
    });
    return mappedVariables;
  }

  /**
   * Map data object to template variables based on configuration
   * @param {string} templateType - The template type (e.g., 'receipt', 'appointmentConfirmation')
   * @param {object} data - The data object with actual values (e.g., { clientName: 'John', businessName: 'Salon' })
   * @returns {object} - Mapped variables in body_X format (e.g., { body_1: 'John', body_2: 'Salon' })
   */
  mapDataToTemplateVariables(templateType, data) {
    const variableMapping = this.getTemplateVariableMapping(templateType);
    const mappedVariables = {};

    // Iterate through the mapping configuration
    Object.keys(variableMapping).forEach(templateVar => {
      const dataField = variableMapping[templateVar];
      // Get the value from data object, use empty string if not found
      const value = data[dataField] !== undefined && data[dataField] !== null 
        ? String(data[dataField]) 
        : '';
      mappedVariables[templateVar] = value;
    });

    return mappedVariables;
  }

  /**
   * Send welcome message via WhatsApp
   */
  async sendWelcomeMessage({ to, clientName, businessName, welcomeMessage }) {
    const variables = {
      body_1: clientName || 'Customer',
      body_2: businessName || 'Business',
      body_3: welcomeMessage || 'Welcome to our salon!'
    };

    return await this.sendMessage({
      to,
      templateId: this.getTemplateId('welcomeMessage'),
      variables
    });
  }

  /**
   * Send business account created notification via WhatsApp
   */
  async sendBusinessAccountCreated({ to, businessName, businessCode, adminName, loginUrl }) {
    const variables = {
      body_1: businessName || 'Business',
      body_2: businessCode || '',
      body_3: adminName || 'Administrator',
      body_4: loginUrl || ''
    };

    return await this.sendMessage({
      to,
      templateId: this.getTemplateId('businessAccountCreated'),
      variables
    });
  }

  extractFeedbackPath(feedbackLink) {
    if (!feedbackLink) return '';
    if (feedbackLink.startsWith('http://') || feedbackLink.startsWith('https://')) {
      const match = feedbackLink.match(/\/feedback\/(.+)$/);
      if (match && match[1]) {
        return match[1].split('?')[0];
      }
      return feedbackLink;
    }
    return feedbackLink;
  }

  /**
   * Extract receipt path from full URL if template already includes base URL
   * If receiptLink is a full URL like "https://www.easemysalon.in/receipt/public/INV-000052/abc123"
   * and template includes base URL, return just "INV-000052/abc123"
   */
  extractReceiptPath(receiptLink) {
    if (!receiptLink) return '';
    
    // Check if it's a full URL
    if (receiptLink.startsWith('http://') || receiptLink.startsWith('https://')) {
      // Extract path after /receipt/public/
      const match = receiptLink.match(/\/receipt\/public\/(.+)$/);
      if (match && match[1]) {
        return match[1]; // Returns "INV-000052/abc123"
      }
      // If pattern doesn't match, return the full URL (fallback)
      return receiptLink;
    }
    
    // If it's already just a path (e.g., "INV-000052/abc123"), return as is
    return receiptLink;
  }

  /**
   * Normalize Google Maps short link input (full URL or slug only) to a canonical https URL.
   * Slug example: rwY2PmLdcE4TNo8w9 -> https://maps.app.goo.gl/rwY2PmLdcE4TNo8w9
   */
  normalizeGoogleMapsUrl(input) {
    if (input == null || input === '') return '';
    const t = String(input).trim();
    if (!t) return '';
    if (!t.includes('://') && /^[a-zA-Z0-9_-]+$/.test(t)) {
      return `https://maps.app.goo.gl/${t}`;
    }
    try {
      const u = new URL(t.startsWith('http') ? t : `https://${t}`);
      if (/maps\.app\.goo\.gl$/i.test(u.hostname)) {
        const seg = u.pathname.replace(/^\//, '').split('/')[0];
        return seg ? `https://maps.app.goo.gl/${seg}` : t;
      }
      return u.toString();
    } catch {
      return t;
    }
  }

  /**
   * When the MSG91 template URL already includes https://maps.app.goo.gl/, pass only the path segment (slug).
   */
  extractGoogleMapsSlug(mapsUrl) {
    if (!mapsUrl) return '';
    const m = String(mapsUrl).match(/maps\.app\.goo\.gl\/([^/?#]+)/i);
    if (m && m[1]) return m[1];
    return String(mapsUrl);
  }

  /**
   * @returns {{ processedBody: string, processedButton: string }}
   */
  prepareGoogleMapsTemplateParts(rawMapsUrl) {
    const templateIncludesGoogleMapsBaseUrl = this.config?.templateIncludesGoogleMapsBaseUrl !== false;
    const normalizedFull = this.normalizeGoogleMapsUrl(rawMapsUrl);
    if (!normalizedFull) {
      return { processedBody: '', processedButton: '' };
    }
    if (templateIncludesGoogleMapsBaseUrl) {
      const slug = this.extractGoogleMapsSlug(normalizedFull);
      return { processedBody: slug, processedButton: slug };
    }
    return { processedBody: normalizedFull, processedButton: normalizedFull };
  }

  /**
   * After mapDataToTemplateVariables, ensure button/body slots mapped to googleMapsUrl get path vs full URL correctly.
   */
  applyGoogleMapsVariableOverrides(templateType, variables, processedBody, processedButton, variableMapping = null) {
    const mapping = variableMapping || this.getTemplateVariableMapping(templateType);
    if (Object.keys(mapping).length === 0) return;
    Object.keys(mapping).forEach((varName) => {
      if (mapping[varName] !== 'googleMapsUrl') return;
      if (varName.startsWith('button_')) {
        variables[varName] = processedButton;
      } else if (varName.startsWith('body_')) {
        variables[varName] = processedBody;
      }
    });
  }

  async resolveReceiptTemplateType(feedbackLink, businessId = null) {
    const feedbackTemplateId = businessId
      ? await this.resolveTemplateId('receiptWithFeedback', businessId)
      : this.getTemplateId('receiptWithFeedback');
    const hasFeedbackTemplate = Boolean(
      feedbackTemplateId && String(feedbackTemplateId).trim()
    );
    if (feedbackLink && hasFeedbackTemplate) {
      return 'receiptWithFeedback';
    }
    return 'receipt';
  }

  async sendReceipt({ to, clientName, receiptNumber, receiptData, receiptLink, feedbackLink, businessId = null }) {
    const templateType = await this.resolveReceiptTemplateType(feedbackLink, businessId);
    const { templateId, error: templateError } = await this.resolveTemplateForSend(templateType, businessId);
    if (templateError) {
      return { success: false, error: templateError };
    }
    const variableMapping = await this.resolveVariableMapping(templateType, businessId);

    logger.debug('📱 [sendReceipt] Starting receipt send:', {
      to,
      clientName,
      receiptNumber,
      businessName: receiptData?.businessName,
      receiptLink,
      feedbackLink: feedbackLink ? `${String(feedbackLink).substring(0, 48)}…` : '',
      templateType,
      templateId,
      hasConfig: !!this.config
    });
    
    // Check if template already includes base URL (from config or environment)
    // If template has base URL, extract just the path variables
    const templateIncludesBaseUrl = this.config?.templateIncludesBaseUrl !== false; // Default to true for production safety
    
    // CRITICAL: Based on MSG91 template configuration:
    // - Template URL: https://www.easemysalon.in/receipt/public/{{1}}
    // - button_1 should contain just the path part (e.g., INV-000056/abc123)
    // - MSG91 will combine template base URL + button_1 value
    // - But button component must still be formatted as type "url" in API payload
    let processedReceiptLinkForBody = receiptLink || '';
    let processedReceiptLinkForButton = receiptLink || '';
    
    // If template includes base URL and we have a full URL, extract just the path
    if (templateIncludesBaseUrl && receiptLink) {
      processedReceiptLinkForBody = this.extractReceiptPath(receiptLink);
      processedReceiptLinkForButton = this.extractReceiptPath(receiptLink); // Use path for button too
      logger.debug(`📱 [sendReceipt] Template includes base URL, extracted path: ${processedReceiptLinkForButton}`);
      logger.debug(`📱 [sendReceipt] Template will combine base URL + path: https://www.easemysalon.in/receipt/public/${processedReceiptLinkForButton}`);
    }
    
    let processedFeedbackForBody = feedbackLink || '';
    let processedFeedbackForButton = feedbackLink || '';
    if (templateIncludesBaseUrl && feedbackLink) {
      processedFeedbackForBody = this.extractFeedbackPath(feedbackLink);
      processedFeedbackForButton = this.extractFeedbackPath(feedbackLink);
    }

    const data = {
      clientName: clientName || 'Customer',
      businessName: receiptData?.businessName || 'Business',
      receiptLink: processedReceiptLinkForBody, // Use extracted path for body variables
      feedbackLink: processedFeedbackForBody,
    };
    
    logger.debug('📱 [sendReceipt] Data object:', data);
    
    const variables = await this.mapDataToTemplateVariablesForBusiness(templateType, data, businessId);
    
    logger.debug('📱 [sendReceipt] Mapped variables:', variables);
    logger.debug('📱 [sendReceipt] Variable mapping config:', variableMapping);
    
    // If no mapping configured, use default mapping
    if (Object.keys(variables).length === 0) {
      logger.debug('📱 [sendReceipt] No variable mapping found, using defaults');
      variables.body_1 = data.clientName;
      variables.body_2 = data.businessName;
      variables.button_1 = processedReceiptLinkForButton;
      if (templateType === 'receiptWithFeedback' && processedFeedbackForButton) {
        variables.button_2 = processedFeedbackForButton;
      }
    } else {
      // Check if button variables are mapped and add receiptLink
      // CRITICAL: Use full URL for button variables, extracted path for body variables
      Object.keys(variableMapping).forEach(varName => {
        if (varName.startsWith('button_') && variableMapping[varName] === 'receiptLink') {
          // Template includes base URL, so send just the path part
          // Template URL: https://www.easemysalon.in/receipt/public/{{1}}
          // button_1 value: INV-000056/abc123 (just the path)
          variables[varName] = processedReceiptLinkForButton;
          logger.debug(`📱 [sendReceipt] Setting ${varName} to path (template includes base URL): ${processedReceiptLinkForButton}`);
        } else if (varName.startsWith('body_') && variableMapping[varName] === 'receiptLink') {
          // Use extracted path for body variables if template includes base URL
          variables[varName] = processedReceiptLinkForBody;
        } else if (varName.startsWith('button_') && variableMapping[varName] === 'feedbackLink') {
          variables[varName] = processedFeedbackForButton;
        } else if (varName.startsWith('body_') && variableMapping[varName] === 'feedbackLink') {
          variables[varName] = processedFeedbackForBody;
        }
      });
    }

    logger.debug('📱 [sendReceipt] Final variables before send:', variables);
    logger.debug('📱 [sendReceipt] Template ID:', templateId);

    const result = await this.sendMessage({
      to,
      templateId,
      variables,
      businessId,
    });
    
    logger.debug('📱 [sendReceipt] Send result:', result);
    
    return result;
  }

  /**
   * Send receipt cancellation via WhatsApp
   */
  async sendReceiptCancellation({ to, clientName, receiptNumber, receiptData, cancellationReason, businessId = null }) {
    const data = {
      clientName: clientName || 'Customer',
      receiptNumber: receiptNumber || '',
      businessName: receiptData?.businessName || 'Business',
      cancellationReason: cancellationReason || 'Cancelled'
    };
    
    const variables = await this.mapDataToTemplateVariablesForBusiness('receiptCancellation', data, businessId);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.receiptNumber;
      variables.body_3 = data.businessName;
      variables.body_4 = data.cancellationReason;
    }

    return await this.sendMessage({
      to,
      templateId: await this.resolveTemplateId('receiptCancellation', businessId),
      variables,
      businessId,
    });
  }

  /**
   * Send appointment scheduling via WhatsApp
   */
  async sendAppointmentScheduling({ to, clientName, appointmentData, businessId = null }) {
    const { processedBody: gmapsBody, processedButton: gmapsBtn } = this.prepareGoogleMapsTemplateParts(
      appointmentData?.googleMapsUrl
    );
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || '',
      googleMapsUrl: gmapsBody
    };
    
    const variables = await this.mapDataToTemplateVariablesForBusiness('appointmentScheduling', data, businessId);
    const variableMapping = await this.resolveVariableMapping('appointmentScheduling', businessId);
    this.applyGoogleMapsVariableOverrides('appointmentScheduling', variables, gmapsBody, gmapsBtn, variableMapping);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.businessName;
    }

    const { templateId, error: templateError } = await this.resolveTemplateForSend(
      'appointmentScheduling',
      businessId
    );
    if (templateError) {
      return { success: false, error: templateError };
    }

    return await this.sendMessage({
      to,
      templateId,
      variables,
      businessId,
    });
  }

  /**
   * Send appointment confirmation via WhatsApp
   */
  async sendAppointmentConfirmation({ to, clientName, appointmentData, businessId = null }) {
    const { processedBody: gmapsBody, processedButton: gmapsBtn } = this.prepareGoogleMapsTemplateParts(
      appointmentData?.googleMapsUrl
    );
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      staffName: appointmentData?.staffName || 'Not assigned',
      businessName: appointmentData?.businessName || '',
      businessPhone: appointmentData?.businessPhone || '',
      googleMapsUrl: gmapsBody
    };
    
    const variables = await this.mapDataToTemplateVariablesForBusiness('appointmentConfirmation', data, businessId);
    const variableMapping = await this.resolveVariableMapping('appointmentConfirmation', businessId);
    this.applyGoogleMapsVariableOverrides('appointmentConfirmation', variables, gmapsBody, gmapsBtn, variableMapping);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.staffName;
      variables.body_6 = data.businessName;
      variables.body_7 = data.businessPhone;
    }

    const { templateId, error: templateError } = await this.resolveTemplateForSend(
      'appointmentConfirmation',
      businessId
    );
    if (templateError) {
      return { success: false, error: templateError };
    }

    return await this.sendMessage({
      to,
      templateId,
      variables,
      businessId,
    });
  }

  /**
   * Send appointment cancellation via WhatsApp
   */
  async sendAppointmentCancellation({ to, clientName, appointmentData, cancellationReason, businessId = null }) {
    const { processedBody: gmapsBody, processedButton: gmapsBtn } = this.prepareGoogleMapsTemplateParts(
      appointmentData?.googleMapsUrl
    );
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || '',
      cancellationReason: cancellationReason || 'Cancelled',
      googleMapsUrl: gmapsBody
    };
    
    const variables = await this.mapDataToTemplateVariablesForBusiness('appointmentCancellation', data, businessId);
    const variableMapping = await this.resolveVariableMapping('appointmentCancellation', businessId);
    this.applyGoogleMapsVariableOverrides('appointmentCancellation', variables, gmapsBody, gmapsBtn, variableMapping);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.businessName;
      variables.body_6 = data.cancellationReason;
    }

    return await this.sendMessage({
      to,
      templateId: await this.resolveTemplateId('appointmentCancellation', businessId),
      variables,
      businessId,
    });
  }

  /**
   * Send appointment reschedule notification via WhatsApp
   */
  async sendAppointmentReschedule({ to, clientName, appointmentData, businessId = null }) {
    const { processedBody: gmapsBody, processedButton: gmapsBtn } = this.prepareGoogleMapsTemplateParts(
      appointmentData?.googleMapsUrl
    );
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      staffName: appointmentData?.staffName || 'Not assigned',
      businessName: appointmentData?.businessName || '',
      businessPhone: appointmentData?.businessPhone || '',
      googleMapsUrl: gmapsBody
    };

    const variables = await this.mapDataToTemplateVariablesForBusiness('appointmentReschedule', data, businessId);
    const variableMapping = await this.resolveVariableMapping('appointmentReschedule', businessId);
    this.applyGoogleMapsVariableOverrides('appointmentReschedule', variables, gmapsBody, gmapsBtn, variableMapping);

    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.businessName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.businessPhone;
    }

    const templateId = await this.resolveTemplateId('appointmentReschedule', businessId);
    if (!templateId || !String(templateId).trim()) {
      logger.error('📱 [WhatsApp] appointmentReschedule: no template ID configured');
      return { success: false, error: 'Appointment reschedule template is not configured. Map an approved template in WhatsApp → Templates.' };
    }

    return await this.sendMessage({ to, templateId, variables, businessId });
  }

  /**
   * Send appointment reminder via WhatsApp
   */
  async sendAppointmentReminder({ to, clientName, appointmentData, reminderHours, businessId = null }) {
    const { processedBody: gmapsBody, processedButton: gmapsBtn } = this.prepareGoogleMapsTemplateParts(
      appointmentData?.googleMapsUrl
    );
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || '',
      businessPhone: appointmentData?.businessPhone || '',
      reminderHours: `${reminderHours || 24} hours`,
      googleMapsUrl: gmapsBody
    };
    
    const variables = await this.mapDataToTemplateVariablesForBusiness('appointmentReminder', data, businessId);
    const variableMapping = await this.resolveVariableMapping('appointmentReminder', businessId);
    this.applyGoogleMapsVariableOverrides('appointmentReminder', variables, gmapsBody, gmapsBtn, variableMapping);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.businessName;
      variables.body_6 = data.businessPhone;
      variables.body_7 = data.reminderHours;
    }

    return await this.sendMessage({
      to,
      templateId: await this.resolveTemplateId('appointmentReminder', businessId),
      variables,
      businessId,
    });
  }

  /**
   * Prepaid wallet ledger activity (credit / debit / adjustment / refund_credit).
   * Template type: clientWalletTransaction — Admin → Notifications → WhatsApp.
   * Expected data fields: clientName, businessName, planName, transactionType, transactionTypeLabel,
   * amountFormatted, balanceAfterFormatted, description (optional extra mapping only)
   */
  async sendClientWalletTransaction(payload) {
    const { to, businessId = null, ...rest } = payload || {};
    const data = {
      clientName: rest.clientName || 'Customer',
      businessName: rest.businessName || 'Salon',
      planName: rest.planName || 'Prepaid wallet',
      transactionType: rest.transactionType || '',
      transactionTypeLabel: rest.transactionTypeLabel || 'Update',
      amountFormatted: rest.amountFormatted || '',
      balanceAfterFormatted: rest.balanceAfterFormatted || '',
      description: rest.description || '',
    };

    const templateType = 'clientWalletTransaction';
    let variables = await this.mapDataToTemplateVariablesForBusiness(templateType, data, businessId);
    if (!variables || Object.keys(variables).length === 0) {
      variables = {
        body_1: data.clientName,
        body_2: data.planName,
        body_3: data.businessName,
        body_4: data.transactionTypeLabel,
        body_5: data.amountFormatted,
        body_6: data.balanceAfterFormatted,
      };
    }

    const templateId = await this.resolveTemplateId(templateType, businessId);
    if (!templateId || !String(templateId).trim()) {
      return { success: false, error: 'clientWalletTransaction template not configured. Map an approved template in WhatsApp → Templates.' };
    }

    return this.sendMessage({ to, templateId, variables, businessId });
  }

  /**
   * Prepaid wallet expiry reminder (30 / 15 / 7 days before expiryDate).
   * Template type: clientWalletExpiryReminder
   */
  async sendClientWalletExpiryReminder(payload) {
    const { to, businessId = null, ...rest } = payload || {};
    const data = {
      clientName: rest.clientName || 'Customer',
      businessName: rest.businessName || 'Salon',
      planName: rest.planName || 'Prepaid wallet',
      daysLeft: rest.daysLeft != null ? String(rest.daysLeft) : '',
      expiryDateFormatted: rest.expiryDateFormatted || '',
      balanceFormatted: rest.balanceFormatted || '',
    };

    const templateType = 'clientWalletExpiryReminder';
    let variables = await this.mapDataToTemplateVariablesForBusiness(templateType, data, businessId);
    if (!variables || Object.keys(variables).length === 0) {
      variables = {
        body_1: data.clientName,
        body_2: data.planName,
        body_3: data.businessName,
        body_4: data.daysLeft,
        body_5: data.expiryDateFormatted,
        body_6: data.balanceFormatted,
      };
    }

    const templateId = await this.resolveTemplateId(templateType, businessId);
    if (!templateId || !String(templateId).trim()) {
      return { success: false, error: 'clientWalletExpiryReminder template not configured. Map an approved template in WhatsApp → Templates.' };
    }

    return this.sendMessage({ to, templateId, variables, businessId });
  }

  /**
   * Outstanding bill dues reminder (utility). Template: clientDuesReminder
   * body_1 clientName, body_2 duesAmountFormatted, body_3 businessName
   */
  async sendClientDuesReminder(payload) {
    const { to, businessId = null, ...rest } = payload || {};
    const data = {
      clientName: rest.clientName || 'Customer',
      businessName: rest.businessName || 'Salon',
      duesAmountFormatted: rest.duesAmountFormatted || '0',
    };

    const templateType = 'clientDuesReminder';
    let variables = await this.mapDataToTemplateVariablesForBusiness(templateType, data, businessId);
    if (!variables || Object.keys(variables).length === 0) {
      variables = {
        body_1: data.clientName,
        body_2: data.duesAmountFormatted,
        body_3: data.businessName,
      };
    }

    const { templateId, error: templateError } = await this.resolveTemplateForSend(templateType, businessId);
    if (templateError) {
      return { success: false, error: templateError };
    }

    return this.sendMessage({ to, templateId, variables, businessId });
  }

  /**
   * Birthday wish on client's DOB (utility). Template: clientBirthdayReminder
   * body_1 clientName, body_2 businessName, body_3 businessName (Team {{3}})
   */
  async sendClientBirthdayReminder(payload) {
    const { to, businessId = null, ...rest } = payload || {};
    const data = {
      clientName: rest.clientName || 'Customer',
      businessName: rest.businessName || 'Salon',
    };

    const templateType = 'clientBirthdayReminder';
    let variables = await this.mapDataToTemplateVariablesForBusiness(templateType, data, businessId);
    if (!variables || Object.keys(variables).length === 0) {
      variables = {
        body_1: data.clientName,
        body_2: data.businessName,
        body_3: data.businessName,
      };
    }

    const { templateId, error: templateError } = await this.resolveTemplateForSend(templateType, businessId);
    if (templateError) {
      return { success: false, error: templateError };
    }

    return this.sendMessage({ to, templateId, variables, businessId });
  }

  /**
   * Test WhatsApp connection
   * Uses configured variable mappings to send test data matching template requirements
   */
  async testConnection(testPhone, templateType = 'default') {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.enabled) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    try {
      const templateId = this.getTemplateIdForTest(templateType);
      if (!templateId) {
        return {
          success: false,
          error: `Template not configured for type: ${templateType}. Map an approved Gupshup template in Admin → Notifications for this slot.`,
        };
      }

      // Get variable mapping for this template type
      const variableMapping = this.getTemplateVariableMapping(templateType);
      
      // Generate test variables based on the configured mapping
      const testVariables = {};
      
      if (Object.keys(variableMapping).length > 0) {
        // Sort variables to ensure body_1, body_2, etc. are in order
        const sortedVarNames = Object.keys(variableMapping).sort((a, b) => {
          // Extract numbers from body_X and button_X
          const aNum = parseInt(a.replace(/\D/g, '')) || 0;
          const bNum = parseInt(b.replace(/\D/g, '')) || 0;
          // Body variables come before button variables
          const aType = a.startsWith('body_') ? 0 : 1;
          const bType = b.startsWith('body_') ? 0 : 1;
          if (aType !== bType) return aType - bType;
          return aNum - bNum;
        });
        
        // Use configured mappings to generate test values
        sortedVarNames.forEach(varName => {
          const dataField = variableMapping[varName];
          
          // Generate test values based on data field type
          let testValue = '';
          if (dataField === 'clientName') {
            testValue = 'Test Client';
          } else if (dataField === 'businessName') {
            testValue = 'Test Business';
          } else if (dataField === 'businessCode') {
            testValue = 'TEST001';
          } else if (dataField === 'receiptNumber') {
            testValue = 'TEST-001';
          } else if (dataField === 'receiptLink') {
            const sampleReceipt = 'https://www.easemysalon.in/receipt/public/INV-000001/samplesharetoken0123456789abcdef0123456789ab';
            testValue = varName.startsWith('button_')
              ? this.extractReceiptPath(sampleReceipt)
              : sampleReceipt;
          } else if (dataField === 'feedbackLink') {
            const sampleFeedback =
              'https://www.easemysalon.in/feedback/6a24b1a8d7ca686a0bd9ed4c/samplefeedbacktoken0123456789abcdef0123456789ab?s=whatsapp';
            testValue = this.extractFeedbackPath(sampleFeedback);
          } else if (dataField === 'googleMapsUrl') {
            const sample = 'https://maps.app.goo.gl/rwY2PmLdcE4TNo8w9';
            const { processedBody, processedButton } = this.prepareGoogleMapsTemplateParts(sample);
            if (varName.startsWith('button_')) {
              testValue = processedButton;
            } else {
              testValue = processedBody;
            }
          } else if (dataField === 'serviceName') {
            testValue = 'Test Service';
          } else if (dataField === 'date') {
            testValue = new Date().toLocaleDateString('en-IN');
          } else if (dataField === 'time') {
            testValue = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          } else if (dataField === 'staffName') {
            testValue = 'Test Staff';
          } else if (dataField === 'businessPhone') {
            testValue = '+91 9876543210';
          } else if (dataField === 'cancellationReason') {
            testValue = 'Test cancellation';
          } else if (dataField === 'adminName') {
            testValue = 'Test Admin';
          } else if (dataField === 'loginUrl') {
            testValue = 'https://example.com/login';
          } else if (dataField === 'welcomeMessage') {
            testValue = 'Welcome to our service!';
          } else if (dataField === 'reminderHours') {
            testValue = '24 hours';
          } else if (dataField === 'planName') {
            testValue = 'Gold prepaid wallet';
          } else if (dataField === 'transactionType' || dataField === 'transactionTypeLabel') {
            testValue = 'Credit';
          } else if (dataField === 'amountFormatted') {
            testValue = '₹5000';
          } else if (dataField === 'balanceAfterFormatted') {
            testValue = '₹8330';
          } else if (dataField === 'description') {
            testValue = 'Wallet issued — Gold plan';
          } else if (dataField === 'daysLeft') {
            testValue = '7';
          } else if (dataField === 'expiryDateFormatted') {
            testValue = '25 Apr 2026';
          } else if (dataField === 'balanceFormatted') {
            testValue = '₹8330';
          } else {
            // Default test value for unknown fields
            testValue = `Test ${dataField}`;
          }
          
          testVariables[varName] = testValue;
        });
        
        logger.debug(`[WhatsApp Test] Template: ${templateId}, Type: ${templateType}`);
        logger.debug(`[WhatsApp Test] Variable Mapping:`, variableMapping);
        logger.debug(`[WhatsApp Test] Test Variables:`, testVariables);
        logger.debug(`[WhatsApp Test] Body variables count:`, Object.keys(testVariables).filter(k => k.startsWith('body_')).length);
        logger.debug(`[WhatsApp Test] Button variables count:`, Object.keys(testVariables).filter(k => k.startsWith('button_')).length);
      } else if (templateType === 'receiptWithFeedback') {
        Object.assign(testVariables, this.buildReceiptWithFeedbackTestVariables());
        logger.debug(`[WhatsApp Test] No variable mapping for ${templateType}, using receipt+feedback defaults`);
      } else if (templateType === 'receipt') {
        const sampleReceipt =
          'https://www.easemysalon.in/receipt/public/INV-000001/samplesharetoken0123456789abcdef0123456789ab';
        testVariables.body_1 = 'Test Client';
        testVariables.body_2 = 'Test Business';
        testVariables.button_1 = this.extractReceiptPath(sampleReceipt);
        logger.debug(`[WhatsApp Test] No variable mapping for ${templateType}, using receipt defaults`);
      } else {
        // Fallback: if no mapping configured, send minimal test with body_1
        testVariables.body_1 = 'Test Message from EaseMySalon';
        logger.debug(`[WhatsApp Test] No variable mapping found for ${templateType}, using default body_1`);
      }

      const result = await this.sendMessage({
        to: testPhone,
        templateId: templateId,
        variables: testVariables
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new WhatsAppService();
