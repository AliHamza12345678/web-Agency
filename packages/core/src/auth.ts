import crypto from 'crypto';
import { UnauthorizedError } from './errors.js';

// ============================================================================
// Password Hashing with Scrypt & Timing-Safe Verification
// ============================================================================

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

/**
 * Hashes a plaintext password using crypto.scrypt with a secure random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const salt = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const salt = parts[1]!;
  const originalKeyHex = parts[2]!;
  const originalBuffer = Buffer.from(originalKeyHex, 'hex');

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        if (derivedKey.length !== originalBuffer.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(derivedKey, originalBuffer));
      } catch {
        resolve(false);
      }
    });
  });
}

// ============================================================================
// JWT Session Token Generation & Verification (HMAC-SHA256)
// ============================================================================

export interface UserSessionPayload {
  userId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Signs a JWT using HMAC-SHA256 with an expiration timestamp.
 */
export function signJwt<T extends Record<string, unknown>>(
  payload: T,
  secret: string,
  expiresInSeconds = 86400 // 24 hours
): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 JWT, enforcing expiration and signature integrity.
 */
export function verifyJwt<T>(token: string, secret: string): T {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Invalid token format');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed authorization token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature!);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new UnauthorizedError('Invalid token signature');
  }

  let payload: any;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload!));
  } catch {
    throw new UnauthorizedError('Invalid token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && typeof payload.exp === 'number' && now > payload.exp) {
    throw new UnauthorizedError('Token has expired');
  }

  return payload as T;
}
