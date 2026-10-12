import type { MiddlewareHandler } from 'hono';
import { createHash } from 'crypto';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  keyGenerator?: (c: any) => string;
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, WindowBucket>();
const IP_SALT = process.env.RATE_LIMIT_SALT || 'openagent_default_ip_salt_2026';

// Periodic memory garbage collection every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryStore.entries()) {
    if (bucket.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

/**
 * Anonymize client IP address with HMAC salt for privacy compliance
 */
export function anonymizeIp(ip: string): string {
  return createHash('sha256')
    .update(ip + IP_SALT)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extract best-effort client IP from proxy and direct connection headers
 */
export function getClientIp(c: any): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return c.req.header('x-real-ip') || '127.0.0.1';
}

/**
 * Factory for sliding-window rate limit middleware
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = config;

  return async (c, next) => {
    const rawIp = getClientIp(c);
    const anonIp = anonymizeIp(rawIp);
    const customKey = config.keyGenerator ? config.keyGenerator(c) : anonIp;
    const storeKey = `${keyPrefix}:${customKey}`;

    const now = Date.now();
    let bucket = memoryStore.get(storeKey);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      memoryStore.set(storeKey, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      c.header('Retry-After', String(resetSeconds));
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Please wait ${resetSeconds}s before retrying.`,
            retryAfterSeconds: resetSeconds,
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        },
        429
      );
    }

    return next();
  };
}

/**
 * Reset memory store (used by test suites)
 */
export function resetRateLimitStore(): void {
  memoryStore.clear();
}
