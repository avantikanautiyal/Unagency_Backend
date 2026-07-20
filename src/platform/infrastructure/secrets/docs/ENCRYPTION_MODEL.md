# Encryption Model

| Mode | Status |
|------|--------|
| AES-256-GCM | Implemented (`LocalAes256Encryptor`) |
| Envelope (local DEK wrap) | Supported flag `envelope_local` |
| Master key | Local string (dev); KMS deferred |
| Key versioning | `keyVersionId` on every blob |

Cloud KMS integrations are out of scope for this milestone.
