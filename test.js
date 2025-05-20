const MMTPServer = require('./SERVER/server');
const MMTPClient = require('./CLIENT/client');
const fs = require('fs-extra');
const path = require('path');
const TEST_CONFIG = {
  serverPort: 8025,
  securePort: 8026,
  useTLS: true,
  usePGP: true,
  difficulty: 2, 
  keyStorePath: path.join(__dirname, 'keystore'),
  certsPath: path.join(__dirname, 'certs')
};
const EMAILS = {
  alice: '(alice)%(example.com)',
  bob: '(bob)%(example.com)'
};
function formatNameForPGP(email) {
  const match = email.match(/^\(([a-zA-Z0-9._-]+)\)%\(([a-zA-Z0-9.-]+)\)$/);
  if (match) {
    const [_, name, domain] = match;
    return `${name}@${domain}`; 
  }
  return email;
}
async function testMMTP() {
  console.log('Starting MMTP test with security features...');
  console.log('----------------------------------------');
  await cleanupTestFiles();
  const server = new MMTPServer({
    port: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: TEST_CONFIG.usePGP,
    difficulty: TEST_CONFIG.difficulty,
    keyStorePath: TEST_CONFIG.keyStorePath
  });
  server.start();
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    console.log('Test 1: Testing connections...');
    await testConnections();
    if (TEST_CONFIG.usePGP) {
      console.log('\nTest 2: Testing PGP key management...');
      await testKeyManagement();
    }
    console.log('\nTest 3: Testing basic messaging...');
    await testBasicMessaging();
    if (TEST_CONFIG.usePGP) {
      console.log('\nTest 4: Testing secure messaging...');
      await testSecureMessaging();
    }
    console.log('\nAll tests completed successfully! 🎉');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    server.stop();
    console.log('\nMMTP server stopped');
  }
}
async function testConnections() {
  const plainClient = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    useTLS: false,
    usePGP: false
  });
  const secureClient = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: true,
    usePGP: false
  });
  console.log('   Testing plain TCP connection...');
  const plainResult = await plainClient.connect(false);
  console.log(`   ✓ Plain connection established (secure: ${plainResult.secure})`);
  plainClient.disconnect();
  if (TEST_CONFIG.useTLS) {
    console.log('   Testing TLS secure connection...');
    const secureResult = await secureClient.connect(true);
    console.log(`   ✓ Secure connection established (secure: ${secureResult.secure})`);
    secureClient.disconnect();
  }
}
async function testKeyManagement() {
  const alice = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: true,
    keyStorePath: TEST_CONFIG.keyStorePath
  });
  const bob = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: true,
    keyStorePath: TEST_CONFIG.keyStorePath
  });
  await alice.connect(TEST_CONFIG.useTLS);
  await bob.connect(TEST_CONFIG.useTLS);
  const aliceEmail = formatNameForPGP(EMAILS.alice);
  const bobEmail = formatNameForPGP(EMAILS.bob);
  console.log('   Generating PGP keys for Alice...');
  const aliceKeysResult = await alice.generateKeys(EMAILS.alice, 'Alice User', '', aliceEmail);
  console.log(`   ✓ Alice's keys generated successfully`);
  console.log('   Generating PGP keys for Bob...');
  const bobKeysResult = await bob.generateKeys(EMAILS.bob, 'Bob User', '', bobEmail);
  console.log(`   ✓ Bob's keys generated successfully`);
  console.log('   Registering Alice\'s public key with server...');
  const aliceRegisterResult = await alice.registerPublicKey(EMAILS.alice);
  console.log(`   ✓ Alice's public key registered`);
  console.log('   Registering Bob\'s public key with server...');
  const bobRegisterResult = await bob.registerPublicKey(EMAILS.bob);
  console.log(`   ✓ Bob's public key registered`);
  console.log('   Alice requests Bob\'s public key...');
  const aliceRequestBobKey = await alice.requestPublicKey(EMAILS.bob);
  console.log(`   ✓ Alice received Bob's public key`);
  console.log('   Bob requests Alice\'s public key...');
  const bobRequestAliceKey = await bob.requestPublicKey(EMAILS.alice);
  console.log(`   ✓ Bob received Alice's public key`);
  alice.disconnect();
  bob.disconnect();
}
async function testBasicMessaging() {
  const alice = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: false
  });
  const bob = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: false
  });
  await alice.connect(TEST_CONFIG.useTLS);
  await bob.connect(TEST_CONFIG.useTLS);
  console.log('   Alice sends a message to Bob...');
  const subject = 'Hello from MMTP';
  const body = 'This is a test message using the Modern Mail Transfer Protocol!';
  const sendResult = await alice.sendMail(EMAILS.alice, EMAILS.bob, subject, body);
  console.log(`   ✓ Message sent successfully (ID: ${sendResult.messageId})`);
  console.log('   Bob checks for messages...');
  const checkResult = await bob.checkMail(EMAILS.bob);
  console.log(`   ✓ Bob has ${checkResult.count} message(s)`);
  console.log('   Bob receives messages...');
  const receiveResult = await bob.receiveMail(EMAILS.bob);
  console.log(`   ✓ Bob received ${receiveResult.messages.length} message(s)`);
  if (receiveResult.messages && receiveResult.messages.length > 0) {
    const message = receiveResult.messages[0];
    console.log(`   ✓ Message content: "${message.content.subject}" - ${message.content.body.substring(0, 30)}...`);
    console.log('   Bob replies to Alice...');
    const replyBody = 'Thanks for your message! This is a reply using MMTP.';
    const replyResult = await bob.replyToMail(message, EMAILS.bob, replyBody);
    console.log(`   ✓ Reply sent successfully (ID: ${replyResult.messageId})`);
    console.log('   Alice receives the reply...');
    const aliceReceiveResult = await alice.receiveMail(EMAILS.alice);
    console.log(`   ✓ Alice received ${aliceReceiveResult.messages.length} message(s)`);
    if (aliceReceiveResult.messages && aliceReceiveResult.messages.length > 0) {
      const replyMessage = aliceReceiveResult.messages[0];
      console.log(`   ✓ Reply content: "${replyMessage.content.subject}" - ${replyMessage.content.body.substring(0, 30)}...`);
    }
  }
  alice.disconnect();
  bob.disconnect();
}
async function testSecureMessaging() {
  const alice = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: true,
    keyStorePath: TEST_CONFIG.keyStorePath
  });
  const bob = new MMTPClient({
    serverHost: 'localhost',
    serverPort: TEST_CONFIG.serverPort,
    securePort: TEST_CONFIG.securePort,
    useTLS: TEST_CONFIG.useTLS,
    usePGP: true,
    keyStorePath: TEST_CONFIG.keyStorePath
  });
  await alice.connect(TEST_CONFIG.useTLS);
  await bob.connect(TEST_CONFIG.useTLS);
  try {
    await alice.requestPublicKey(EMAILS.bob);
    await bob.requestPublicKey(EMAILS.alice);
  } catch (error) {
    console.log('   Note: Public keys already cached');
  }
  console.log('   Alice sends an encrypted and signed message to Bob...');
  const subject = 'Secure Message';
  const body = 'This is a secure message with encryption and signature!';
  const sendResult = await alice.sendMail(EMAILS.alice, EMAILS.bob, subject, body, {
    encrypt: true,
    sign: true
  });
  console.log(`   ✓ Encrypted message sent (ID: ${sendResult.messageId}, encrypted: ${sendResult.encrypted}, signed: ${sendResult.signed})`);
  console.log('   Bob checks for encrypted messages...');
  const checkResult = await bob.checkMail(EMAILS.bob);
  console.log(`   ✓ Bob has ${checkResult.count} encrypted message(s)`);
  console.log('   Bob receives and decrypts messages...');
  const receiveResult = await bob.receiveMail(EMAILS.bob);
  if (receiveResult.messages && receiveResult.messages.length > 0) {
    const message = receiveResult.messages[0];
    const wasEncrypted = message.meta.decrypted;
    const wasSigned = message.meta.signed;
    const signatureVerified = message.meta.signatureVerified;
    console.log(`   ✓ Message decrypted: ${wasEncrypted}`);
    console.log(`   ✓ Message was signed: ${wasSigned}`);
    if (wasSigned) {
      console.log(`   ✓ Signature verified: ${signatureVerified}`);
    }
    console.log(`   ✓ Decrypted content: "${message.content.subject}" - ${message.content.body}`);
    console.log('   Bob sends an encrypted reply...');
    const replyBody = 'I received your encrypted message securely!';
    const replyResult = await bob.replyToMail(message, EMAILS.bob, replyBody, {
      encrypt: true,
      sign: true
    });
    console.log(`   ✓ Encrypted reply sent (ID: ${replyResult.messageId})`);
    console.log('   Alice receives and decrypts the reply...');
    const aliceReceiveResult = await alice.receiveMail(EMAILS.alice);
    if (aliceReceiveResult.messages && aliceReceiveResult.messages.length > 0) {
      const replyMessage = aliceReceiveResult.messages[0];
      console.log(`   ✓ Reply decrypted: ${replyMessage.meta.decrypted}`);
      console.log(`   ✓ Reply content: "${replyMessage.content.subject}" - ${replyMessage.content.body}`);
    }
  }
  alice.disconnect();
  bob.disconnect();
}
async function cleanupTestFiles() {
  try {
    if (fs.existsSync(TEST_CONFIG.keyStorePath)) {
      await fs.emptyDir(TEST_CONFIG.keyStorePath);
      console.log('Cleaned up keystore directory');
    } else {
      await fs.ensureDir(TEST_CONFIG.keyStorePath);
    }
    if (fs.existsSync(TEST_CONFIG.certsPath)) {
      await fs.emptyDir(TEST_CONFIG.certsPath);
      console.log('Cleaned up certs directory');
    } else {
      await fs.ensureDir(TEST_CONFIG.certsPath);
    }
  } catch (error) {
    console.error('Failed to clean up test files:', error);
  }
}
testMMTP().catch(console.error); 