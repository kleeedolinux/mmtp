const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');

class MMTPBridgeExtension {
  constructor(server, options = {}) {
    this.server = server;
    this.protocol = server.protocol;
    
    this.smtpRelayOptions = {
      host: options.smtpRelayHost || 'smtp.example.com',
      port: options.smtpRelayPort || 587,
      secure: options.smtpRelaySecure ?? false,
      auth: options.smtpRelayAuth || null
    };

    this.domainMapping = options.domainMapping || {
      'gmail.com': true,
      'outlook.com': true,
      'yahoo.com': true
    };

    this.smtpTransporter = null;
    this.originalHandleSendMail = server.handleSendMail;
  }

  initialize() {
    this.smtpTransporter = nodemailer.createTransport(this.smtpRelayOptions);
    
    this.server.handleSendMail = this.handleSendMail.bind(this);
    
    console.log('BMTP Extension initialized for MMTP server');
    return true;
  }

  shutdown() {
    if (this.originalHandleSendMail) {
      this.server.handleSendMail = this.originalHandleSendMail;
    }
    
    console.log('BMTP Extension shut down');
  }

  async handleSendMail(data, socket) {
    try {
      const result = await this.protocol.processPacket(data.packet);
      if (!result.success) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: result.error
        }));
        return;
      }

      const { packet } = result;
      const { recipient } = packet;
      
      const match = recipient.match(/^\(([a-zA-Z0-9._-]+)\)%\(([a-zA-Z0-9.-]+)\)$/);
      if (!match) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Invalid recipient format'
        }));
        return;
      }

      const [_, username, domain] = match;
      
      if (this.domainMapping[domain]) {
        try {
          await this.sendToSMTP(packet);
          
          socket.write(JSON.stringify({
            status: 'OK',
            message: 'Message delivered to external SMTP server',
            messageId: packet.meta.messageId,
            encrypted: packet.meta.encrypted,
            signed: packet.meta.signed,
            via: 'SMTP'
          }));
        } catch (error) {
          console.error(`SMTP delivery error: ${error.message}`);
          socket.write(JSON.stringify({
            status: 'ERROR',
            message: `SMTP delivery failed: ${error.message}`
          }));
        }
      } else {
        if (!this.server.mailboxes[recipient]) {
          this.server.mailboxes[recipient] = [];
        }
        
        this.server.mailboxes[recipient].push(packet);
        
        socket.write(JSON.stringify({
          status: 'OK',
          message: 'Message delivered successfully',
          messageId: packet.meta.messageId,
          encrypted: packet.meta.encrypted,
          signed: packet.meta.signed
        }));
      }
    } catch (error) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: `Failed to process message: ${error.message}`
      }));
    }
  }

  async sendToSMTP(mmtpPacket) {
    const smtpSender = this.convertToSMTPAddress(mmtpPacket.sender);
    const smtpRecipient = this.convertToSMTPAddress(mmtpPacket.recipient);
    
    let subject, body;
    if (mmtpPacket.meta.encrypted) {
      throw new Error('Cannot send encrypted MMTP messages to SMTP recipients');

      throw new Error('Cannot send encrypted MMTP messages to SMTP recipients');
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
    
    return await this.smtpTransporter.sendMail(message);
  }

  convertToSMTPAddress(mmtpAddress) {
    const match = mmtpAddress.match(/^\(([a-zA-Z0-9._-]+)\)%\(([a-zA-Z0-9.-]+)\)$/);
    if (match) {
      const [_, username, domain] = match;
      return `${username}@${domain}`;
    }
    throw new Error(`Invalid MMTP address format: ${mmtpAddress}`);
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

module.exports = MMTPBridgeExtension; 