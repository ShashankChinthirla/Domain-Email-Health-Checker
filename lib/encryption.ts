import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// The encryption key must be securely stored in Vercel/environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_insecure_dev_key_must_chg';

// Ensure the key buffer is exactly 32 bytes for aes-256-gcm
const keyBuffer = Buffer.from(
    ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32),
    'utf-8'
);

export function encryptApiKey(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encryptedText
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encryptedString: string): string {
    try {
        const parts = encryptedString.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted text format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = parts[2];

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        return "";
    }
}
