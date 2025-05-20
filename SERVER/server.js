const net = require('net');
const tls = require('tls');
const fs = require('fs-extra');
const path = require('path');
const MMTPProtocol = require('../protocol');
class MMTPServer {
  constructor(options = {}) {
    this.port = options.port || 8025;
    this.securePort = options.securePort || 8026;
    this.useTLS = options.useTLS ?? true;
    this.usePGP = options.usePGP ?? false;
    this.certPath = options.certPath || path.join(process.cwd(), 'certs', 'server.cert');
    this.keyPath = options.keyPath || path.join(process.cwd(), 'certs', 'server.key');
    this.keyStorePath = options.keyStorePath || path.join(process.cwd(), 'keystore');
    this.protocol = new MMTPProtocol(
      options.difficulty || 5, 
      { 
        useTLS: this.useTLS, 
        usePGP: this.usePGP,
        keyStorePath: this.keyStorePath
      }
    );
    this.server = null;
    this.secureServer = null;
    this.mailboxes = {}; 
    this.clients = new Set();
    this.connectionLimits = {}; 
    if (this.useTLS) {
      fs.ensureDirSync(path.dirname(this.certPath));
    }
    if (this.usePGP) {
      fs.ensureDirSync(this.keyStorePath);
    }
  }
  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });
    this.server.listen(this.port, () => {
      console.log(`MMTP Server running on port ${this.port}`);
    });
    this.server.on('error', (error) => {
      console.error(`Server error: ${error.message}`);
    });
    if (this.useTLS) {
      try {
        if (!fs.existsSync(this.certPath) || !fs.existsSync(this.keyPath)) {
          console.warn('TLS certificate or key not found. Generating self-signed certificate...');
          this.generateSelfSignedCert();
        }
        const tlsOptions = {
          key: fs.readFileSync(this.keyPath),
          cert: fs.readFileSync(this.certPath)
        };
        this.secureServer = tls.createServer(tlsOptions, (socket) => {
          socket.encrypted = true;
          this.handleConnection(socket);
        });
        this.secureServer.listen(this.securePort, () => {
          console.log(`MMTP Secure Server (TLS) running on port ${this.securePort}`);
        });
        this.secureServer.on('error', (error) => {
          console.error(`Secure server error: ${error.message}`);
        });
      } catch (error) {
        console.error(`Failed to start TLS server: ${error.message}`);
      }
    }
  }
  handleConnection(socket) {
    const clientIp = socket.remoteAddress;
    const isEncrypted = socket.encrypted || false;
    this.connectionLimits[clientIp] = (this.connectionLimits[clientIp] || 0) + 1;
    if (this.connectionLimits[clientIp] > 5) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'Rate limit exceeded. Try again later.'
      }));
      socket.end();
      return;
    }
    this.clients.add(socket);
    console.log(`Client connected: ${clientIp}${isEncrypted ? ' (encrypted)' : ''}`);
    socket.on('data', async (data) => {
      try {
        const request = JSON.parse(data.toString());
        await this.handleRequest(request, socket);
      } catch (error) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Invalid request format. Must be valid JSON.'
        }));
      }
    });
    socket.on('close', () => {
      this.clients.delete(socket);
      this.connectionLimits[clientIp]--;
      console.log(`Client disconnected: ${clientIp}${isEncrypted ? ' (encrypted)' : ''}`);
    });
    socket.on('error', (error) => {
      console.error(`Socket error: ${error.message}`);
      this.clients.delete(socket);
    });
    socket.write(JSON.stringify({
      status: 'OK',
      message: `MMTP Server Ready${isEncrypted ? ' (Secure Connection)' : ''}`,
      features: {
        tls: this.useTLS,
        pgp: this.usePGP
      }
    }));
  }
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('MMTP Server stopped');
      });
    }
    if (this.secureServer) {
      this.secureServer.close(() => {
        console.log('MMTP Secure Server stopped');
      });
    }
  }
  async handleRequest(request, socket) {
    switch (request.action) {
      case 'SEND':
        await this.handleSendMail(request.data, socket);
        break;
      case 'RECEIVE':
        await this.handleReceiveMail(request.data, socket);
        break;
      case 'RECEIVE_FILTERED':
        await this.handleReceiveFilteredMail(request.data, socket);
        break;
      case 'CHECK':
        await this.handleCheckMail(request.data, socket);
        break;
      case 'REGISTER_KEY':
        await this.handleRegisterKey(request.data, socket);
        break;
      case 'REQUEST_PUBLIC_KEY':
        await this.handleRequestPublicKey(request.data, socket);
        break;
      case 'GET_TAG_CATEGORIES':
        await this.handleGetTagCategories(request.data, socket);
        break;
      default:
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Unknown action'
        }));
    }
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
      if (!this.mailboxes[recipient]) {
        this.mailboxes[recipient] = [];
      }
      this.mailboxes[recipient].push(packet);
      socket.write(JSON.stringify({
        status: 'OK',
        message: 'Message delivered successfully',
        messageId: packet.meta.messageId,
        encrypted: packet.meta.encrypted,
        signed: packet.meta.signed
      }));
    } catch (error) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: `Failed to process message: ${error.message}`
      }));
    }
  }
  async handleReceiveMail(data, socket) {
    const { email } = data;
    if (!this.protocol.validateEmailFormat(email)) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'Invalid email format'
      }));
      return;
    }
    if (!this.mailboxes[email] || this.mailboxes[email].length === 0) {
      socket.write(JSON.stringify({
        status: 'OK',
        messages: [],
        count: 0
      }));
      return;
    }
    if (this.usePGP) {
      for (let i = 0; i < this.mailboxes[email].length; i++) {
        const packet = this.mailboxes[email][i];
        if (packet.meta.encrypted) {
          const processedPacket = await this.protocol.processPacket(
            packet,
            { recipientEmail: email }
          );
          if (processedPacket.success) {
            this.mailboxes[email][i] = processedPacket.packet;
          }
        }
      }
    }
    socket.write(JSON.stringify({
      status: 'OK',
      messages: this.mailboxes[email],
      count: this.mailboxes[email].length
    }));
    delete this.mailboxes[email];
  }
  async handleReceiveFilteredMail(data, socket) {
    const { email, tagFilters } = data;
    if (!this.protocol.validateEmailFormat(email)) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'Invalid email format'
      }));
      return;
    }
    if (!this.mailboxes[email] || this.mailboxes[email].length === 0) {
      socket.write(JSON.stringify({
        status: 'OK',
        messages: [],
        count: 0,
        tagFilters
      }));
      return;
    }
    if (this.usePGP) {
      for (let i = 0; i < this.mailboxes[email].length; i++) {
        const packet = this.mailboxes[email][i];
        if (packet.meta.encrypted) {
          const processedPacket = await this.protocol.processPacket(
            packet,
            { recipientEmail: email }
          );
          if (processedPacket.success) {
            this.mailboxes[email][i] = processedPacket.packet;
          }
        }
      }
    }
    let filteredMessages = this.mailboxes[email];
    if (tagFilters && Object.keys(tagFilters).length > 0) {
      filteredMessages = this.protocol.filterMessagesByTags(
        filteredMessages,
        tagFilters
      );
      this.mailboxes[email] = this.mailboxes[email].filter(message => 
        !filteredMessages.some(m => m.meta.messageId === message.meta.messageId)
      );
    } else {
      delete this.mailboxes[email];
    }
    socket.write(JSON.stringify({
      status: 'OK',
      messages: filteredMessages,
      count: filteredMessages.length,
      tagFilters
    }));
  }
  async handleGetTagCategories(data, socket) {
    socket.write(JSON.stringify({
      status: 'OK',
      tagCategories: this.protocol.getTagCategories()
    }));
  }
  async handleCheckMail(data, socket) {
    const { email, tagFilters } = data;
    if (!this.protocol.validateEmailFormat(email)) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'Invalid email format'
      }));
      return;
    }
    const messages = this.mailboxes[email] || [];
    let filteredCount = messages.length;
    let tagCounts = {};
    if (messages.length > 0) {
      tagCounts = this.countMessagesByTags(messages);
      if (tagFilters && Object.keys(tagFilters).length > 0) {
        const filteredMessages = this.protocol.filterMessagesByTags(messages, tagFilters);
        filteredCount = filteredMessages.length;
      }
    }
    socket.write(JSON.stringify({
      status: 'OK',
      count: filteredCount,
      totalCount: messages.length,
      tagCounts
    }));
  }
  countMessagesByTags(messages) {
    const counts = {};
    messages.forEach(message => {
      if (message.meta.tags && Object.keys(message.meta.tags).length > 0) {
        Object.entries(message.meta.tags).forEach(([category, tags]) => {
          if (!counts[category]) {
            counts[category] = {};
          }
          tags.forEach(tag => {
            counts[category][tag] = (counts[category][tag] || 0) + 1;
          });
        });
      }
    });
    return counts;
  }
  async handleRegisterKey(data, socket) {
    if (!this.usePGP) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'PGP support is not enabled on this server'
      }));
      return;
    }
    try {
      const { email, publicKey } = data;
      if (!this.protocol.validateEmailFormat(email)) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Invalid email format'
        }));
        return;
      }
      await this.protocol.importPublicKey(email, publicKey);
      socket.write(JSON.stringify({
        status: 'OK',
        message: 'Public key registered successfully'
      }));
    } catch (error) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: `Failed to register key: ${error.message}`
      }));
    }
  }
  async handleRequestPublicKey(data, socket) {
    if (!this.usePGP) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: 'PGP support is not enabled on this server'
      }));
      return;
    }
    try {
      const { email } = data;
      if (!this.protocol.validateEmailFormat(email)) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Invalid email format'
        }));
        return;
      }
      const publicKeyPath = this.protocol.getPublicKeyPath(email);
      if (!fs.existsSync(publicKeyPath)) {
        socket.write(JSON.stringify({
          status: 'ERROR',
          message: 'Public key not found for this email'
        }));
        return;
      }
      const publicKey = await fs.readFile(publicKeyPath, 'utf8');
      socket.write(JSON.stringify({
        status: 'OK',
        email,
        publicKey
      }));
    } catch (error) {
      socket.write(JSON.stringify({
        status: 'ERROR',
        message: `Failed to retrieve public key: ${error.message}`
      }));
    }
  }
  generateSelfSignedCert() {
    const { execSync } = require('child_process');
    fs.ensureDirSync(path.dirname(this.certPath));
    try {
      execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${this.keyPath}" -out "${this.certPath}" -days 365 -nodes -subj "/CN=localhost/O=MMTP Server/C=US"`);
      console.log('Self-signed certificate generated successfully');
    } catch (error) {
      console.error('Failed to generate self-signed certificate:', error.message);
      throw new Error('Failed to generate self-signed certificate');
    }
  }
}
if (require.main === module) {
  const server = new MMTPServer();
  server.start();
  process.on('SIGINT', () => {
    console.log('Shutting down MMTP server...');
    server.stop();
    process.exit(0);
  });
}
module.exports = MMTPServer; 