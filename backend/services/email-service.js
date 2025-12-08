const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const emailTemplates = require('../utils/email-templates');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');

class EmailService {
  constructor() {
    this.provider = null;
    this.transporter = null;
    this.resend = null;
    this.config = null;
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize email service from admin settings or environment variables
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Try to load from admin settings
      const mainConnection = await databaseManager.getMainConnection();
      const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
      const settings = await AdminSettings.getSettings();
      const emailConfig = settings.notifications?.email;

      if (emailConfig && emailConfig.enabled) {
        this.config = emailConfig;
        this.provider = emailConfig.provider || 'resend';
        this.enabled = true;
        await this.setupProvider();
        this.initialized = true;
        console.log(`✅ Email service initialized with provider: ${this.provider}`);
        return;
      }
    } catch (error) {
      console.warn('⚠️  Could not load email config from admin settings, falling back to environment variables:', error.message);
    }

    // Fallback to environment variables
    if (process.env.EMAIL_API_KEY) {
      this.config = {
        provider: 'resend',
        resendApiKey: process.env.EMAIL_API_KEY,
        fromEmail: process.env.EMAIL_FROM || 'noreply@easemysalon.in',
        fromName: process.env.EMAIL_FROM_NAME || 'Ease My Salon',
        replyTo: process.env.EMAIL_REPLY_TO || 'support@easemysalon.in'
      };
      this.provider = 'resend';
      this.enabled = true;
      await this.setupProvider();
      this.initialized = true;
      console.log('✅ Email service initialized from environment variables');
    } else {
      console.warn('⚠️  Email service not configured. No API key found.');
      this.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Setup email provider based on configuration
   */
  async setupProvider() {
    if (!this.config || !this.enabled) {
      return;
    }

    try {
      switch (this.provider) {
        case 'resend':
          await this.setupResend();
          break;
        case 'smtp':
          await this.setupSMTP();
          break;
        case 'sendgrid':
          await this.setupSendGrid();
          break;
        case 'ses':
          await this.setupAWSSES();
          break;
        case 'mailgun':
          await this.setupMailgun();
          break;
        default:
          console.warn(`⚠️  Unknown email provider: ${this.provider}`);
          this.enabled = false;
      }
    } catch (error) {
      console.error(`❌ Error setting up email provider ${this.provider}:`, error);
      this.enabled = false;
    }
  }

  /**
   * Setup Resend provider
   */
  async setupResend() {
    const apiKey = this.config.resendApiKey || process.env.EMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('Resend API key not found');
    }
    this.resend = new Resend(apiKey);
  }

  /**
   * Setup SMTP provider
   */
  async setupSMTP() {
    const config = {
      host: this.config.smtpHost || 'smtp.gmail.com',
      port: this.config.smtpPort || 587,
      secure: this.config.smtpSecure || false,
      auth: {
        user: this.config.smtpUser || '',
        pass: this.config.smtpPassword || ''
      }
    };

    if (!config.auth.user || !config.auth.pass) {
      throw new Error('SMTP username and password are required');
    }

    this.transporter = nodemailer.createTransport(config);
    
    // Verify connection
    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified');
    } catch (error) {
      console.error('❌ SMTP verification failed:', error);
      throw error;
    }
  }

  /**
   * Setup SendGrid provider
   */
  async setupSendGrid() {
    const sgMail = require('@sendgrid/mail');
    const apiKey = this.config.sendgridApiKey;
    if (!apiKey) {
      throw new Error('SendGrid API key not found');
    }
    sgMail.setApiKey(apiKey);
    this.sendgrid = sgMail;
  }

  /**
   * Setup AWS SES provider
   */
  async setupAWSSES() {
    const AWS = require('aws-sdk');
    const config = {
      accessKeyId: this.config.sesAccessKeyId,
      secretAccessKey: this.config.sesSecretAccessKey,
      region: this.config.sesRegion || 'us-east-1'
    };

    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('AWS SES credentials not found');
    }

    this.ses = new AWS.SES(config);
  }

  /**
   * Setup Mailgun provider
   */
  async setupMailgun() {
    const formData = require('form-data');
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(formData);
    
    const apiKey = this.config.mailgunApiKey;
    const domain = this.config.mailgunDomain;

    if (!apiKey || !domain) {
      throw new Error('Mailgun API key and domain are required');
    }

    this.mailgun = mailgun.client({
      username: 'api',
      key: apiKey
    });
    this.mailgunDomain = domain;
  }

  /**
   * Reload configuration from admin settings
   */
  async reloadConfiguration() {
    this.initialized = false;
    this.provider = null;
    this.transporter = null;
    this.resend = null;
    this.sendgrid = null;
    this.ses = null;
    this.mailgun = null;
    await this.initialize();
  }

  /**
   * Get from email and name
   */
  getFromAddress() {
    return {
      email: this.config?.fromEmail || process.env.EMAIL_FROM || 'noreply@easemysalon.in',
      name: this.config?.fromName || process.env.EMAIL_FROM_NAME || 'Ease My Salon'
    };
  }

  /**
   * Send email using the configured provider
   */
  async sendEmail({ to, subject, html, text, attachments = [] }) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.enabled) {
      console.warn('Email service not enabled');
      return { success: false, error: 'Email service not configured' };
    }

    const from = this.getFromAddress();

    try {
      switch (this.provider) {
        case 'resend':
          return await this.sendViaResend({ to, from, subject, html, text, attachments });
        case 'smtp':
          return await this.sendViaSMTP({ to, from, subject, html, text, attachments });
        case 'sendgrid':
          return await this.sendViaSendGrid({ to, from, subject, html, text, attachments });
        case 'ses':
          return await this.sendViaSES({ to, from, subject, html, text, attachments });
        case 'mailgun':
          return await this.sendViaMailgun({ to, from, subject, html, text, attachments });
        default:
          return { success: false, error: 'Email provider not configured' };
      }
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email via Resend
   */
  async sendViaResend({ to, from, subject, html, text, attachments }) {
    if (!this.resend) {
      throw new Error('Resend not initialized');
    }

    const { data, error } = await this.resend.emails.send({
      from: `${from.name} <${from.email}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      attachments: attachments.length > 0 ? attachments.map(att => {
        // att.content is now a Buffer from report exporter
        // Resend API expects base64 string for attachments
        let content;
        if (Buffer.isBuffer(att.content)) {
          // Convert Buffer to base64 string for Resend
          content = att.content.toString('base64');
        } else if (typeof att.content === 'string') {
          // If it's already a base64 string (backward compatibility), use it directly
          content = att.content;
        } else {
          // Fallback: try to create buffer and encode
          content = Buffer.from(att.content).toString('base64');
        }
        
        return {
          filename: att.filename,
          content: content
        };
      }) : undefined,
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  }

  /**
   * Send email via SMTP
   */
  async sendViaSMTP({ to, from, subject, html, text, attachments }) {
    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    const mailOptions = {
      from: `"${from.name}" <${from.email}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text,
      attachments: attachments.map(att => {
        // att.content is now a Buffer from report exporter
        // SMTP (nodemailer) expects Buffer or stream
        let content;
        if (Buffer.isBuffer(att.content)) {
          content = att.content;
        } else if (typeof att.content === 'string') {
          // Backward compatibility: if it's a base64 string, decode it
          content = Buffer.from(att.content, 'base64');
        } else {
          content = Buffer.from(att.content);
        }
        return {
          filename: att.filename,
          content: content
        };
      })
    };

    const info = await this.transporter.sendMail(mailOptions);
    return { success: true, data: { messageId: info.messageId } };
  }

  /**
   * Send email via SendGrid
   */
  async sendViaSendGrid({ to, from, subject, html, text, attachments }) {
    if (!this.sendgrid) {
      throw new Error('SendGrid not initialized');
    }

    const msg = {
      to: Array.isArray(to) ? to : [to],
      from: `${from.name} <${from.email}>`,
      subject,
      html,
      text,
      attachments: attachments.map(att => {
        // att.content is now a Buffer from report exporter
        // SendGrid expects base64 string
        let content;
        if (Buffer.isBuffer(att.content)) {
          content = att.content.toString('base64');
        } else if (typeof att.content === 'string') {
          // Backward compatibility: if it's already base64, use it
          content = att.content;
        } else {
          content = Buffer.from(att.content).toString('base64');
        }
        return {
          content: content,
          filename: att.filename,
          type: 'application/octet-stream',
          disposition: 'attachment'
        };
      })
    };

    const [response] = await this.sendgrid.send(msg);
    return { success: true, data: { messageId: response.headers['x-message-id'] } };
  }

  /**
   * Send email via AWS SES
   */
  async sendViaSES({ to, from, subject, html, text, attachments }) {
    if (!this.ses) {
      throw new Error('AWS SES not initialized');
    }

    const params = {
      Source: `"${from.name}" <${from.email}>`,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: html },
          Text: { Data: text }
        }
      }
    };

    if (attachments.length > 0) {
      // SES requires attachments in a specific format
      const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
      // For simplicity, we'll use the older SES API for now
      // Full attachment support would require using SES Raw Email
    }

    const result = await this.ses.sendEmail(params).promise();
    return { success: true, data: { messageId: result.MessageId } };
  }

  /**
   * Send email via Mailgun
   */
  async sendViaMailgun({ to, from, subject, html, text, attachments }) {
    if (!this.mailgun || !this.mailgunDomain) {
      throw new Error('Mailgun not initialized');
    }

    const messageData = {
      from: `"${from.name}" <${from.email}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text
    };

    if (attachments.length > 0) {
      messageData.attachment = attachments.map(att => {
        // att.content is now a Buffer from report exporter
        // Mailgun expects Buffer
        let data;
        if (Buffer.isBuffer(att.content)) {
          data = att.content;
        } else if (typeof att.content === 'string') {
          // Backward compatibility: if it's a base64 string, decode it
          data = Buffer.from(att.content, 'base64');
        } else {
          data = Buffer.from(att.content);
        }
        return {
          filename: att.filename,
          data: data
        };
      });
    }

    const result = await this.mailgun.messages.create(this.mailgunDomain, messageData);
    return { success: true, data: { messageId: result.id } };
  }

  /**
   * Send daily summary email
   */
  async sendDailySummary({ to, businessName, date, summaryData }) {
    const { html, text } = emailTemplates.dailySummary({
      businessName,
      date,
      ...summaryData,
    });

    return this.sendEmail({
      to,
      subject: `Daily Business Summary - ${date}`,
      html,
      text,
    });
  }

  /**
   * Send weekly summary email
   */
  async sendWeeklySummary({ to, businessName, weekStart, weekEnd, summaryData }) {
    const { html, text } = emailTemplates.weeklySummary({
      businessName,
      weekStart,
      weekEnd,
      ...summaryData,
    });

    return this.sendEmail({
      to,
      subject: `Weekly Business Summary - ${weekStart} to ${weekEnd}`,
      html,
      text,
    });
  }

  /**
   * Get custom template from AdminSettings or use default
   */
  async getCustomTemplate(templateName, defaultTemplate, data) {
    try {
      const mainConnection = await databaseManager.getMainConnection();
      const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
      const settings = await AdminSettings.getSettings();
      const customTemplate = settings.notifications?.templates?.[templateName];

      if (customTemplate && customTemplate.enabled) {
        // Use custom template with placeholder replacement
        let subject = customTemplate.subject || '';
        let body = customTemplate.body || '';

        // Replace placeholders in subject and body
        Object.keys(data).forEach(key => {
          const value = data[key];
          const placeholder = new RegExp(`\\{${key}\\}`, 'g');
          const stringValue = value !== null && value !== undefined ? String(value) : '';
          subject = subject.replace(placeholder, stringValue);
          body = body.replace(placeholder, stringValue);
        });

        // Convert plain text body to HTML (simple conversion)
        const html = body
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        return {
          subject,
          html,
          text: body
        };
      }
    } catch (error) {
      console.warn(`Could not load custom template ${templateName}, using default:`, error.message);
    }

    // Fall back to default template
    const defaultResult = defaultTemplate(data);
    return {
      subject: defaultResult.subject || '',
      html: defaultResult.html,
      text: defaultResult.text
    };
  }

  /**
   * Send receipt email to client
   */
  async sendReceipt({ to, clientName, receiptNumber, receiptData, pdfBuffer }) {
    // Format items for template replacement
    const itemsText = receiptData.items?.map(item => 
      `${item.name || 'Item'} - ₹${item.total?.toFixed(2) || item.price?.toFixed(2) || '0.00'}`
    ).join('\n') || '';

    // Prepare data for template
    const templateData = {
      clientName,
      receiptNumber,
      businessName: receiptData.businessName || '',
      date: receiptData.date || '',
      items: itemsText,
      subtotal: (receiptData.subtotal || 0).toFixed(2),
      tax: (receiptData.tax || 0).toFixed(2),
      discount: (receiptData.discount || 0).toFixed(2),
      total: (receiptData.total || 0).toFixed(2),
      paymentMethod: receiptData.paymentMethod || 'N/A'
    };

    // Get template (custom or default)
    const defaultTemplateResult = emailTemplates.receipt({
      clientName,
      receiptNumber,
      businessName: receiptData.businessName,
      date: receiptData.date,
      items: receiptData.items || [],
      subtotal: receiptData.subtotal || 0,
      tax: receiptData.tax || 0,
      discount: receiptData.discount || 0,
      total: receiptData.total || 0,
      paymentMethod: receiptData.paymentMethod || 'N/A'
    });

    const template = await this.getCustomTemplate(
      'receiptNotification',
      () => ({ ...defaultTemplateResult, subject: `Receipt ${receiptNumber} - ${receiptData.businessName}` }),
      templateData
    );

    const attachments = pdfBuffer ? [{
      filename: `receipt-${receiptNumber}.pdf`,
      content: pdfBuffer,
    }] : [];

    return this.sendEmail({
      to,
      subject: template.subject || `Receipt ${receiptNumber} - ${receiptData.businessName}`,
      html: template.html,
      text: template.text,
      attachments,
    });
  }

  /**
   * Send appointment confirmation to client
   */
  async sendAppointmentConfirmation({ to, clientName, appointmentData }) {
    // Prepare data for template
    const templateData = {
      clientName,
      serviceName: appointmentData.serviceName || 'Service',
      date: appointmentData.date || '',
      time: appointmentData.time || '',
      staffName: appointmentData.staffName || 'Not assigned',
      businessName: appointmentData.businessName || '',
      businessPhone: appointmentData.businessPhone || '',
      notes: appointmentData.notes || ''
    };

    // Get template (custom or default)
    const defaultTemplateResult = emailTemplates.appointmentConfirmation({
      clientName,
      serviceName: appointmentData.serviceName,
      date: appointmentData.date,
      time: appointmentData.time,
      staffName: appointmentData.staffName,
      businessName: appointmentData.businessName,
      businessPhone: appointmentData.businessPhone,
      notes: appointmentData.notes
    });

    const template = await this.getCustomTemplate(
      'appointmentNotification',
      () => ({ ...defaultTemplateResult, subject: `Appointment Confirmation - ${appointmentData.date}` }),
      templateData
    );

    return this.sendEmail({
      to,
      subject: template.subject || `Appointment Confirmation - ${appointmentData.date}`,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send appointment reminder to client
   */
  async sendAppointmentReminder({ to, clientName, appointmentData }) {
    const { html, text } = emailTemplates.appointmentReminder({
      clientName,
      ...appointmentData,
    });

    return this.sendEmail({
      to,
      subject: `Appointment Reminder - ${appointmentData.date}`,
      html,
      text,
    });
  }

  /**
   * Send appointment cancellation notification
   */
  async sendAppointmentCancellation({ to, clientName, appointmentData }) {
    const { html, text } = emailTemplates.appointmentCancellation({
      clientName,
      ...appointmentData,
    });

    return this.sendEmail({
      to,
      subject: `Appointment Cancelled - ${appointmentData.date}`,
      html,
      text,
    });
  }

  /**
   * Send export ready notification
   */
  async sendExportReady({ to, exportType, downloadUrl, businessName, attachments = [] }) {
    const { html, text } = emailTemplates.exportReady({
      exportType,
      downloadUrl,
      businessName,
      hasAttachment: attachments.length > 0,
    });

    return this.sendEmail({
      to,
      subject: `Your ${exportType} Export is Ready`,
      html,
      text,
      attachments,
    });
  }

  /**
   * Send system alert
   */
  async sendSystemAlert({ to, alertType, message, businessName }) {
    const { html, text } = emailTemplates.systemAlert({
      alertType,
      message,
      businessName,
    });

    return this.sendEmail({
      to,
      subject: `System Alert - ${alertType}`,
      html,
      text,
    });
  }

  /**
   * Send low inventory alert
   */
  async sendLowInventoryAlert({ to, products, businessName }) {
    const { html, text } = emailTemplates.lowInventory({
      products,
      businessName,
    });

    return this.sendEmail({
      to,
      subject: 'Low Inventory Alert',
      html,
      text,
    });
  }

  /**
   * Send appointment notification to staff/admin
   */
  async sendAppointmentNotification({ to, appointmentCount, businessName, appointmentDetails }) {
    const { html, text } = emailTemplates.appointmentNotification({
      appointmentCount,
      businessName,
      date: appointmentDetails?.date,
      time: appointmentDetails?.time,
      clientName: appointmentDetails?.clientName,
      serviceName: appointmentDetails?.serviceName,
    });

    return this.sendEmail({
      to,
      subject: `🎉 New Appointment${appointmentCount > 1 ? 's' : ''} Created!`,
      html,
      text,
    });
  }

  /**
   * Send appointment cancellation notification to staff/admin
   */
  async sendAppointmentCancellationNotification({ to, appointmentCount, businessName, appointmentDetails }) {
    const { html, text } = emailTemplates.appointmentCancellationNotification({
      appointmentCount,
      businessName,
      appointmentDetails: appointmentDetails
    });

    return this.sendEmail({
      to,
      subject: `⚠️ Appointment${appointmentCount > 1 ? 's' : ''} Cancelled`,
      html,
      text,
    });
  }

  /**
   * Test email connection
   */
  async testConnection(testEmail) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.enabled) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const result = await this.sendEmail({
        to: testEmail,
        subject: 'Test Email from Ease My Salon',
        html: '<p>This is a test email to verify email service configuration.</p>',
        text: 'This is a test email to verify email service configuration.',
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
