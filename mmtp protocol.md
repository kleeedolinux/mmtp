# Modern Mail Transfer Protocol (MMTP)

## Abstract

This document specifies the Modern Mail Transfer Protocol (MMTP), a contemporary alternative to traditional electronic mail protocols. MMTP is designed to be lightweight, secure, and privacy-focused, featuring native support for TLS encryption, PGP message security, and integrated anti-spam mechanisms.

## Status of This Memo

This document specifies a proposed standard protocol for the Internet community, and requests discussion and suggestions for improvements.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Protocol Overview](#2-protocol-overview)
3. [Technical Specifications](#3-technical-specifications)
4. [Message Format](#4-message-format)
5. [Connection Establishment](#5-connection-establishment)
6. [Protocol Operations](#6-protocol-operations)
7. [Security Considerations](#7-security-considerations)
8. [Message Tagging System](#8-message-tagging-system)
9. [Implementation Considerations](#9-implementation-considerations)
10. [Examples](#10-examples)
11. [References](#11-references)

## 1. Introduction

Electronic mail (email) has historically relied on protocols developed decades ago, most notably the Simple Mail Transfer Protocol (SMTP). While these protocols have been incrementally enhanced, they remain fundamentally anchored to a different era of Internet usage. The Modern Mail Transfer Protocol (MMTP) offers a complete redesign, built on contemporary principles of efficiency, security, and privacy.

### 1.1. Purpose

The purpose of MMTP is to provide a more efficient, secure, and privacy-oriented framework for electronic mail transmission. It addresses numerous challenges with traditional email protocols, including:

- Complex implementations requiring multiple protocols (SMTP, POP3, IMAP)
- Vulnerability to spam without external systems
- Limited native security mechanisms
- Reliance on plaintext communications
- Cumbersome metadata exposure

### 1.2. Scope

This document specifies:
- The format of MMTP messages
- The procedures for establishing connections
- The operations available to clients and servers
- The security mechanisms included in the protocol
- The message organization through tagging

It does not attempt to replicate every feature of legacy email systems, instead focusing on providing a robust core functionality that can be extended as needed.

### 1.3. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119).

## 2. Protocol Overview

MMTP is a client-server protocol designed for electronic message exchange. It consolidates functions typically spread across multiple protocols (like SMTP, POP3, and IMAP) into a single, coherent system.

### 2.1. Design Principles

MMTP adheres to the following principles:

1. **Simplicity**: Streamlined operations and clear semantics
2. **Security**: Native security mechanisms, including TLS and PGP
3. **Privacy**: End-to-end encryption and minimized metadata exposure
4. **Spam Resistance**: Built-in proof-of-work mechanism
5. **Efficiency**: JSON-based data format optimized for modern systems
6. **Integrity**: Message content verification via cryptographic hashing

### 2.2. Key Features

- **Unique Addressing Format**: Uses `(name)%(domain)` instead of traditional `name@domain`
- **JSON-Based Exchange**: All messages use JSON for structured data exchange
- **HashCash Anti-Spam**: Requires computational proof-of-work for message acceptance
- **Integrated Security**: Native support for TLS and PGP
- **Content Integrity**: SHA-256 hashing for message verification
- **Separated Components**: Clear distinction between client and server roles
- **Public Key Infrastructure**: Built-in mechanics for key management
- **Message Tagging**: Flexible categorization system for message organization

### 2.3. Differences from SMTP

MMTP differs from SMTP in several fundamental ways:

1. **Unified Protocol**: MMTP handles both sending and receiving, unlike the separation of SMTP/POP3/IMAP
2. **JSON vs. Text Commands**: MMTP uses structured JSON instead of SMTP's line-based commands
3. **Built-in Security**: Security is integral to MMTP, not an extension
4. **Anti-Spam Measures**: HashCash is built into the protocol
5. **Stateless Operations**: Session state is minimal, making implementation simpler
6. **Message Tagging**: Native support for message categorization
7. **Addressing Format**: Distinct `(name)%(domain)` format to separate from traditional email

## 3. Technical Specifications

### 3.1. Protocol Transport

MMTP operates over TCP and supports two connection modes:

1. **Standard Connection**: Plain TCP connection, typically on port 8025
2. **Secure Connection**: TLS-encrypted connection, typically on port 8026

Implementations SHOULD prefer secure connections by default.

### 3.2. Data Format

All MMTP communications use JSON (JavaScript Object Notation) for data exchange. This provides:

- Structured, self-describing data
- Widely supported parsing libraries
- Efficiency in both parsing and transmission
- Compatibility with modern web technologies

### 3.3. Address Format

MMTP uses the format `(localpart)%(domain)` for addresses. This differs from the traditional email format to distinguish MMTP addresses from legacy systems.

Examples:
- `(alice)%(example.com)`
- `(support)%(company.org)`
- `(newsletter)%(news.service)`

The format MUST follow this regular expression:
```
/^\([a-zA-Z0-9._-]+\)%\([a-zA-Z0-9.-]+\)$/
```

### 3.4. Anti-Spam Mechanism

MMTP incorporates the HashCash proof-of-work algorithm to deter spam. Before sending a message, clients MUST compute a token that meets a server-defined difficulty.

The HashCash token MUST be included in each message and has the format:
```javascript
{
  token: String,   // "1:difficulty:timestamp:resource::counter:"
  counter: Number  // The value that produces a valid hash
}
```

A valid token produces an SHA-256 hash with a specified number of leading zeros (determined by the server's difficulty setting).

## 4. Message Format

### 4.1. Message Packet Structure

All MMTP messages are formatted as JSON objects with the following structure:

```javascript
{
  meta: {
    type: String,         // 'SEND', 'REPLY', etc.
    messageId: String,    // Unique identifier
    timestamp: Number,    // Unix timestamp (milliseconds)
    hashcashToken: Object, // Anti-spam token
    encrypted: Boolean,   // PGP encryption flag
    signed: Boolean,      // PGP signature flag
    signatureVerified: Boolean, // Signature verification status
    tags: Object          // Message categorization tags
  },
  sender: String,         // Sender address (name)%(domain)
  recipient: String,      // Recipient address (name)%(domain)
  content: {
    // For unencrypted messages:
    subject: String,      // Message subject
    body: String          // Message body
    
    // OR for encrypted messages:
    encrypted: String     // PGP-encrypted content
  },
  verification: {
    messageHash: String,  // SHA-256 hash of content
    signature: String     // Optional PGP signature
  }
}
```

### 4.2. Message Types

The `type` field in the metadata indicates the message purpose:

- `SEND`: Standard message delivery
- `REPLY`: Response to a previous message
- `FORWARD`: Forwarded message from another source

### 4.3. Content Verification

Each message includes a `messageHash` field containing an SHA-256 hash of the `content` object. This allows recipients to verify message integrity.

### 4.4. Encryption and Signing

If PGP encryption is used:
- The original `content` object is encrypted as a whole
- The encrypted data replaces the content with `{ encrypted: String }`
- The `encrypted` flag in metadata is set to `true`

If PGP signing is used:
- A detached signature is created for the `content` object
- The signature is stored in the `verification.signature` field
- The `signed` flag in metadata is set to `true`

## 5. Connection Establishment

### 5.1. Client-Server Connection

MMTP connections follow these steps:

1. Client initiates TCP connection to server (standard or TLS port)
2. Server accepts connection and sends welcome message
3. Client receives welcome message, noting available features
4. Connection is established and ready for operations

### 5.2. Server Welcome Message

Upon connection, the server MUST send a welcome message:

```javascript
{
  status: "OK",
  message: "MMTP Server Ready [optional info]",
  features: {
    tls: Boolean,    // TLS support available
    pgp: Boolean     // PGP support available
  }
}
```

### 5.3. Connection Security

Connections can be:
- **Standard**: Plain TCP with no encryption
- **Secure**: TLS-encrypted

For secure connections, the server MUST provide a valid TLS certificate. Self-signed certificates MAY be used in development environments.

## 6. Protocol Operations

MMTP supports several operations, each initiated by a client request with a specific action.

### 6.1. SEND

The `SEND` action delivers a message to the server for a recipient.

**Request:**
```javascript
{
  action: "SEND",
  data: {
    packet: { /* Message packet */ }
  }
}
```

**Response:**
```javascript
{
  status: "OK",  // Or "ERROR"
  message: "Message delivered successfully",
  messageId: String,
  encrypted: Boolean,
  signed: Boolean
}
```

### 6.2. RECEIVE

The `RECEIVE` action retrieves messages for a specific recipient.

**Request:**
```javascript
{
  action: "RECEIVE",
  data: {
    email: "(name)%(domain)"
  }
}
```

**Response:**
```javascript
{
  status: "OK",
  messages: [ /* Array of message packets */ ],
  count: Number
}
```

### 6.3. CHECK

The `CHECK` action queries for message count without retrieving the messages.

**Request:**
```javascript
{
  action: "CHECK",
  data: {
    email: "(name)%(domain)",
    tagFilters: Object  // Optional
  }
}
```

**Response:**
```javascript
{
  status: "OK",
  count: Number,
  totalCount: Number,
  tagCounts: Object
}
```

### 6.4. REGISTER_KEY

The `REGISTER_KEY` action registers a PGP public key with the server.

**Request:**
```javascript
{
  action: "REGISTER_KEY",
  data: {
    email: "(name)%(domain)",
    publicKey: String  // ASCII-armored PGP public key
  }
}
```

**Response:**
```javascript
{
  status: "OK",
  message: "Public key registered successfully"
}
```

### 6.5. REQUEST_PUBLIC_KEY

The `REQUEST_PUBLIC_KEY` action retrieves a registered public key.

**Request:**
```javascript
{
  action: "REQUEST_PUBLIC_KEY",
  data: {
    email: "(name)%(domain)"
  }
}
```

**Response:**
```javascript
{
  status: "OK",
  email: "(name)%(domain)",
  publicKey: String  // ASCII-armored PGP public key
}
```

### 6.6. RECEIVE_FILTERED

The `RECEIVE_FILTERED` action retrieves messages matching specific tag criteria.

**Request:**
```javascript
{
  action: "RECEIVE_FILTERED",
  data: {
    email: "(name)%(domain)",
    tagFilters: Object
  }
}
```

**Response:**
```javascript
{
  status: "OK",
  messages: Array,
  count: Number,
  tagFilters: Object
}
```

### 6.7. GET_TAG_CATEGORIES

The `GET_TAG_CATEGORIES` action retrieves available tag categories.

**Request:**
```javascript
{
  action: "GET_TAG_CATEGORIES",
  data: {}
}
```

**Response:**
```javascript
{
  status: "OK",
  tagCategories: Object
}
```

### 6.8. Error Handling

All operations may return error responses:

```javascript
{
  status: "ERROR",
  message: String  // Error description
}
```

Common error conditions include:
- Invalid email format
- Message integrity failure
- HashCash verification failure
- Missing or invalid PGP keys
- Rate limiting or resource constraints

## 7. Security Considerations

### 7.1. Transport Security

MMTP servers SHOULD support TLS and clients SHOULD prefer TLS connections. The recommended configuration includes:

- TLS 1.2 or higher
- Strong cipher suites (e.g., ECDHE-RSA-AES256-GCM-SHA384)
- Certificate validation options for clients

### 7.2. Message Security

End-to-end encryption is achieved through OpenPGP:

- RSA 4096-bit keys are RECOMMENDED
- Private keys SHOULD be protected with a passphrase
- Encrypted messages can only be decrypted by intended recipients
- Message signing provides authentication and integrity verification

### 7.3. Anti-Spam Measures

The HashCash mechanism requires:

- Computational work for each message
- Server-defined difficulty level (recommended: 4-6 zeros)
- Resource validation on server before accepting messages

### 7.4. Metadata Protection

To enhance privacy:
- Connection metadata SHOULD be minimized
- TLS SHOULD be used to protect metadata in transit
- End-to-end encryption SHOULD be used for message content

## 8. Message Tagging System

MMTP includes a tagging system for message categorization and filtering.

### 8.1. Tag Structure

Tags are organized into categories, each containing an array of values:

```javascript
tags: {
  priority: Array,     // e.g. ["high", "medium", "low"]
  category: Array,     // e.g. ["personal", "work", "promotion"]
  status: Array,       // e.g. ["urgent", "important"]
  custom: Array        // User-defined tags
}
```

### 8.2. Predefined Categories

The protocol defines standard categories:

- **priority**: Indicates message urgency
  - Values: "high", "medium", "low"
- **category**: General classification
  - Values: "personal", "work", "finance", "social", "promotion", "coupon", "shop", "notification"
- **status**: Specific status indicators
  - Values: "urgent", "important", "information", "action_required"
- **custom**: User or application-defined tags (arbitrary strings)

### 8.3. Tag Filtering

Clients can filter messages based on tags:

```javascript
tagFilters: {
  category: ["promotion", "coupon"],  // Messages with any of these categories
  priority: ["high"]                  // AND with high priority
}
```

A message matches a filter if it contains at least one tag from each specified category.

## 9. Implementation Considerations

### 9.1. Server Implementation

Servers SHOULD:
- Enforce HashCash difficulty appropriate to their resources
- Implement reasonable rate limiting
- Provide secure key storage if supporting PGP
- Enforce message size limits (recommended: 10MB)
- Support TLS for secure connections
- Implement proper error handling and logging

### 9.2. Client Implementation

Clients SHOULD:
- Prefer secure connections (TLS)
- Cache public keys when using PGP
- Implement user-friendly key management
- Provide meaningful error messages
- Support tag-based message organization
- Implement a reasonable HashCash computation timeout

### 9.3. Scalability

For high-volume scenarios:
- Server implementations MAY use load balancing
- Database backends SHOULD be considered for message storage
- The HashCash difficulty MAY be dynamically adjusted

## 10. Examples

### 10.1. Basic Message Delivery

```javascript
// Client request
{
  "action": "SEND",
  "data": {
    "packet": {
      "meta": {
        "type": "SEND",
        "messageId": "abc123def456",
        "timestamp": 1625849600000,
        "hashcashToken": {
          "token": "1:4:1625849600000:(alice)%(example.com):(bob)%(example.com)::1234:",
          "counter": 1234
        },
        "encrypted": false,
        "signed": false,
        "tags": {
          "priority": ["medium"],
          "category": ["personal"]
        }
      },
      "sender": "(alice)%(example.com)",
      "recipient": "(bob)%(example.com)",
      "content": {
        "subject": "Hello",
        "body": "Hello, this is a test message."
      },
      "verification": {
        "messageHash": "a1b2c3d4e5f6..."
      }
    }
  }
}

// Server response
{
  "status": "OK",
  "message": "Message delivered successfully",
  "messageId": "abc123def456",
  "encrypted": false,
  "signed": false
}
```

### 10.2. Encrypted Message

```javascript
// Client request (simplified, some fields omitted for brevity)
{
  "action": "SEND",
  "data": {
    "packet": {
      "meta": {
        "type": "SEND",
        "messageId": "abc123def456",
        "timestamp": 1625849600000,
        "hashcashToken": { /* ... */ },
        "encrypted": true,
        "signed": true,
        "tags": {
          "priority": ["high"],
          "category": ["work"],
          "status": ["urgent"]
        }
      },
      "sender": "(alice)%(example.com)",
      "recipient": "(bob)%(example.com)",
      "content": {
        "encrypted": "-----BEGIN PGP MESSAGE-----\n...\n-----END PGP MESSAGE-----"
      },
      "verification": {
        "messageHash": "a1b2c3d4e5f6...",
        "signature": "-----BEGIN PGP SIGNATURE-----\n...\n-----END PGP SIGNATURE-----"
      }
    }
  }
}
```

### 10.3. Filtered Message Retrieval

```javascript
// Client request
{
  "action": "RECEIVE_FILTERED",
  "data": {
    "email": "(bob)%(example.com)",
    "tagFilters": {
      "category": ["promotion", "coupon"],
      "priority": ["high"]
    }
  }
}

// Server response
{
  "status": "OK",
  "messages": [
    /* Only messages matching the tag filters */
  ],
  "count": 3,
  "tagFilters": {
    "category": ["promotion", "coupon"],
    "priority": ["high"]
  }
}
```

## 11. References

1. RFC 2119 - Key words for use in RFCs to Indicate Requirement Levels
2. RFC 4880 - OpenPGP Message Format
3. RFC 8259 - The JavaScript Object Notation (JSON) Data Interchange Format
4. RFC 7525 - Recommendations for Secure Use of TLS and DTLS
5. HashCash - Proof-of-Work System (http://www.hashcash.org/papers/hashcash.pdf)

## Authors' Addresses

MMTP Working Group 