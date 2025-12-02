/**
 * Email Templates
 * Generates HTML and plain text email templates
 */

function dailySummary({ businessName, date, totalSales, totalRevenue, appointmentCount, newClients, topServices, topProducts }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .stat-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; font-size: 14px; margin-top: 5px; }
        .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px 0; color: #333; }
        .list-item { padding: 10px; background: white; margin: 5px 0; border-radius: 5px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Daily Business Summary</h1>
          <p>${date}</p>
        </div>
        <div class="content">
          <h2>Hello ${businessName},</h2>
          <p>Here's your daily business summary:</p>
          
          <div class="stat-box">
            <div class="stat-value">₹${totalRevenue?.toLocaleString() || '0'}</div>
            <div class="stat-label">Total Revenue</div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="stat-box">
              <div class="stat-value">${totalSales || 0}</div>
              <div class="stat-label">Total Sales</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${appointmentCount || 0}</div>
              <div class="stat-label">Appointments</div>
            </div>
          </div>
          
          <div class="stat-box">
            <div class="stat-value">${newClients || 0}</div>
            <div class="stat-label">New Clients</div>
          </div>
          
          ${topServices && topServices.length > 0 ? `
            <div class="section-title">Top Services Today</div>
            ${topServices.map(service => `
              <div class="list-item">
                <strong>${service.name}</strong> - ${service.count} bookings
              </div>
            `).join('')}
          ` : ''}
          
          ${topProducts && topProducts.length > 0 ? `
            <div class="section-title">Top Products Today</div>
            ${topProducts.map(product => `
              <div class="list-item">
                <strong>${product.name}</strong> - ${product.quantity} sold
              </div>
            `).join('')}
          ` : ''}
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Daily Business Summary - ${date}

Hello ${businessName},

Here's your daily business summary:

Total Revenue: ₹${totalRevenue?.toLocaleString() || '0'}
Total Sales: ${totalSales || 0}
Appointments: ${appointmentCount || 0}
New Clients: ${newClients || 0}

${topServices && topServices.length > 0 ? `Top Services:\n${topServices.map(s => `- ${s.name}: ${s.count} bookings`).join('\n')}\n` : ''}
${topProducts && topProducts.length > 0 ? `Top Products:\n${topProducts.map(p => `- ${p.name}: ${p.quantity} sold`).join('\n')}\n` : ''}

This is an automated email from Ease My Salon CRM
  `;

  return { html, text };
}

function weeklySummary({ businessName, weekStart, weekEnd, totalRevenue, totalSales, appointmentCount, newClients, revenueGrowth, topServices, topProducts }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .stat-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; font-size: 14px; margin-top: 5px; }
        .growth { color: #10b981; font-weight: bold; }
        .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px 0; color: #333; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📈 Weekly Business Summary</h1>
          <p>${weekStart} to ${weekEnd}</p>
        </div>
        <div class="content">
          <h2>Hello ${businessName},</h2>
          <p>Here's your weekly business summary:</p>
          
          <div class="stat-box">
            <div class="stat-value">₹${totalRevenue?.toLocaleString() || '0'}</div>
            <div class="stat-label">Total Revenue This Week</div>
            ${revenueGrowth ? `<div class="growth">${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}% vs last week</div>` : ''}
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="stat-box">
              <div class="stat-value">${totalSales || 0}</div>
              <div class="stat-label">Total Sales</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${appointmentCount || 0}</div>
              <div class="stat-label">Appointments</div>
            </div>
          </div>
          
          <div class="stat-box">
            <div class="stat-value">${newClients || 0}</div>
            <div class="stat-label">New Clients This Week</div>
          </div>
          
          ${topServices && topServices.length > 0 ? `
            <div class="section-title">Top Services This Week</div>
            ${topServices.map(service => `
              <div style="padding: 10px; background: white; margin: 5px 0; border-radius: 5px;">
                <strong>${service.name}</strong> - ${service.count} bookings
              </div>
            `).join('')}
          ` : ''}
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Weekly Business Summary - ${weekStart} to ${weekEnd}

Hello ${businessName},

Here's your weekly business summary:

Total Revenue: ₹${totalRevenue?.toLocaleString() || '0'}
${revenueGrowth ? `Growth: ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}% vs last week\n` : ''}
Total Sales: ${totalSales || 0}
Appointments: ${appointmentCount || 0}
New Clients: ${newClients || 0}

${topServices && topServices.length > 0 ? `Top Services:\n${topServices.map(s => `- ${s.name}: ${s.count} bookings`).join('\n')}\n` : ''}

This is an automated email from Ease My Salon CRM
  `;

  return { html, text };
}

function receipt({ clientName, receiptNumber, businessName, date, items, subtotal, tax, discount, total, paymentMethod }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .receipt-info { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .item { padding: 10px; border-bottom: 1px solid #eee; }
        .total { font-size: 20px; font-weight: bold; color: #667eea; margin-top: 15px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🧾 Receipt ${receiptNumber}</h1>
        </div>
        <div class="content">
          <p>Dear ${clientName},</p>
          <p>Thank you for your visit! Here's your receipt:</p>
          
          <div class="receipt-info">
            <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Business:</strong> ${businessName}</p>
          </div>
          
          <div class="receipt-info">
            <h3>Items:</h3>
            ${items.map(item => `
              <div class="item">
                <strong>${item.name}</strong> - ₹${item.total?.toFixed(2) || item.price?.toFixed(2)}
              </div>
            `).join('')}
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #667eea;">
              <p>Subtotal: ₹${subtotal?.toFixed(2) || '0.00'}</p>
              ${tax ? `<p>Tax: ₹${tax.toFixed(2)}</p>` : ''}
              ${discount ? `<p>Discount: -₹${discount.toFixed(2)}</p>` : ''}
              <p class="total">Total: ₹${total?.toFixed(2) || '0.00'}</p>
              <p>Payment Method: ${paymentMethod || 'N/A'}</p>
            </div>
          </div>
          
          <p>Please find the PDF receipt attached to this email.</p>
          
          <div class="footer">
            <p>Thank you for choosing ${businessName}!</p>
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Receipt ${receiptNumber}

Dear ${clientName},

Thank you for your visit! Here's your receipt:

Receipt Number: ${receiptNumber}
Date: ${date}
Business: ${businessName}

Items:
${items.map(item => `- ${item.name}: ₹${item.total?.toFixed(2) || item.price?.toFixed(2)}`).join('\n')}

Subtotal: ₹${subtotal?.toFixed(2) || '0.00'}
${tax ? `Tax: ₹${tax.toFixed(2)}\n` : ''}
${discount ? `Discount: -₹${discount.toFixed(2)}\n` : ''}
Total: ₹${total?.toFixed(2) || '0.00'}
Payment Method: ${paymentMethod || 'N/A'}

Please find the PDF receipt attached to this email.

Thank you for choosing ${businessName}!
  `;

  return { html, text };
}

function appointmentConfirmation({ clientName, serviceName, date, time, staffName, businessName, businessPhone, notes }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Appointment Confirmed</h1>
        </div>
        <div class="content">
          <p>Dear ${clientName},</p>
          <p>Your appointment has been confirmed!</p>
          
          <div class="info-box">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
            ${staffName ? `<p><strong>Staff:</strong> ${staffName}</p>` : ''}
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
          </div>
          
          <div class="info-box">
            <p><strong>Business:</strong> ${businessName}</p>
            ${businessPhone ? `<p><strong>Phone:</strong> ${businessPhone}</p>` : ''}
          </div>
          
          <p>We look forward to seeing you!</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Appointment Confirmed

Dear ${clientName},

Your appointment has been confirmed!

Appointment Details:
Service: ${serviceName}
Date: ${date}
Time: ${time}
${staffName ? `Staff: ${staffName}\n` : ''}
${notes ? `Notes: ${notes}\n` : ''}

Business: ${businessName}
${businessPhone ? `Phone: ${businessPhone}\n` : ''}

We look forward to seeing you!
  `;

  return { html, text };
}

function appointmentReminder({ clientName, serviceName, date, time, staffName, businessName, businessPhone }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Appointment Reminder</h1>
        </div>
        <div class="content">
          <p>Dear ${clientName},</p>
          <p>This is a reminder about your upcoming appointment:</p>
          
          <div class="info-box">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
            ${staffName ? `<p><strong>Staff:</strong> ${staffName}</p>` : ''}
          </div>
          
          <div class="info-box">
            <p><strong>Business:</strong> ${businessName}</p>
            ${businessPhone ? `<p><strong>Phone:</strong> ${businessPhone}</p>` : ''}
          </div>
          
          <p>We look forward to seeing you!</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Appointment Reminder

Dear ${clientName},

This is a reminder about your upcoming appointment:

Service: ${serviceName}
Date: ${date}
Time: ${time}
${staffName ? `Staff: ${staffName}\n` : ''}

Business: ${businessName}
${businessPhone ? `Phone: ${businessPhone}\n` : ''}

We look forward to seeing you!
  `;

  return { html, text };
}

function appointmentCancellation({ clientName, serviceName, date, time, businessName, businessPhone }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>❌ Appointment Cancelled</h1>
        </div>
        <div class="content">
          <p>Dear ${clientName},</p>
          <p>Your appointment has been cancelled:</p>
          
          <div class="info-box">
            <h3>Cancelled Appointment:</h3>
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
          
          <p>If you would like to reschedule, please contact us.</p>
          
          <div class="info-box">
            <p><strong>Business:</strong> ${businessName}</p>
            ${businessPhone ? `<p><strong>Phone:</strong> ${businessPhone}</p>` : ''}
          </div>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Appointment Cancelled

Dear ${clientName},

Your appointment has been cancelled:

Service: ${serviceName}
Date: ${date}
Time: ${time}

If you would like to reschedule, please contact us.

Business: ${businessName}
${businessPhone ? `Phone: ${businessPhone}\n` : ''}
  `;

  return { html, text };
}

function exportReady({ exportType, downloadUrl, businessName }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📥 Export Ready</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>Your ${exportType} export is ready for download.</p>
          
          <div style="text-align: center;">
            <a href="${downloadUrl}" class="button">Download ${exportType}</a>
          </div>
          
          <p><strong>Note:</strong> This link will expire in 7 days.</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Export Ready

Hello,

Your ${exportType} export is ready for download.

Download Link: ${downloadUrl}

Note: This link will expire in 7 days.
  `;

  return { html, text };
}

function systemAlert({ alertType, message, businessName }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ System Alert</h1>
        </div>
        <div class="content">
          <p>Hello ${businessName},</p>
          
          <div class="alert-box">
            <h3>Alert Type: ${alertType}</h3>
            <p>${message}</p>
          </div>
          
          <p>Please check your admin panel for more details.</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
System Alert

Hello ${businessName},

Alert Type: ${alertType}
Message: ${message}

Please check your admin panel for more details.
  `;

  return { html, text };
}

function lowInventory({ products, businessName }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .product-item { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #f59e0b; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📦 Low Inventory Alert</h1>
        </div>
        <div class="content">
          <p>Hello ${businessName},</p>
          <p>The following products are running low on stock:</p>
          
          ${products.map(product => `
            <div class="product-item">
              <strong>${product.name}</strong><br>
              Current Stock: ${product.stock} ${product.unit || 'units'}<br>
              ${product.minStock ? `Minimum Required: ${product.minStock} ${product.unit || 'units'}` : ''}
            </div>
          `).join('')}
          
          <p>Please consider restocking these items soon.</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Low Inventory Alert

Hello ${businessName},

The following products are running low on stock:

${products.map(p => `- ${p.name}: ${p.stock} ${p.unit || 'units'} remaining${p.minStock ? ` (min: ${p.minStock})` : ''}`).join('\n')}

Please consider restocking these items soon.
  `;

  return { html, text };
}

function appointmentNotification({ appointmentCount, businessName, date, time, clientName, serviceName }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .appointment-details { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-weight: 600; color: #6b7280; }
        .detail-value { color: #111827; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
        .emoji { font-size: 32px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="emoji">🎉</div>
          <h1>Woah, New Appointment Created!</h1>
        </div>
        <div class="content">
          <p>Hello ${businessName},</p>
          
          <div class="success-box">
            <h2 style="margin: 0 0 10px 0; color: #065f46;">${appointmentCount} new appointment${appointmentCount > 1 ? 's' : ''} ${appointmentCount > 1 ? 'have' : 'has'} been created!</h2>
            <p style="margin: 0; color: #047857;">Great news! Your business is growing! 🌟</p>
          </div>
          
          ${clientName && serviceName ? `
          <div class="appointment-details">
            <h3 style="margin-top: 0; color: #111827;">Appointment Details:</h3>
            ${clientName ? `<div class="detail-row"><span class="detail-label">Client:</span><span class="detail-value">${clientName}</span></div>` : ''}
            ${serviceName ? `<div class="detail-row"><span class="detail-label">Service:</span><span class="detail-value">${serviceName}</span></div>` : ''}
            ${date ? `<div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${date}</span></div>` : ''}
            ${time ? `<div class="detail-row"><span class="detail-label">Time:</span><span class="detail-value">${time}</span></div>` : ''}
          </div>
          ` : ''}
          
          <p>Please check your admin panel for more details.</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Woah, New Appointment Created!

Hello ${businessName},

${appointmentCount} new appointment${appointmentCount > 1 ? 's' : ''} ${appointmentCount > 1 ? 'have' : 'has'} been created!

${clientName && serviceName ? `
Appointment Details:
${clientName ? `Client: ${clientName}` : ''}
${serviceName ? `Service: ${serviceName}` : ''}
${date ? `Date: ${date}` : ''}
${time ? `Time: ${time}` : ''}
` : ''}

Please check your admin panel for more details.

This is an automated email from Ease My Salon CRM
  `;

  return { html, text };
}

function appointmentCancellationNotification({ appointmentCount, businessName, appointmentDetails }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .appointment-details { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-weight: 600; color: #6b7280; }
        .detail-value { color: #111827; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
        .emoji { font-size: 32px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="emoji">⚠️</div>
          <h1>Appointment Cancelled</h1>
        </div>
        <div class="content">
          <p>Hello ${businessName},</p>
          
          <div class="warning-box">
            <h2 style="margin: 0 0 10px 0; color: #92400e;">${appointmentCount} appointment${appointmentCount > 1 ? 's' : ''} ${appointmentCount > 1 ? 'have' : 'has'} been cancelled</h2>
            <p style="margin: 0; color: #78350f;">Please check the details below.</p>
          </div>
          
          ${appointmentDetails?.clientName && appointmentDetails?.serviceName ? `
          <div class="appointment-details">
            <h3 style="margin-top: 0; color: #111827;">Cancelled Appointment Details:</h3>
            ${appointmentDetails.clientName ? `<div class="detail-row"><span class="detail-label">Client:</span><span class="detail-value">${appointmentDetails.clientName}</span></div>` : ''}
            ${appointmentDetails.serviceName ? `<div class="detail-row"><span class="detail-label">Service:</span><span class="detail-value">${appointmentDetails.serviceName}</span></div>` : ''}
            ${appointmentDetails.date ? `<div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${appointmentDetails.date}</span></div>` : ''}
            ${appointmentDetails.time ? `<div class="detail-row"><span class="detail-label">Time:</span><span class="detail-value">${appointmentDetails.time}</span></div>` : ''}
          </div>
          ` : ''}
          
          <p>Please check your admin panel for more details.</p>
          
          <div class="footer">
            <p>This is an automated email from Ease My Salon CRM</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Appointment Cancelled

Hello ${businessName},

${appointmentCount} appointment${appointmentCount > 1 ? 's' : ''} ${appointmentCount > 1 ? 'have' : 'has'} been cancelled.

${appointmentDetails?.clientName && appointmentDetails?.serviceName ? `
Cancelled Appointment Details:
${appointmentDetails.clientName ? `Client: ${appointmentDetails.clientName}` : ''}
${appointmentDetails.serviceName ? `Service: ${appointmentDetails.serviceName}` : ''}
${appointmentDetails.date ? `Date: ${appointmentDetails.date}` : ''}
${appointmentDetails.time ? `Time: ${appointmentDetails.time}` : ''}
` : ''}

Please check your admin panel for more details.

This is an automated email from Ease My Salon CRM
  `;

  return { html, text };
}

module.exports = {
  dailySummary,
  weeklySummary,
  receipt,
  appointmentConfirmation,
  appointmentReminder,
  appointmentCancellation,
  exportReady,
  systemAlert,
  lowInventory,
  appointmentNotification,
  appointmentCancellationNotification,
};

