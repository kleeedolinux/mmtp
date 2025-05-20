const BMTPBridge = require('./bridge');
const fs = require('fs-extra');
const path = require('path');

// Load configuration from file or use defaults
let config = {
  mmtp: {
    serverHost: 'localhost',
    serverPort: 8025,
    securePort: 8026,
    useTLS: true,
    usePGP: true,
    keyStorePath: path.join(process.cwd(), 'keystore')
  },
  smtp: {
    port: 25,
    host: '0.0.0.0',
    secure: false,
    authMethods: ['PLAIN', 'LOGIN'],
    authOptional: true
  },
  smtpRelay: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'user@example.com',
      pass: 'password'
    }
  },
  domainMapping: {
    'mmtp.example.com': true
  },
  users: {
    'admin': { password: 'password' }
  }
};

// Try to load config from config file
const configPath = path.join(process.cwd(), 'BMTP', 'config.json');
try {
  if (fs.existsSync(configPath)) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...fileConfig };
    console.log('Loaded configuration from config.json');
  }
} catch (error) {
  console.warn(`Failed to load config from ${configPath}: ${error.message}`);
  console.log('Using default configuration');
}

// Initialize the BMTP bridge with the configuration
const bridgeOptions = {
  // MMTP options
  mmtpServerHost: config.mmtp.serverHost,
  mmtpServerPort: config.mmtp.serverPort,
  mmtpSecurePort: config.mmtp.securePort,
  useTLS: config.mmtp.useTLS,
  usePGP: config.mmtp.usePGP,
  keyStorePath: config.mmtp.keyStorePath,
  
  // SMTP server options
  smtpPort: config.smtp.port,
  smtpHost: config.smtp.host,
  smtpSecure: config.smtp.secure,
  smtpAuthMethods: config.smtp.authMethods,
  smtpAuthOptional: config.smtp.authOptional,
  
  // SMTP relay options
  smtpRelayHost: config.smtpRelay.host,
  smtpRelayPort: config.smtpRelay.port,
  smtpRelaySecure: config.smtpRelay.secure,
  smtpRelayAuth: config.smtpRelay.auth,
  
  // Domain mapping
  domainMapping: config.domainMapping,
  
  // User accounts
  users: config.users
};

const bridge = new BMTPBridge(bridgeOptions);

// Start the BMTP bridge
bridge.start().then((result) => {
  if (result.success) {
    console.log('BMTP Bridge started successfully');
  } else {
    console.error(`Failed to start BMTP Bridge: ${result.error}`);
    process.exit(1);
  }
}).catch((error) => {
  console.error(`Error starting BMTP Bridge: ${error.message}`);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down BMTP Bridge...');
  bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down BMTP Bridge...');
  bridge.stop();
  process.exit(0);
}); 