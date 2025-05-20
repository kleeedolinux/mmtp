const net = require('net');
const tls = require('tls');
const fs = require('fs-extra');
const path = require('path');
const MMTPProtocol = require('../protocol');
class MMTPClient {
  constructor(options = {}) {
    this.serverHost = options.serverHost || 'localhost';
    this.serverPort = options.serverPort || 8025;
    this.securePort = options.securePort || 8026;
    this.useTLS = options.useTLS ?? true;
    this.usePGP = options.usePGP ?? false;
    this.verifyTLS = options.verifyTLS ?? false;
    this.keyStorePath = options.keyStorePath || path.join(process.cwd(), 'keystore');
    this.email = options.email || null;
    this.protocol = new MMTPProtocol(
      options.difficulty || 5, 
      { 
        useTLS: this.useTLS, 
        usePGP: this.usePGP,
        keyStorePath: this.keyStorePath
      }
    );
    this.socket = null;
    this.connected = false;
    this.waitingResponses = new Map();
    this.serverFeatures = null;
  }
  connect(useSecure = true) {
    return new Promise((resolve, reject) => {
      const shouldUseTLS = this.useTLS && useSecure;
      if (shouldUseTLS) {
        const tlsOptions = {
          host: this.serverHost,
          port: this.securePort,
          rejectUnauthorized: this.verifyTLS
        };
        this.socket = tls.connect(tlsOptions, () => {
          this.connected = true;
          console.log(`Connected to MMTP server at ${this.serverHost}:${this.securePort} (TLS)`);
          this.setupSocketHandlers(resolve, reject, true);
        });
        this.socket.on('error', (error) => {
          console.error('TLS connection error:', error);
          reject(error);
        });
      } else {
        this.socket = new net.Socket();
        this.socket.connect(this.serverPort, this.serverHost, () => {
          this.connected = true;
          console.log(`Connected to MMTP server at ${this.serverHost}:${this.serverPort}`);
          this.setupSocketHandlers(resolve, reject, false);
        });
        this.socket.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });
      }
    });
  }
  setupSocketHandlers(resolve, reject, isSecure) {
    this.socket.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.status === 'OK' && response.message && response.message.includes('MMTP Server Ready')) {
          this.serverFeatures = response.features || null;
          resolve({
            connected: true,
            secure: isSecure,
            features: this.serverFeatures
          });
        } else {
          this.handleResponse(response);
        }
      } catch (error) {
        console.error('Failed to parse server response:', error);
      }
    });
    this.socket.on('error', (error) => {
      console.error('Connection error:', error);
      this.connected = false;
    });
    this.socket.on('close', () => {
      console.log('Connection closed');
      this.connected = false;
    });
  }
  disconnect() {
    if (this.socket && this.connected) {
      this.socket.end();
      this.connected = false;
      console.log('Disconnected from MMTP server');
    }
  }
  async sendMail(from, to, subject, body, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    const messageOptions = {
      encrypt: this.usePGP && options.encrypt !== false,
      sign: this.usePGP && options.sign !== false,
      tags: options.tags || {},
      ...options
    };
    const packet = await this.protocol.createMessagePacket(from, to, subject, body, 'SEND', messageOptions);
    const request = {
      action: 'SEND',
      data: {
        packet
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('SEND', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  async replyToMail(originalMessagePacket, from, body, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    const messageOptions = {
      encrypt: this.usePGP && options.encrypt !== false,
      sign: this.usePGP && options.sign !== false,
      tags: options.tags || (originalMessagePacket.meta.tags || {}),
      ...options
    };
    const packet = await this.protocol.createReplyPacket(originalMessagePacket, from, body, messageOptions);
    const request = {
      action: 'SEND',
      data: {
        packet
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('REPLY', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  checkMail(email) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    if (!this.protocol.validateEmailFormat(email)) {
      throw new Error('Invalid email format. Must be (name)%(domain)');
    }
    const request = {
      action: 'CHECK',
      data: {
        email
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('CHECK', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  receiveMail(email) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    if (!this.protocol.validateEmailFormat(email)) {
      throw new Error('Invalid email format. Must be (name)%(domain)');
    }
    const request = {
      action: 'RECEIVE',
      data: {
        email
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('RECEIVE', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  receiveMailByTags(email, tagFilters) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    if (!this.protocol.validateEmailFormat(email)) {
      throw new Error('Invalid email format. Must be (name)%(domain)');
    }
    const request = {
      action: 'RECEIVE_FILTERED',
      data: {
        email,
        tagFilters
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('RECEIVE_FILTERED', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  getTagCategories() {
    return this.protocol.getTagCategories();
  }
  addCustomTag(tag) {
    this.protocol.addCustomTag(tag);
    return { success: true, tag };
  }
  async generateKeys(email, name, passphrase = '', standardEmail = '') {
    if (!this.usePGP) {
      throw new Error('PGP support is not enabled');
    }
    return this.protocol.generateKeyPair(email, name, passphrase, standardEmail);
  }
  async registerPublicKey(email) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    if (!this.usePGP) {
      throw new Error('PGP support is not enabled');
    }
    const publicKeyPath = this.protocol.getPublicKeyPath(email);
    if (!fs.existsSync(publicKeyPath)) {
      throw new Error(`Public key not found for ${email}`);
    }
    const publicKey = await fs.readFile(publicKeyPath, 'utf8');
    const request = {
      action: 'REGISTER_KEY',
      data: {
        email,
        publicKey
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('REGISTER_KEY', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  async requestPublicKey(email) {
    if (!this.connected) {
      throw new Error('Not connected to MMTP server');
    }
    if (!this.usePGP) {
      throw new Error('PGP support is not enabled');
    }
    const request = {
      action: 'REQUEST_PUBLIC_KEY',
      data: {
        email
      }
    };
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(JSON.stringify(request));
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 10000);
        this.waitingResponses.set('REQUEST_PUBLIC_KEY', { resolve, reject, timeout });
      } catch (error) {
        reject(error);
      }
    });
  }
  handleResponse(response) {
    for (const [action, { resolve, reject, timeout }] of this.waitingResponses.entries()) {
      clearTimeout(timeout);
      this.waitingResponses.delete(action);
      if (response.status === 'ERROR') {
        reject(new Error(response.message));
      } else {
        if (action === 'REQUEST_PUBLIC_KEY' && response.publicKey) {
          this.protocol.importPublicKey(response.email, response.publicKey)
            .then(() => resolve(response))
            .catch((error) => reject(error));
        } else if (action === 'RECEIVE_FILTERED' && response.messages) {
          if (response.tagFilters) {
            response.messages = this.protocol.filterMessagesByTags(
              response.messages, 
              response.tagFilters
            );
          }
          resolve(response);
        } else {
          resolve(response);
        }
      }
      break;
    }
  }
}
module.exports = MMTPClient; 