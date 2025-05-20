const nodemailer = require('nodemailer');
const SMTPServer = require('smtp-server').SMTPServer;
const simpleParser = require('mailparser').simpleParser;
const MMTPProtocol = require('../protocol');
const MMTPClient = require('../CLIENT/client');
const path = require('path');
const fs = require('fs-extra');

class BMTPBridge {
  constructor(options = {}) {
    this.mmtpOptions = {
      serverHost: options.mmtpServerHost || 'localhost',
      serverPort: options.mmtpServerPort || 8025,
      securePort: options.mmtpSecurePort || 8026,
      useTLS: options.useTLS ?? true,
      usePGP: options.usePGP ?? false,
      keyStorePath: options.keyStorePath || path.join(process.cwd(), 'keystore')
    };

    this.smtpOptions = {
      port: options.smtpPort || 25,
      host: options.smtpHost || '0.0.0.0',
      secure: options.smtpSecure ?? false,
      authMethods: options.smtpAuthMethods || ['PLAIN', 'LOGIN'],
      authOptional: options.smtpAuthOptional ?? true,
      disabledCommands: options.smtpDisabledCommands || ['STARTTLS'],
      onAuth: this.handleSMTPAuth.bind(this)
    };

    this.smtpRelayOptions = {
      host: options.smtpRelayHost || 'smtp.example.com',
      port: options.smtpRelayPort || 587,
      secure: options.smtpRelaySecure ?? false,
      auth: options.smtpRelayAuth || null
    };

    this.mmtpClient = new MMTPClient(this.mmtpOptions);
    this.protocol = new MMTPProtocol(
      options.difficulty || 5,
      {
        useTLS: this.mmtpOptions.useTLS,
        usePGP: this.mmtpOptions.usePGP,
        keyStorePath: this.mmtpOptions.keyStorePath
      }
    );

    this.domainMapping = options.domainMapping || {
      'mmtp.example.com': true 
    };

    this.users = options.users || {};
    this.smtpServer = null;
    this.smtpTransporter = null;
  }

  async start() {
    try {
      await this.mmtpClient.connect();
      console.log("Connected to MMTP server");

      this.smtpTransporter = nodemailer.createTransport(this.smtpRelayOptions);

      this.smtpServer = new SMTPServer({
        ...this.smtpOptions,
        onData: this.handleSMTPData.bind(this)
      });

      this.smtpServer.listen(this.smtpOptions.port, () => {
        console.log(`BMTP Bridge SMTP server listening on port ${this.smtpOptions.port}`);
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to start BMTP Bridge:", error);
      return { success: false, error: error.message };
    }
  }

  stop() {
    if (this.smtpServer) {
      this.smtpServer.close(() => {
        console.log('BMTP Bridge SMTP server stopped');
      });
    }
    if (this.mmtpClient) {
      this.mmtpClient.disconnect();
      console.log('BMTP Bridge disconnected from MMTP server');
    }
  }

  handleSMTPAuth(auth, session, callback) {
    const username = auth.username;
    const password = auth.password;

    if (this.users[username] && this.users[username].password === password) {
      callback(null, { user: username });
    } else {
      callback(new Error('Invalid username or password'));
    }
  }

  async handleSMTPData(stream, session, callback) {
    try {
      const parsedMail = await simpleParser(stream);
      
      const from = parsedMail.from.value[0];
      const to = parsedMail.to.value;
      
      for (const recipient of to) {
        const recipientDomain = recipient.address.split('@')[1];
        
        if (this.domainMapping[recipientDomain]) {
          await this.sendViaMMTP(parsedMail, from, recipient);
        } else {
          await this.forwardViaSMTP(parsedMail, from, recipient);
        }
      }
      
      callback(null, "Message processed successfully");
    } catch (error) {
      console.error("Error processing email:", error);
      callback(new Error(`Error processing message: ${error.message}`));
    }
  }

  async sendViaMMTP(parsedMail, from, recipient) {
    try {
      const mmtpSender = this.convertToMMTPAddress(from.address);
      const mmtpRecipient = this.convertToMMTPAddress(recipient.address);
      
      const subject = parsedMail.subject || "(No Subject)";
      const body = parsedMail.text || parsedMail.html || "";
      
      const tags = this.extractTagsFromEmail(parsedMail);
      
      const result = await this.mmtpClient.sendMail(
        mmtpSender, 
        mmtpRecipient, 
        subject, 
        body, 
        { tags }
      );
      
      console.log(`SMTP to MMTP delivery: ${from.address} -> ${recipient.address}`, result);
      return result;
    } catch (error) {
      console.error(`Failed to send via MMTP: ${error.message}`);
      throw error;
    }
  }

  async forwardViaSMTP(parsedMail, from, recipient) {
    try {
      const message = {
        from: from.address,
        to: recipient.address,
        subject: parsedMail.subject || "(No Subject)",
        text: parsedMail.text || "",
        html: parsedMail.html || undefined,
        attachments: parsedMail.attachments || []
      };
      
      const result = await this.smtpTransporter.sendMail(message);
      console.log(`SMTP forwarding: ${from.address} -> ${recipient.address}`, result);
      return result;
    } catch (error) {
      console.error(`Failed to forward via SMTP: ${error.message}`);
      throw error;
    }
  }

  async sendMMTPtoSMTP(mmtpPacket) {
    try {
      const smtpSender = this.convertToSMTPAddress(mmtpPacket.sender);
      const smtpRecipient = this.convertToSMTPAddress(mmtpPacket.recipient);
      
      let subject, body;
      if (mmtpPacket.meta.encrypted) {
        subject = "Encrypted Message";
        body = "This message is encrypted and can only be viewed in an MMTP client.";
      } else {
        subject = mmtpPacket.content.subject;
        body = mmtpPacket.content.body;
      }
      
      const message = {
        from: smtpSender,
        to: smtpRecipient,
        subject: subject,
        text: body,
        headers: {
          'X-MMTP-MessageId': mmtpPacket.meta.messageId,
          'X-MMTP-Timestamp': mmtpPacket.meta.timestamp,
          'X-MMTP-Signature': mmtpPacket.meta.signed ? 'Verified' : 'Unsigned'
        }
      };
      
      if (mmtpPacket.meta.tags) {
        if (mmtpPacket.meta.tags.priority && mmtpPacket.meta.tags.priority.length > 0) {
          message.headers['X-Priority'] = this.convertMMTPPriorityToSMTP(mmtpPacket.meta.tags.priority[0]);
        }
        
        if (mmtpPacket.meta.tags.category && mmtpPacket.meta.tags.category.length > 0) {
          message.headers['X-MMTP-Category'] = mmtpPacket.meta.tags.category.join(', ');
        }
      }

      const result = await this.smtpTransporter.sendMail(message);
      console.log(`MMTP to SMTP delivery: ${smtpSender} -> ${smtpRecipient}`, result);
      return result;
    } catch (error) {
      console.error(`Failed to send MMTP message via SMTP: ${error.message}`);
      throw error;
    }
  }

  convertToMMTPAddress(smtpAddress) {
    const [username, domain] = smtpAddress.split('@');
    return `(${username})%(${domain})`;
  }

  convertToSMTPAddress(mmtpAddress) {
    const match = mmtpAddress.match(/^\(([a-zA-Z0-9._-]+)\)%\(([a-zA-Z0-9.-]+)\)$/);
    if (match) {
      const [_, username, domain] = match;
      return `${username}@${domain}`;
    }
    throw new Error(`Invalid MMTP address format: ${mmtpAddress}`);
  }
  
  extractTagsFromEmail(parsedMail) {
    const tags = {
      priority: [],
      category: [],
      status: []
    };
    
    if (parsedMail.headers.get('x-priority')) {
      const priority = this.convertSMTPPriorityToMMTP(parsedMail.headers.get('x-priority'));
      if (priority) {
        tags.priority.push(priority);
      }
    }
    
    if (parsedMail.headers.get('x-mmtp-category')) {
      const categories = parsedMail.headers.get('x-mmtp-category').split(',').map(c => c.trim());
      tags.category = categories.filter(cat => 
        this.protocol.tagCategories.category.includes(cat)
      );
    }
    
    if (parsedMail.subject) {
      const subject = parsedMail.subject.toLowerCase();
      if (subject.includes('urgent') || subject.includes('asap')) {
        tags.status.push('urgent');
      } else if (subject.includes('important')) {
        tags.status.push('important');
      } else if (subject.includes('action') || subject.includes('required')) {
        tags.status.push('action_required');
      }
    }
    
    return tags;
  }
  
  convertSMTPPriorityToMMTP(priority) {
    const priorityNum = parseInt(priority);
    if (priorityNum === 1) return 'high';
    if (priorityNum === 3) return 'medium';
    if (priorityNum === 5) return 'low';
    return 'medium';
  }
  
  convertMMTPPriorityToSMTP(priority) {
    switch (priority) {
      case 'high': return '1';
      case 'medium': return '3';
      case 'low': return '5';
      default: return '3';
    }
  }
}

module.exports = BMTPBridge; 