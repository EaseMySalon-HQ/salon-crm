const axios = require('axios');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

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
        hasApiKey: !!whatsappConfig?.msg91ApiKey,
        hasTemplates: !!whatsappConfig?.templates
      });

      if (whatsappConfig && whatsappConfig.enabled && whatsappConfig.msg91ApiKey) {
        // Check if at least one template is configured
        const templates = whatsappConfig.templates || {};
        const hasTemplate = Object.values(templates).some(templateId => templateId && templateId.trim() !== '');
        
        if (hasTemplate) {
          this.config = whatsappConfig;
          this.enabled = true;
          this.initialized = true;
          logger.debug(`✅ WhatsApp service initialized with provider: ${whatsappConfig.provider}`);
          return;
        } else {
          logger.warn('⚠️  WhatsApp service enabled but no templates configured');
          this.enabled = false;
          this.initialized = true;
          return;
        }
      } else {
        logger.warn('⚠️  WhatsApp service not enabled or missing API key in admin settings');
        this.enabled = false;
        this.initialized = true;
      }
    } catch (error) {
      logger.warn('⚠️  Could not load WhatsApp config from admin settings, falling back to environment variables:', error.message);
    }

    // Fallback to environment variables
    if (process.env.MSG91_API_KEY) {
      this.config = {
        provider: 'msg91',
        msg91ApiKey: process.env.MSG91_API_KEY,
        msg91TemplateId: process.env.MSG91_TEMPLATE_ID || '',
        msg91SenderId: process.env.MSG91_SENDER_ID || '',
        receiptNotifications: true,
        appointmentNotifications: true,
        systemAlerts: false,
        quietHours: {
          enabled: false,
          start: '22:00',
          end: '08:00'
        }
      };
      this.enabled = true;
      this.initialized = true;
      logger.debug('✅ WhatsApp service initialized from environment variables');
    } else {
      logger.warn('⚠️  WhatsApp service not configured. No API key found.');
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
    
    // Validate length (should be 12 digits: 91 + 10 digits)
    if (cleaned.length !== 12) {
      return null;
    }
    
    return cleaned;
  }

  /**
   * Send WhatsApp message via MSG91
   */
  async sendMessage({ to, message, templateId, flowId, variables = {} }) {
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
      if (templateId || this.config.msg91TemplateId) {
        return await this.sendTemplateMessage({
          to: phoneNumber,
          templateId: templateId || this.config.msg91TemplateId,
          variables
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
   * Send template message via MSG91
   * Uses MSG91's bulk WhatsApp API format
   */
  async sendTemplateMessage({ to, templateId, variables }) {
    const apiKey = this.config.msg91ApiKey;
    const integratedNumber = this.config.msg91SenderId;
    const templateName = templateId || this.config.msg91TemplateId;
    const namespace = this.config.msg91Namespace || ''; // Optional namespace
    
    if (!apiKey) {
      return { success: false, error: 'MSG91 API key not configured' };
    }
    
    if (!integratedNumber) {
      return { success: false, error: 'MSG91 Sender ID (integrated number) not configured' };
    }
    
    if (!templateName) {
      return { success: false, error: 'Template name/ID not configured' };
    }

    const url = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';

    // Build components object with body_1, body_2, button_1, etc.
    // Variables can be passed as { body_1: "value1", body_2: "value2", button_1: "url" } or { 1: "value1", 2: "value2" }
    const components = {};
    
    // Check if variables already use body_X or button_X format
    const hasNamedFormat = Object.keys(variables).some(key => key.startsWith('body_') || key.startsWith('button_'));
    
    if (hasNamedFormat) {
      // Sort variables to ensure body_1, body_2, button_1 are in correct order
      const sortedKeys = Object.keys(variables).sort((a, b) => {
        // Extract numbers from body_X and button_X
        const aNum = parseInt(a.replace(/\D/g, '')) || 0;
        const bNum = parseInt(b.replace(/\D/g, '')) || 0;
        // Body variables come before button variables
        const aType = a.startsWith('body_') ? 0 : 1;
        const bType = b.startsWith('body_') ? 0 : 1;
        if (aType !== bType) return aType - bType;
        return aNum - bNum;
      });
      
      // Variables already in body_X or button_X format, use them directly
      sortedKeys.forEach(key => {
        if (key.startsWith('body_')) {
          components[key] = {
            type: 'text',
            value: String(variables[key] || '')
          };
        } else if (key.startsWith('button_')) {
          // Button variables - MSG91 format: { "subtype": "url", "type": "text", "value": "path_or_url" }
          const buttonValue = String(variables[key] || '');
          
          // CRITICAL: MSG91 template configuration shows button type is "Visit website"
          // Template URL: https://www.easemysalon.in/receipt/public/{{1}}
          // This means button_1 should contain just the path part (e.g., INV-000056/abc123)
          // But the button component MUST still be formatted as subtype "url" in the API payload
          // MSG91 will combine the template base URL + button value
          
          if (buttonValue.trim() !== '') {
            // Check if it's a full URL or just a path
            if (buttonValue.startsWith('http://') || buttonValue.startsWith('https://')) {
              // Full URL - use as is
              components[key] = {
                subtype: 'url',
                type: 'text',
                value: buttonValue
              };
              logger.debug(`📱 [MSG91] Button ${key} formatted as URL button with full URL: ${buttonValue.substring(0, 50)}...`);
            } else {
              // Path only (e.g., INV-000056/abc123) - template includes base URL
              // Still format as URL button type since template button type is "Visit website"
              components[key] = {
                subtype: 'url',
                type: 'text',
                value: buttonValue
              };
              logger.debug(`📱 [MSG91] Button ${key} formatted as URL button with path (template includes base URL): ${buttonValue}`);
            }
          } else {
            // Empty button value - skip it
            logger.warn(`⚠️ [MSG91] Button ${key} has empty value, skipping`);
          }
        }
      });
      
      // Log for debugging
      const bodyVars = Object.keys(components).filter(k => k.startsWith('body_'));
      const buttonVars = Object.keys(components).filter(k => k.startsWith('button_'));
      logger.debug(`[WhatsApp Send] Template: ${templateName}, Body vars: ${bodyVars.length} (${bodyVars.join(', ')}), Button vars: ${buttonVars.length} (${buttonVars.join(', ')})`);
    } else {
      // Variables in numeric format (1, 2, 3), convert to body_1, body_2, etc.
      const sortedKeys = Object.keys(variables).sort((a, b) => {
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
      });
      
      sortedKeys.forEach((key, index) => {
        components[`body_${index + 1}`] = {
          type: 'text',
          value: String(variables[key] || '')
        };
      });
    }

    // MSG91 bulk API payload structure
    const payload = {
      integrated_number: integratedNumber,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: 'en',
            policy: 'deterministic'
          },
          ...(namespace && { namespace: namespace }),
          to_and_components: [
            {
              to: [to], // Array of phone numbers
              components: components
            }
          ]
        }
      }
    };

    try {
      logger.debug('📱 [MSG91] Sending WhatsApp message:', {
        to,
        templateName,
        integratedNumber,
        hasApiKey: !!apiKey,
        variablesCount: Object.keys(variables).length
      });
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'authkey': apiKey // lowercase 'authkey' as per MSG91 API
        },
        timeout: 10000
      });

      logger.debug('📱 [MSG91] API Response Status:', response.status);
      logger.debug('📱 [MSG91] API Response Data:', JSON.stringify(response.data, null, 2));

      // MSG91 API can return 200 with error details in response.data
      // Check for actual success indicators in the response
      const responseData = response.data || {};
      
      // MSG91 returns different response formats:
      // 1. Success: { status: "success", hasError: false, data: "message", request_id: "..." }
      // 2. Error: { status: "error", hasError: true, errors: [...] }
      // 3. Some APIs return: { success: true/false, message: "..." }
      
      const hasError = responseData.hasError === true || 
                       responseData.status === 'error' ||
                       (responseData.errors && responseData.errors.length > 0);
      
      const isSuccess = response.status === 200 && !hasError && (
        responseData.success === true ||
        responseData.status === 'success' ||
        (responseData.data && typeof responseData.data === 'string' && responseData.data.includes('in process'))
      );

      if (isSuccess) {
        const requestId = responseData.request_id || 'N/A';
        logger.debug('✅ [MSG91] WhatsApp message accepted by MSG91');
        logger.debug('📱 [MSG91] Request ID:', requestId);
        logger.debug('📱 [MSG91] Note: Message is queued for delivery. Check MSG91 dashboard for delivery status.');
        
        // Log warning if message is just queued (not immediately delivered)
        if (responseData.data && responseData.data.includes('in process')) {
          logger.warn('⚠️ [MSG91] Message queued for delivery. Possible reasons:');
          logger.warn('   - Template may not be approved/active in MSG91');
          logger.warn('   - Phone number may not be registered/verified');
          logger.warn('   - Template variables may not match approved template');
          logger.warn('   - Check MSG91 dashboard for delivery status using request_id:', requestId);
        }
        
        return { 
          success: true, 
          data: responseData,
          requestId: requestId,
          queued: responseData.data && responseData.data.includes('in process')
        };
      } else {
        const errorMsg = responseData.message || 
                        responseData.error || 
                        (responseData.errors && responseData.errors.length > 0 ? JSON.stringify(responseData.errors) : null) ||
                        'Failed to send message';
        logger.error('❌ [MSG91] WhatsApp message failed:', errorMsg);
        logger.error('❌ [MSG91] Full response:', JSON.stringify(responseData, null, 2));
        return { success: false, error: errorMsg, responseData };
      }
    } catch (error) {
      if (error.response) {
        const errorMessage = error.response.data?.message || 
                            error.response.data?.error || 
                            error.message;
        logger.error('❌ [MSG91] API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: JSON.stringify(error.response.data, null, 2)
        });
        return { success: false, error: errorMessage, responseData: error.response.data };
      }
      logger.error('❌ [MSG91] Network/Request Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new WhatsApp template via MSG91
   * @param {Object} templateData - Template configuration
   * @returns {Promise<Object>} - Result with success status and template info
   */
  async createTemplate(templateData) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.enabled || !this.config.msg91ApiKey) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const apiKey = this.config.msg91ApiKey;
    const url = 'https://api.msg91.com/api/v5/whatsapp/client-panel-template/';

    // Build the payload according to MSG91 API format
    const payload = {
      integrated_number: templateData.integratedNumber || this.config.msg91SenderId,
      template_name: templateData.templateName,
      language: templateData.language || 'en',
      category: templateData.category || 'MARKETING',
      button_url: templateData.buttonUrl || 'false',
      components: templateData.components || []
    };

    try {
      logger.debug('📱 [MSG91] Creating template:', {
        templateName: payload.template_name,
        language: payload.language,
        category: payload.category,
        componentsCount: payload.components.length
      });
      logger.debug('📱 [MSG91] Components payload:', JSON.stringify(payload.components, null, 2));

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'authkey': apiKey
        },
        timeout: 30000 // 30 seconds for template creation
      });

      logger.debug('📱 [MSG91] Template creation response:', response.status, response.data);

      // MSG91 typically returns success status in response
      if (response.status === 200 || response.status === 201) {
        const responseData = response.data || {};
        
        // Check for errors in response
        if (responseData.hasError === true || responseData.status === 'error' || responseData.status === 'fail') {
          const errorMsg = responseData.message || 
                          responseData.data ||
                          (responseData.errors ? (typeof responseData.errors === 'string' ? responseData.errors : JSON.stringify(responseData.errors)) : null) ||
                          'Template creation failed';
          logger.error('❌ [MSG91] Template creation failed:', {
            hasError: responseData.hasError,
            status: responseData.status,
            message: responseData.message,
            data: responseData.data,
            errors: responseData.errors
          });
          return { success: false, error: errorMsg, responseData };
        }

        return {
          success: true,
          data: responseData,
          templateId: responseData.template_id || responseData.id || responseData.templateName,
          message: responseData.message || 'Template created successfully and submitted for approval'
        };
      } else {
        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
          responseData: response.data
        };
      }
    } catch (error) {
      if (error.response) {
        const errorMessage = error.response.data?.message || 
                            error.response.data?.error || 
                            error.message;
        logger.error('❌ [MSG91] Template creation failed:', {
          status: error.response.status,
          data: error.response.data
        });
        return { 
          success: false, 
          error: errorMessage, 
          responseData: error.response.data 
        };
      }
      logger.error('❌ [MSG91] Network error creating template:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get template ID for a specific notification type
   */
  getTemplateId(templateType) {
    const templates = this.config?.templates || {};
    // Use specific template if available, otherwise fall back to default or legacy
    return templates[templateType] || templates.default || this.config?.msg91TemplateId || '';
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

  /**
   * Send receipt via WhatsApp
   */
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

  async sendReceipt({ to, clientName, receiptNumber, receiptData, receiptLink }) {
    logger.debug('📱 [sendReceipt] Starting receipt send:', {
      to,
      clientName,
      receiptNumber,
      businessName: receiptData?.businessName,
      receiptLink,
      templateId: this.getTemplateId('receipt'),
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
    
    const data = {
      clientName: clientName || 'Customer',
      businessName: receiptData?.businessName || 'Business',
      receiptLink: processedReceiptLinkForBody // Use extracted path for body variables
    };
    
    logger.debug('📱 [sendReceipt] Data object:', data);
    
    const variables = this.mapDataToTemplateVariables('receipt', data);
    
    logger.debug('📱 [sendReceipt] Mapped variables:', variables);
    logger.debug('📱 [sendReceipt] Variable mapping config:', this.getTemplateVariableMapping('receipt'));
    
    // If no mapping configured, use default mapping
    if (Object.keys(variables).length === 0) {
      logger.debug('📱 [sendReceipt] No variable mapping found, using defaults');
      variables.body_1 = data.clientName;
      variables.body_2 = data.businessName;
      variables.body_3 = processedReceiptLinkForBody; // Use extracted path for body
      // CRITICAL: Use extracted path for button since template includes base URL
      // Template URL: https://www.easemysalon.in/receipt/public/{{1}}
      // button_1 value: INV-000056/abc123 (just the path part)
      variables.button_1 = processedReceiptLinkForButton;
    } else {
      // Check if button variables are mapped and add receiptLink
      // CRITICAL: Use full URL for button variables, extracted path for body variables
      const variableMapping = this.getTemplateVariableMapping('receipt');
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
        }
      });
    }

    logger.debug('📱 [sendReceipt] Final variables before send:', variables);
    logger.debug('📱 [sendReceipt] Template ID:', this.getTemplateId('receipt'));

    const result = await this.sendMessage({
      to,
      templateId: this.getTemplateId('receipt'),
      variables
    });
    
    logger.debug('📱 [sendReceipt] Send result:', result);
    
    return result;
  }

  /**
   * Send receipt cancellation via WhatsApp
   */
  async sendReceiptCancellation({ to, clientName, receiptNumber, receiptData, cancellationReason }) {
    const data = {
      clientName: clientName || 'Customer',
      receiptNumber: receiptNumber || '',
      businessName: receiptData?.businessName || 'Business',
      cancellationReason: cancellationReason || 'Cancelled'
    };
    
    const variables = this.mapDataToTemplateVariables('receiptCancellation', data);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.receiptNumber;
      variables.body_3 = data.businessName;
      variables.body_4 = data.cancellationReason;
    }

    return await this.sendMessage({
      to,
      templateId: this.getTemplateId('receiptCancellation'),
      variables
    });
  }

  /**
   * Send appointment scheduling via WhatsApp
   */
  async sendAppointmentScheduling({ to, clientName, appointmentData }) {
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || ''
    };
    
    const variables = this.mapDataToTemplateVariables('appointmentScheduling', data);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.businessName;
    }

    return await this.sendMessage({
      to,
      templateId: this.getTemplateId('appointmentScheduling'),
      variables
    });
  }

  /**
   * Send appointment confirmation via WhatsApp
   */
  async sendAppointmentConfirmation({ to, clientName, appointmentData }) {
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      staffName: appointmentData?.staffName || 'Not assigned',
      businessName: appointmentData?.businessName || '',
      businessPhone: appointmentData?.businessPhone || ''
    };
    
    const variables = this.mapDataToTemplateVariables('appointmentConfirmation', data);
    
    if (Object.keys(variables).length === 0) {
      variables.body_1 = data.clientName;
      variables.body_2 = data.serviceName;
      variables.body_3 = data.date;
      variables.body_4 = data.time;
      variables.body_5 = data.staffName;
      variables.body_6 = data.businessName;
      variables.body_7 = data.businessPhone;
    }

    return await this.sendMessage({
      to,
      templateId: this.getTemplateId('appointmentConfirmation'),
      variables
    });
  }

  /**
   * Send appointment cancellation via WhatsApp
   */
  async sendAppointmentCancellation({ to, clientName, appointmentData, cancellationReason }) {
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || '',
      cancellationReason: cancellationReason || 'Cancelled'
    };
    
    const variables = this.mapDataToTemplateVariables('appointmentCancellation', data);
    
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
      templateId: this.getTemplateId('appointmentCancellation'),
      variables
    });
  }

  /**
   * Send appointment reminder via WhatsApp
   */
  async sendAppointmentReminder({ to, clientName, appointmentData, reminderHours }) {
    const data = {
      clientName: clientName || 'Customer',
      serviceName: appointmentData?.serviceName || 'Service',
      date: appointmentData?.date || '',
      time: appointmentData?.time || '',
      businessName: appointmentData?.businessName || '',
      businessPhone: appointmentData?.businessPhone || '',
      reminderHours: `${reminderHours || 24} hours`
    };
    
    const variables = this.mapDataToTemplateVariables('appointmentReminder', data);
    
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
      templateId: this.getTemplateId('appointmentReminder'),
      variables
    });
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
      // Get template ID for the specified type or use default
      const templateId = this.getTemplateId(templateType);
      if (!templateId) {
        return { success: false, error: `Template not configured for type: ${templateType}. Please configure at least a default template.` };
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
            testValue = 'https://example.com/receipt/test';
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
      } else {
        // Fallback: if no mapping configured, send minimal test with body_1
        // This handles templates that haven't been configured with JavaScript code yet
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
