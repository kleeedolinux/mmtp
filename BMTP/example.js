/**
 * Example implementation of the BMTP (Bridge Mail Transfer Protocol)
 * This example shows how to:
 * 1. Start the BMTP bridge standalone server
 * 2. Integrate the MMTP server extension
 */

// Import required modules
const BMTPBridge = require('./bridge');
const MMTPServer = require('../SERVER/server');
const MMTPBridgeExtension = require('./mmtp-extension');

/**
 * Example 1: Start a standalone BMTP bridge server
 * This accepts SMTP connections and forwards to MMTP
 */
function startBMTPBridge() {
  console.log('Starting BMTP Bridge...');
  
  const bridgeOptions = {
    // MMTP connection options
    mmtpServerHost: 'localhost',
    mmtpServerPort: 8025,
    mmtpSecurePort: 8026,
    useTLS: true,
    usePGP: true,
    
    // SMTP server options (for receiving emails)
    smtpPort: 2525,
    smtpHost: '0.0.0.0',
    smtpSecure: false,
    smtpAuthOptional: true,
    
    // SMTP relay options (for forwarding non-MMTP emails)
    smtpRelayHost: 'smtp.example.com',
    smtpRelayPort: 587,
    smtpRelayAuth: {
      user: 'your-smtp-user@example.com',
      pass: 'your-smtp-password'
    },
    
    // Domain mapping for routing
    domainMapping: {
      'mmtp.example.com': true,
      'secure-mail.org': true
    },
    
    // User accounts for SMTP auth
    users: {
      'admin': { password: 'admin-password' }
    }
  };
  
  const bridge = new BMTPBridge(bridgeOptions);
  
  bridge.start().then(result => {
    if (result.success) {
      console.log('BMTP Bridge started successfully');
    } else {
      console.error(`Failed to start BMTP Bridge: ${result.error}`);
    }
  }).catch(error => {
    console.error(`Error starting BMTP Bridge: ${error.message}`);
  });
  
  // Setup shutdown handler
  process.on('SIGINT', () => {
    console.log('Shutting down BMTP Bridge...');
    bridge.stop();
    process.exit(0);
  });
  
  return bridge;
}

/**
 * Example 2: Integrate the BMTP extension with an MMTP server
 * This allows MMTP users to send emails to SMTP recipients
 */
function startMMTPServerWithBridgeExtension() {
  console.log('Starting MMTP Server with BMTP Extension...');
  
  // Create and start the MMTP server
  const mmtpServer = new MMTPServer({
    port: 8025,
    securePort: 8026,
    useTLS: true,
    usePGP: true,
    certPath: './certs/server.cert',
    keyPath: './certs/server.key',
    keyStorePath: './keystore'
  });
  
  mmtpServer.start();
  
  // Create and initialize the BMTP extension
  const bridgeExtension = new MMTPBridgeExtension(mmtpServer, {
    // SMTP relay options for sending to external recipients
    smtpRelayHost: 'smtp.example.com',
    smtpRelayPort: 587,
    smtpRelaySecure: false,
    smtpRelayAuth: {
      user: 'your-smtp-user@example.com',
      pass: 'your-smtp-password'
    },
    
    // Domain mapping for external SMTP domains
    domainMapping: {
      'gmail.com': true,
      'outlook.com': true,
      'yahoo.com': true,
      'hotmail.com': true
    }
  });
  
  // Initialize the extension
  bridgeExtension.initialize();
  
  // Setup shutdown handler
  process.on('SIGINT', () => {
    console.log('Shutting down MMTP Server...');
    bridgeExtension.shutdown();
    mmtpServer.stop();
    process.exit(0);
  });
  
  return { mmtpServer, bridgeExtension };
}

/**
 * Example 3: Combined setup - Both bridge and extension
 * This enables full bidirectional communication between MMTP and SMTP
 */
function startCompleteBridgeSolution() {
  // Start the BMTP bridge
  const bridge = startBMTPBridge();
  
  // Start the MMTP server with bridge extension
  const { mmtpServer, bridgeExtension } = startMMTPServerWithBridgeExtension();
  
  console.log('Complete BMTP solution is running!');
  console.log('- SMTP to MMTP gateway is listening on port 2525');
  console.log('- MMTP server is listening on ports 8025/8026');
  console.log('- MMTP to SMTP gateway is enabled for external domains');
  
  return { bridge, mmtpServer, bridgeExtension };
}

// Choose which example to run
if (process.argv.includes('--bridge-only')) {
  startBMTPBridge();
} else if (process.argv.includes('--extension-only')) {
  startMMTPServerWithBridgeExtension();
} else {
  startCompleteBridgeSolution();
}

console.log('Use Ctrl+C to stop the servers'); 