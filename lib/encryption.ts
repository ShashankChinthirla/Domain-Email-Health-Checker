import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// 1. Enforce strict key existence (No insecure defaults in Prod)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
    throw new Error('FATAL: ENCRYPTION_KEY environment variable is missing.');
}

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'utf-8');

// 2. Enforce strict 32-byte key definition (No weak derivation/padding)
if (keyBuffer.length !== 32) {
    throw new Error(`FATAL: ENCRYPTION_KEY must be exactly 32 bytes. Current length is ${keyBuffer.length} bytes.`);
}

export function encryptApiKey(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // 3. Key Versioning Strategy
    // Prefix 'v1:' allows for future key rotation (e.g. v2 to use KMS or a different env var)
    return `v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedString: string): string {
    try {
        const parts = encryptedString.split(':');

        // Handle backwards compatibility for non-prefixed legacy keys (3 parts) versus new v1 keys (4 parts)
        let ivHex, authTagHex, encryptedText;
        let version = 'legacy';

        if (parts.length === 4 && parts[0] === 'v1') {
            version = 'v1';
            ivHex = parts[1];
            authTagHex = parts[2];
            encryptedText = parts[3];
        } else if (parts.length === 3) {
            ivHex = parts[0];
            authTagHex = parts[1];
            encryptedText = parts[2];
        } else {
            throw new Error('Invalid encrypted text format (must be 3 or 4 colon-separated parts).');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error("Critical Decryption Failure:", error);
        return "";
    }
}
