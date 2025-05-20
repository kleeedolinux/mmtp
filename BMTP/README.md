# Bridge Mail Transfer Protocol (BMTP)

BMTP is a gateway solution that enables seamless communication between MMTP (Modern Mail Transfer Protocol) and SMTP (Simple Mail Transfer Protocol) systems. This bridge allows MMTP servers to receive emails from SMTP servers and send emails to SMTP servers.

## Overview

BMTP consists of two main components:

1. **BMTP Bridge Server**: Runs as a standalone service that accepts SMTP connections and forwards messages to MMTP servers.
2. **MMTP Server Extension**: Integrates with an existing MMTP server to enable sending messages to external SMTP recipients.

## Features

- Bidirectional communication between MMTP and SMTP
- Conversion of email addresses between formats
- Preservation of message metadata and tags
- Support for authentication
- Configurable domain routing
- Proper handling of encrypted/signed content

## Requirements

- Node.js 12.x or later
- Access to an MMTP server
- SMTP relay server (for outgoing SMTP emails)
- Required npm packages:
  - nodemailer
  - smtp-server
  - mailparser
  - fs-extra

## Installation

1. Install the required dependencies:

```bash
npm install nodemailer smtp-server mailparser fs-extra
```

2. Copy the BMTP directory to your MMTP installation.

3. Configure your settings in the `BMTP/config.json` file.

## Configuration

The `config.json` file contains all the settings for the BMTP bridge:

```json
{
  "mmtp": {
    "serverHost": "localhost",
    "serverPort": 8025,
    "securePort": 8026,
    "useTLS": true,
    "usePGP": true,
    "keyStorePath": "keystore"
  },
  "smtp": {
    "port": 2525,
    "host": "0.0.0.0",
    "secure": false,
    "authMethods": ["PLAIN", "LOGIN"],
    "authOptional": true
  },
  "smtpRelay": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "user@example.com",
      "pass": "password"
    }
  },
  "domainMapping": {
    "mmtp.example.com": true,
    "secure-mail.org": true
  },
  "users": {
    "admin": { "password": "admin-password" },
    "testuser": { "password": "test-password" }
  }
}
```

### Configuration Options

#### MMTP Options
- `serverHost`: Hostname of the MMTP server
- `serverPort`: Port number for the standard MMTP connection
- `securePort`: Port number for the secure MMTP connection
- `useTLS`: Whether to use TLS for secure connections
- `usePGP`: Whether to use PGP encryption for message content
- `keyStorePath`: Path to the PGP key store directory

#### SMTP Server Options
- `port`: Port number for the BMTP bridge SMTP server
- `host`: Hostname or IP to bind the SMTP server
- `secure`: Whether to use TLS for incoming SMTP connections
- `authMethods`: Authentication methods to accept
- `authOptional`: Whether authentication is required

#### SMTP Relay Options
- `host`: Hostname of the SMTP relay server
- `port`: Port number for the SMTP relay
- `secure`: Whether to use TLS for the SMTP relay connection
- `auth`: Authentication credentials for the SMTP relay

#### Domain Mapping
- A key-value object where keys are domain names and values are `true` for domains that should be handled by MMTP.

#### User Accounts
- A key-value object where keys are usernames and values are objects with passwords.

## Usage

### Starting the BMTP Bridge

To start the BMTP bridge, run:

```bash
node BMTP/server.js
```

This will start an SMTP server that accepts emails and routes them appropriately to either MMTP or SMTP destinations based on the domain mapping configuration.

### Integrating with MMTP Server

To enable the MMTP server to send emails to SMTP recipients, you need to integrate the MMTP extension into your server:

```javascript
const MMTPServer = require('./SERVER/server');
const MMTPBridgeExtension = require('./BMTP/mmtp-extension');

// Create and start your MMTP server
const server = new MMTPServer({
  // Your server options
});
server.start();

// Create and initialize the bridge extension
const bridgeExtension = new MMTPBridgeExtension(server, {
  smtpRelayHost: 'smtp.example.com',
  smtpRelayPort: 587,
  smtpRelayAuth: {
    user: 'your-user@example.com',
    pass: 'your-password'
  },
  domainMapping: {
    'gmail.com': true,
    'outlook.com': true,
    'yahoo.com': true
  }
});

// Initialize the extension
bridgeExtension.initialize();

// When shutting down:
// bridgeExtension.shutdown();
```

## How It Works

### SMTP to MMTP Flow

1. The BMTP Bridge SMTP server receives an email.
2. The server parses the email using `mailparser`.
3. For each recipient:
   - If the recipient's domain is in the domain mapping, the message is converted to MMTP format and sent to the MMTP server.
   - If the recipient's domain is not in the mapping, the message is forwarded to the SMTP relay.
4. Email tags and categories are converted to MMTP tags.

### MMTP to SMTP Flow

1. The MMTP server receives a message.
2. The server extension checks if the recipient's domain should be handled via SMTP.
3. If yes, the message is converted to SMTP format and sent using the SMTP relay.
4. MMTP-specific tags are converted to appropriate email headers.

## Address Format Conversion

### SMTP to MMTP
- SMTP: `user@example.com`
- MMTP: `(user)%(example.com)`

### MMTP to SMTP
- MMTP: `(user)%(example.com)`
- SMTP: `user@example.com`

## Security Considerations

- Encrypted MMTP messages cannot be sent to SMTP recipients (would break encryption).
- Authentication is recommended for the BMTP SMTP server to prevent unauthorized use.
- TLS is recommended for secure connections.
- Be careful with credential storage in the configuration file.

## Troubleshooting

### Common Issues

1. **Connection refused to MMTP server**
   - Ensure the MMTP server is running and accessible from the BMTP bridge.
   - Check that the host and port settings are correct.

2. **Authentication failures**
   - Verify that the user credentials in the configuration are correct.
   - Check that the authentication methods are supported by your clients.

3. **Message delivery failures**
   - Ensure the SMTP relay settings are correct.
   - Check that the recipient addresses are valid.
   - Verify domain mappings are set up correctly.

### Logging

The BMTP bridge logs important events to the console, including:
- Connection status
- Message deliveries
- Errors

Consider redirecting these logs to a file for persistence:

```bash
node BMTP/server.js > bmtp.log 2>&1
```

## License

This software is distributed under the MIT license, the same as the MMTP project. 