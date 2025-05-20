# Modern Mail Transfer Protocol (MMTP): A New Vision for Email

The landscape of digital communication is always evolving, yet email often relies on protocols designed for a different era. The Modern Mail Transfer Protocol (MMTP) offers a fresh perspective. It's a lightweight and efficient email protocol engineered to address the limitations of traditional systems like SMTP. Our focus with MMTP is to deliver a simpler, more secure, and privacy-centric approach to email transmission, effectively re-engineering email for the demands of the contemporary internet.

## Core Principles of MMTP

MMTP distinguishes itself through a carefully considered set of features designed to create a more robust and user-friendly email experience. It introduces a unique `(name)%(domain)` email format, offering a distinct alternative to conventional addressing. Communication is streamlined using JSON-based data exchange, a modern standard optimized for rapid transmission with minimal overhead.

To combat the persistent issue of unsolicited messages, MMTP incorporates the HashCash proof-of-work algorithm as an inherent anti-spam mechanism. Message integrity is paramount; therefore, each packet includes a SHA256 hash for verification, ensuring that what is sent is what is received. The protocol's architecture is intentionally simple, maintaining a clean and understandable separation between client and server components.

Security is not an afterthought. Secure transport is facilitated by default TLS encryption, safeguarding data in transit. For content-level privacy, OpenPGP provides robust end-to-end encryption, ensuring messages can only be read by their intended recipients. Complementing these security measures is a built-in public key infrastructure, designed to simplify the management of encryption and signing keys.

## Understanding the Project Structure

The MMTP project is organized to promote clarity and ease of navigation for developers. The main components are laid out as follows:

```
mmtp/
├── SERVER/
│   └── server.js      # The MMTP server implementation
├── CLIENT/
│   └── client.js      # The MMTP client implementation
├── protocol.js        # Core logic defining MMTP's communication rules
├── test.js            # Basic test scripts for core functionality
├── keystore/          # Default storage location for PGP keys
├── certs/             # Default storage for TLS certificates
├── package.json       # Project dependencies and npm scripts
└── README.md          # This documentation file
```

## Protocol Specifications: The Rules of Engagement

MMTP defines clear rules for how clients and servers interact, what messages look like, and how connections are established.

### Connection Pathways

MMTP offers flexibility in how clients connect to the server, supporting two distinct modes:
1.  **Standard Connection**: This utilizes a plain TCP connection, typically established on port `8025`.
2.  **Secure Connection**: For enhanced privacy, this mode uses a TLS-encrypted connection, generally on port `8026`.

### Message Anatomy

Messages within MMTP are constructed as JSON packets. This design choice promotes clarity, ease of parsing, and aligns with modern web standards. The structure of a typical message packet is detailed below:

```javascript
{
  meta: {
    type: String,         // Describes the message's purpose, e.g., 'SEND', 'REPLY'
    messageId: String,    // A unique identifier for tracking this specific message
    timestamp: Number,    // The Unix timestamp indicating when the message was sent
    hashcashToken: Object, // The anti-spam proof-of-work token
    encrypted: Boolean,   // Flag indicating if the message content is PGP encrypted
    signed: Boolean,      // Flag indicating if the message is PGP signed
    signatureVerified: Boolean // Status of PGP signature verification by the server
  },
  sender: String,         // Sender's address in (name)%(domain) format
  recipient: String,      // Recipient's address in (name)%(domain) format
  content: {
    // For unencrypted messages:
    subject: String,      // The subject line of the message
    body: String          // The main textual content of the message
    
    // For encrypted messages:
    encrypted: String     // The PGP encrypted message content
  },
  verification: {
    messageHash: String,  // SHA256 hash of the 'content' block for integrity checking
    signature: String     // Optional PGP signature for the message
  }
}
```

### The HashCash Anti-Spam Token

A key component of MMTP's anti-spam strategy is the HashCash token. Senders must compute this token, which is then validated by the server. Its format is as follows:

```javascript
{
  token: String,   // The HashCash string, e.g., "1:difficulty:timestamp:resource::counter:"
  counter: Number  // The counter value that satisfies the HashCash computation
}
```

## Available Actions and Server Endpoints

Communication with an MMTP server is achieved through a set of defined actions. Each action involves a specific request from the client and a corresponding response from the server.

### 1. SEND

To dispatch a message, the client initiates the `SEND` action. This involves transmitting a request containing the action identifier and the complete message packet. Upon successful processing and storage, the server responds with an 'OK' status, a confirmation message, the unique message ID assigned by the server, and flags indicating if the stored message was encrypted or signed.

**Request:**
```javascript
{
  action: 'SEND',
  data: {
    packet: { /* Message packet structure as described above */ }
  }
}
```

**Response:**
```javascript
{
  status: 'OK', // Or 'ERROR' with details
  message: 'Message delivered successfully',
  messageId: 'hexadecimal-message-id',
  encrypted: true/false,
  signed: true/false
}
```

### 2. RECEIVE

To retrieve messages, a client uses the `RECEIVE` action, specifying the email address for which messages are being requested. The server then returns all messages currently stored for that recipient.

**Request:**
```javascript
{
  action: 'RECEIVE',
  data: {
    email: '(name)%(domain)'
  }
}
```

**Response:**
```javascript
{
  status: 'OK',
  messages: [ /* Array of message packets */ ],
  count: Number // Total number of messages retrieved
}
```

### 3. CHECK

The `CHECK` action allows a client to quickly determine if there are any messages waiting for a particular email address without downloading them. The server responds with a count of pending messages.

**Request:**
```javascript
{
  action: 'CHECK',
  data: {
    email: '(name)%(domain)'
  }
}
```

**Response:**
```javascript
{
  status: 'OK',
  count: Number // Number of messages waiting
}
```

### 4. REGISTER_KEY

For users employing PGP encryption, the `REGISTER_KEY` action allows them to submit their public PGP key to the server. This key is then stored and can be requested by others wishing to send encrypted mail to that user.

**Request:**
```javascript
{
  action: 'REGISTER_KEY',
  data: {
    email: '(name)%(domain)',
    publicKey: 'ASCII-armored PGP public key'
  }
}
```

**Response:**
```javascript
{
  status: 'OK',
  message: 'Public key registered successfully'
}
```

### 5. REQUEST_PUBLIC_KEY

To obtain the public PGP key for a specific email address (for encrypting a message to them or verifying a signature), a client uses the `REQUEST_PUBLIC_KEY` action. The server, if it has the key on record, will return it.

**Request:**
```javascript
{
  action: 'REQUEST_PUBLIC_KEY',
  data: {
    email: '(name)%(domain)'
  }
}
```

**Response:**
```javascript
{
  status: 'OK',
  email: '(name)%(domain)',
  publicKey: 'ASCII-armored PGP public key' // Or an error if not found
}
```

## Security: A Core Tenet of MMTP

Security is a foundational principle of MMTP, woven into its design rather than being an optional overlay. The protocol incorporates several layers of protection to ensure confidential and authentic communication.

**Transport Layer Security (TLS)** provides a secure, encrypted channel for all communication between the client and the server. This safeguards data in transit from eavesdropping and tampering. While TLS usage is configurable, it is enabled by default. The system can even assist by generating self-signed certificates if pre-existing ones are not available, and clients have configurable options for certificate validation strategies.

For ultimate message confidentiality, MMTP supports **PGP End-to-End Encryption**. This powerful mechanism ensures that only the intended recipient, possessing the corresponding private key, can decrypt and read the message content. MMTP typically employs strong RSA 4096-bit keys. Private keys can be further protected with an optional passphrase, and the server can act as a convenient repository or directory for users' public keys.

To address the pervasive issue of spam, MMTP implements the **HashCash proof-of-work algorithm**. Before a message is accepted by the server, the sending client must compute a cryptographic hash that meets a server-defined difficulty (e.g., a certain number of leading zero bits). This small computational task, while trivial for legitimate single messages, becomes a significant deterrent for those attempting to send messages in bulk, thereby making spamming economically unviable.

Finally, **Message Signing** using PGP signatures allows for the verification of message authenticity and integrity. These digital signatures, which are detached from the message content, confirm the sender's identity and provide assurance that the message has not been altered since it was signed. Signatures can be verified even if the message content itself is not encrypted.

## The Journey of an MMTP Message: Communication Flow

The interaction between an MMTP client and server follows a logical sequence to ensure secure and reliable message exchange.

It begins with the client establishing a connection to the server. This connection can be a plain TCP link or, preferably, a secure TLS tunnel. For users intending to leverage PGP for encryption or signing, an initial, one-time step might involve generating their PGP key pair and registering their public key with the MMTP server using the `REGISTER_KEY` action.

Once connected and (if applicable) keys are set up, the client constructs a message packet. This involves populating fields for the sender, recipient, subject, body, and other metadata. If PGP is being used for the message, the client will encrypt the message content using the recipient's public key (obtained via `REQUEST_PUBLIC_KEY` if not already cached). The client may also digitally sign the entire message using its own private PGP key to assert its origin and integrity.

A crucial step before transmission is the generation of a HashCash token. This token serves as a proof-of-work, demonstrating that the client has expended a certain amount of computational effort, which helps to deter spam. An SHA256 hash of the message content is also calculated and included in the packet to allow the server and recipient to verify that the content has not been corrupted or tampered with.

Upon receiving the complete packet, the server performs a series of rigorous validations. It checks the validity of the HashCash token against its current difficulty setting, verifies the integrity of the message content using the provided SHA256 hash, and may perform other checks related to sender/recipient policies or PGP signature verification if a signature is present and the sender's public key is available.

If all these checks pass successfully, the server accepts the message and stores it in the recipient's designated mailbox. Later, the recipient's client can connect to the server and use the `CHECK` or `RECEIVE` actions to query for and retrieve new messages. If a retrieved message was PGP encrypted, the recipient's client uses its private PGP key to decrypt the content. Similarly, if the message was PGP signed, the client can verify the signature using the sender's public key, thereby confirming the message's authenticity and integrity.

## Getting Started with MMTP

Setting up MMTP on your system is a straightforward process. Here’s what you need to know to begin.

### Prerequisites

Before you begin, ensure your system has the following:
*   **Node.js**: Version 12 or higher is recommended for compatibility and performance.
*   **OpenSSL**: This is often used for generating TLS certificates and is typically pre-installed on Linux and macOS systems. Windows users might need to install it separately if they plan to generate their own certificates.

### Installation

To install the necessary dependencies for the MMTP project, navigate to the project's root directory in your terminal and run:

```bash
npm install
```

### Running the Server

To start the MMTP server, execute the following command from the project's root directory:

```bash
npm run start:server
```
You should see log output indicating that the server is listening on the configured ports.

### Running the Client

The project may include a sample client script. To run it, typically you would use a command like:

```bash
npm run start:client
```
This will execute the pre-defined client logic, which might send test messages or interact with the server in other ways.

### Basic Testing

To run basic functionality tests, use:

```bash
npm test
```

### Testing Secure Features

For tests that specifically cover TLS and PGP functionalities, run:

```bash
npm run test:secure
```

## Client Usage in Your Application: An Example

To integrate MMTP communication into your own Node.js applications, you can utilize the provided client module. Here’s an illustrative example demonstrating how to connect to an MMTP server, manage PGP keys, and send a secure, encrypted, and signed message:

```javascript
const MMTPClient = require('./CLIENT/client.js');

async function main() {
  // Initialize the client with configuration options
  const client = new MMTPClient({
    serverHost: 'localhost',    // Address of the MMTP server
    serverPort: 8025,           // Standard (non-TLS) port
    securePort: 8026,           // TLS-secured port
    useTLS: true,               // Prefer TLS for connections
    usePGP: true                // Enable PGP functionalities
  });
  
  try {
    // Establish a secure connection to the server
    await client.connect(true); // 'true' indicates using the secure port (TLS)
    console.log('Successfully connected to the MMTP server via TLS.');
    
    // For a new user, generate PGP keys (typically done once)
    // The client might require a 'keystore' directory or create it.
    // A passphrase for the private key is optional but recommended.
    const userEmail = '(alice)%(example.com)';
    const userName = 'Alice Smith';
    const userPassphrase = 'a-very-strong-passphrase'; // Optional
    
    await client.generateKeys(userEmail, userName, userPassphrase);
    console.log(`PGP keys generated for ${userEmail}.`);
    
    // Register the new public key with the server
    await client.registerPublicKey(userEmail);
    console.log(`Public key for ${userEmail} registered with the server.`);
    
    // Assume Bob is another user. To send an encrypted message to Bob,
    // we first need his public key.
    const recipientEmail = '(bob)%(example.com)';
    // In a real scenario, Bob would have already registered his key.
    // For this example, ensure Bob's key exists on the server or send to Alice for self-test.
    await client.requestPublicKey(recipientEmail); 
    console.log(`Requested public key for ${recipientEmail}.`);
    
    // Compose and send an encrypted and signed message
    const subject = 'Secure Greetings via MMTP';
    const body = 'This message is a demonstration of MMTPs end-to-end encryption and signing capabilities!';
    
    console.log(`Preparing to send mail from ${userEmail} to ${recipientEmail}...`);
    const sendResult = await client.sendMail(userEmail, recipientEmail, subject, body, {
      encrypt: true, // Encrypt the message content
      sign: true     // Sign the message
    });
    
    console.log('Mail sending process completed:', sendResult);
    
  } catch (error) {
    console.error('An error occurred during the MMTP client operations:', error);
  } finally {
    // Always ensure the client disconnects cleanly
    if (client && client.isConnected()) {
      client.disconnect();
      console.log('Disconnected from the MMTP server.');
    }
  }
}

main();
```

## Server Configuration: An Example

Setting up and configuring your MMTP server involves instantiating the server class with your desired operational parameters. Below is a basic configuration example demonstrating common settings:

```javascript
const MMTPServer = require('./SERVER/server.js');

// Define server configuration options
const serverConfig = {
  port: 8025,                         // Port for standard (non-TLS) connections
  securePort: 8026,                   // Port for TLS-secured connections
  useTLS: true,                       // Enable TLS by default
  usePGP: true,                       // Enable PGP related features (key management)
  difficulty: 4,                      // HashCash difficulty (e.g., 4 leading zeros for the hash)
  certPath: './certs/server.cert',    // Path to your TLS certificate file
  keyPath: './certs/server.key',      // Path to your TLS private key file
  keyStorePath: './keystore'          // Directory path for storing user public PGP keys
};

// Create and start the server instance
const server = new MMTPServer(serverConfig);
server.start();

// Implement graceful shutdown for the server
process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down MMTP server gracefully...');
  server.stop();
  process.exit(0);
});
```

## Advantages of MMTP Over Traditional SMTP

MMTP was conceived to offer tangible improvements and a more modern approach compared to long-standing protocols like SMTP. Its design prioritizes simplicity, featuring fewer commands and a more intuitive operational flow. This streamlined nature can ease implementation, debugging, and overall comprehension of the protocol.

Security is a core tenet of MMTP, not an afterthought. Features like TLS for transport encryption, PGP for robust end-to-end privacy, and message integrity checks are integral parts of the protocol, rather than optional extensions that may or may not be implemented or configured correctly in traditional systems.

The integration of the HashCash algorithm provides an inherent mechanism for spam prevention. By requiring a small computational effort from the sender, MMTP makes it significantly more resource-intensive for spammers to send messages in bulk, addressing a common challenge faced by SMTP.

MMTP leverages the JSON format for data exchange. This is more efficient to parse, more aligned with modern web technologies, and generally less verbose than SMTP's text-based command structure. This focus on modern design also extends to privacy, with end-to-end encryption capabilities designed to minimize metadata exposure and protect content confidentiality.

Furthermore, MMTP includes an integrated public key infrastructure. This simplifies the management of cryptographic keys for encryption and signing, making it easier for users and applications to adopt secure communication practices without relying on complex external systems for key distribution.

## Future Directions: Potential Protocol Extensions

While MMTP provides a robust core feature set for secure and efficient email transfer, its design also allows for future enhancements and adaptations. There are several areas where the protocol could be extended to offer even greater functionality.

For instance, support for **multiple recipients** in a single message transaction, currently not a primary feature, could be a valuable addition for group communication. The handling of **attachments** is another area for formalization; while ad-hoc solutions like Base64 encoding within the message body are possible, a standardized approach could improve interoperability and efficiency.

For better conversation tracking and organization, **message threading** capabilities could be introduced, perhaps via a `references` or `in-reply-to` field in the message metadata, similar to existing email standards. The protocol could also be extended to include more explicit **delivery status notifications**, providing senders with feedback on whether a message has been successfully delivered or if errors occurred.

Looking further, integration with established domain verification and anti-spoofing standards such as **DANE (DNS-based Authentication of Named Entities)** or **DKIM (DomainKeys Identified Mail)** could further enhance trust and security within the MMTP ecosystem, providing stronger assurances about the authenticity of sending domains.

## License

This MMTP project is made available under the MIT License. You are encouraged to use, modify, and distribute it in accordance with the license terms.