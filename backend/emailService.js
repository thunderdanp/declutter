const nodemailer = require('nodemailer');

class EmailService {
  constructor(pool) {
    this.pool = pool;
    this.transporter = null;
  }

  // Get SMTP configuration from database or environment
  async getSmtpConfig() {
    try {
      const result = await this.pool.query(
        "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp_%'"
      );

      const dbConfig = {};
      result.rows.forEach(row => {
        dbConfig[row.setting_key] = row.setting_value;
      });

      // Use database settings if available, otherwise fall back to environment variables
      return {
        host: dbConfig.smtp_host || process.env.SMTP_SERVER,
        port: parseInt(dbConfig.smtp_port || process.env.SMTP_PORT || '587'),
        secure: (dbConfig.smtp_port || process.env.SMTP_PORT || '587') === '465',
        auth: {
          user: dbConfig.smtp_user || process.env.SMTP_LOGIN,
          pass: dbConfig.smtp_password || process.env.SMTP_PASSWORD
        },
        fromAddress: dbConfig.smtp_from_address || process.env.SMTP_FROM_ADDRESS
      };
    } catch (error) {
      console.error('Error getting SMTP config:', error);
      // Fall back to environment variables
      return {
        host: process.env.SMTP_SERVER,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_LOGIN,
          pass: process.env.SMTP_PASSWORD
        },
        fromAddress: process.env.SMTP_FROM_ADDRESS
      };
    }
  }

  // Initialize or refresh the transporter
  async initTransporter() {
    const config = await this.getSmtpConfig();

    if (!config.host || !config.auth.user || !config.auth.pass) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });

    this.fromAddress = config.fromAddress || config.auth.user;
    return this.transporter;
  }

  // Test SMTP connection
  async testConnection() {
    try {
      const transporter = await this.initTransporter();
      if (!transporter) {
        return { success: false, error: 'SMTP not configured' };
      }
      await transporter.verify();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get email template by name
  async getTemplate(name) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM email_templates WHERE name = $1',
        [name]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting template:', error);
      return null;
    }
  }

  // Replace template variables with actual values
  renderTemplate(template, variables) {
    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    return { subject, body };
  }

  // Send email using a template
  async sendTemplatedEmail(templateName, to, variables) {
    try {
      const transporter = await this.initTransporter();
      if (!transporter) {
        console.error('SMTP not configured');
        return { success: false, error: 'SMTP not configured' };
      }

      const template = await this.getTemplate(templateName);
      if (!template) {
        return { success: false, error: `Template '${templateName}' not found` };
      }

      const { subject, body } = this.renderTemplate(template, variables);

      const mailOptions = {
        from: this.fromAddress,
        to: to,
        subject: subject,
        text: body,
        html: body.replace(/\n/g, '<br>')
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send raw email (without template)
  async sendEmail(to, subject, body) {
    try {
      const transporter = await this.initTransporter();
      if (!transporter) {
        return { success: false, error: 'SMTP not configured' };
      }

      const mailOptions = {
        from: this.fromAddress,
        to: to,
        subject: subject,
        text: body,
        html: body.replace(/\n/g, '<br>')
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send announcement to all users who have opted in
  async sendAnnouncement(announcementId) {
    try {
      // Get announcement details
      const announcementResult = await this.pool.query(
        'SELECT * FROM announcements WHERE id = $1',
        [announcementId]
      );

      if (announcementResult.rows.length === 0) {
        return { success: false, error: 'Announcement not found' };
      }

      const announcement = announcementResult.rows[0];

      // Get all users who have opted in for announcements
      const usersResult = await this.pool.query(`
        SELECT u.id, u.email, u.first_name, u.last_name
        FROM users u
        LEFT JOIN notification_preferences np ON u.id = np.user_id
        WHERE u.is_approved = true
          AND (np.announcements IS NULL OR np.announcements = true)
      `);

      const users = usersResult.rows;
      let sentCount = 0;
      const errors = [];

      for (const user of users) {
        const result = await this.sendTemplatedEmail('announcement', user.email, {
          firstName: user.first_name || 'User',
          lastName: user.last_name || '',
          title: announcement.title,
          content: announcement.content
        });

        if (result.success) {
          sentCount++;
        } else {
          errors.push({ email: user.email, error: result.error });
        }
      }

      // Update announcement with sent info
      await this.pool.query(
        'UPDATE announcements SET sent_at = CURRENT_TIMESTAMP, recipient_count = $1 WHERE id = $2',
        [sentCount, announcementId]
      );

      return {
        success: true,
        sentCount,
        totalUsers: users.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('Error sending announcement:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailService;
