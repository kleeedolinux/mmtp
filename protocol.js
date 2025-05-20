const crypto = require('crypto');
const openpgp = require('openpgp');
const fs = require('fs-extra');
const path = require('path');
class MMTPProtocol {
  constructor(difficulty = 5, options = {}) {
    this.difficulty = difficulty; 
    this.useTLS = options.useTLS ?? true;
    this.usePGP = options.usePGP ?? false;
    this.keyStorePath = options.keyStorePath || path.join(process.cwd(), 'keystore');
    this.publicKeys = new Map(); 
    if (this.usePGP) {
      fs.ensureDirSync(this.keyStorePath);
    }
  }
  async createMessagePacket(from, to, subject, body, type = 'SEND', options = {}) {
    if (!this.validateEmailFormat(from) || !this.validateEmailFormat(to)) {
      throw new Error('Invalid email format. Must be (name)%(domain)');
    }
    const timestamp = Date.now();
    const messageId = crypto.randomBytes(16).toString('hex');
    const messageContent = { subject, body };
    const messageHash = this.generateSHA256(JSON.stringify(messageContent));
    const hashcashToken = this.generateHashCash(from, to, timestamp);
    const packet = {
      meta: {
        type,
        messageId,
        timestamp,
        hashcashToken,
        encrypted: false,
        signed: false
      },
      sender: from,
      recipient: to,
      content: messageContent,
      verification: {
        messageHash
      }
    };
    if (options.sign && this.usePGP) {
      const privateKeyPath = this.getPrivateKeyPath(from);
      if (fs.existsSync(privateKeyPath)) {
        const privateKeyArmored = await fs.readFile(privateKeyPath, 'utf8');
        const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
        const messageToSign = JSON.stringify(messageContent);
        const signature = await openpgp.sign({
          message: await openpgp.createMessage({ text: messageToSign }),
          signingKeys: privateKey,
          detached: true
        });
        packet.verification.signature = signature;
        packet.meta.signed = true;
      }
    }
    if (options.encrypt && this.usePGP) {
      try {
        const recipientPublicKey = await this.getPublicKey(to);
        if (recipientPublicKey) {
          const contentStr = JSON.stringify(messageContent);
          const encrypted = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: contentStr }),
            encryptionKeys: recipientPublicKey
          });
          packet.content = { encrypted: encrypted };
          packet.meta.encrypted = true;
        }
      } catch (error) {
        console.error(`Failed to encrypt message: ${error.message}`);
      }
    }
    return packet;
  }
  async createReplyPacket(originalPacket, from, body, options = {}) {
    return this.createMessagePacket(
      from,
      originalPacket.sender,
      `RE: ${originalPacket.meta.encrypted ? 'Encrypted Message' : originalPacket.content.subject}`,
      body,
      'REPLY',
      options
    );
  }
  validateEmailFormat(email) {
    const regex = /^\([a-zA-Z0-9._-]+\)%\([a-zA-Z0-9.-]+\)$/;
    return regex.test(email);
  }
  generateSHA256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  verifyMessageIntegrity(packet) {
    if (packet.meta.encrypted) {
      return true;
    }
    const calculatedHash = this.generateSHA256(JSON.stringify(packet.content));
    return calculatedHash === packet.verification.messageHash;
  }
  generateHashCash(sender, recipient, timestamp) {
    let counter = 0;
    const version = 1;
    const resource = `${sender}:${recipient}:${timestamp}`;
    while (true) {
      const token = `${version}:${this.difficulty}:${timestamp}:${resource}::${counter}:`;
      const hash = this.generateSHA256(token);
      if (hash.startsWith('0'.repeat(this.difficulty))) {
        return {
          token,
          counter
        };
      }
      counter++;
    }
  }
  verifyHashCash(packet) {
    const { token, counter } = packet.meta.hashcashToken;
    const hash = this.generateSHA256(token);
    return hash.startsWith('0'.repeat(this.difficulty));
  }
  async processPacket(packet, options = {}) {
    if (!this.verifyMessageIntegrity(packet)) {
      return {
        success: false,
        error: 'Message integrity check failed'
      };
    }
    if (!this.verifyHashCash(packet)) {
      return {
        success: false,
        error: 'HashCash verification failed - potential spam'
      };
    }
    if (packet.meta.encrypted && this.usePGP && options.recipientEmail) {
      try {
        const privateKeyPath = this.getPrivateKeyPath(options.recipientEmail);
        if (fs.existsSync(privateKeyPath)) {
          const privateKeyArmored = await fs.readFile(privateKeyPath, 'utf8');
          const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
          const encryptedMessage = await openpgp.readMessage({
            armoredMessage: packet.content.encrypted
          });
          const { data: decrypted } = await openpgp.decrypt({
            message: encryptedMessage,
            decryptionKeys: privateKey
          });
          packet.content = JSON.parse(decrypted);
          packet.meta.decrypted = true;
        }
      } catch (error) {
        console.error(`Failed to decrypt message: ${error.message}`);
      }
    }
    if (packet.meta.signed && packet.verification.signature && this.usePGP) {
      try {
        const senderPublicKey = await this.getPublicKey(packet.sender);
        if (senderPublicKey) {
          const messageToVerify = JSON.stringify(packet.content);
          const message = await openpgp.createMessage({ text: messageToVerify });
          const signature = packet.verification.signature;
          const verificationResult = await openpgp.verify({
            message,
            signature,
            verificationKeys: senderPublicKey
          });
          const { verified } = verificationResult.signatures[0];
          await verified;
          packet.meta.signatureVerified = true;
        }
      } catch (error) {
        console.error(`Failed to verify signature: ${error.message}`);
        packet.meta.signatureVerified = false;
      }
    }
    return {
      success: true,
      packet
    };
  }
  async generateKeyPair(email, name, passphrase = '') {
    if (!this.usePGP) {
      throw new Error('PGP support is not enabled');
    }
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 4096,
      userIDs: [{ name, email }],
      passphrase
    });
    const publicKeyPath = this.getPublicKeyPath(email);
    const privateKeyPath = this.getPrivateKeyPath(email);
    await fs.writeFile(publicKeyPath, publicKey);
    await fs.writeFile(privateKeyPath, privateKey);
    this.publicKeys.set(email, await openpgp.readKey({ armoredKey: publicKey }));
    return {
      email,
      publicKeyPath,
      privateKeyPath
    };
  }
  async getPublicKey(email) {
    if (!this.usePGP) {
      return null;
    }
    if (this.publicKeys.has(email)) {
      return this.publicKeys.get(email);
    }
    const publicKeyPath = this.getPublicKeyPath(email);
    if (fs.existsSync(publicKeyPath)) {
      const publicKeyArmored = await fs.readFile(publicKeyPath, 'utf8');
      const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
      this.publicKeys.set(email, publicKey);
      return publicKey;
    }
    return null;
  }
  async importPublicKey(email, publicKeyArmored) {
    if (!this.usePGP) {
      throw new Error('PGP support is not enabled');
    }
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const publicKeyPath = this.getPublicKeyPath(email);
    await fs.writeFile(publicKeyPath, publicKeyArmored);
    this.publicKeys.set(email, publicKey);
    return {
      email,
      publicKeyPath
    };
  }
  getPublicKeyPath(email) {
    return path.join(this.keyStorePath, `${email}.pub.asc`);
  }
  getPrivateKeyPath(email) {
    return path.join(this.keyStorePath, `${email}.priv.asc`);
  }
  createTLSConfig(certPath, keyPath) {
    if (!this.useTLS) {
      return null;
    }
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      throw new Error('TLS certificate or key file not found');
    }
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  }
}
module.exports = MMTPProtocol; 