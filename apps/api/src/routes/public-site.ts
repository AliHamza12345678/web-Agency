import { Hono } from 'hono';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  type ApiSuccessResponse,
  type PublicSiteConfig,
} from '@openagent/core';
import { getDb, sites } from '@openagent/db';
import { eq } from 'drizzle-orm';

export const publicSiteRouter = new Hono();

interface CachedSiteRecord {
  site: {
    id: string;
    publicKey: string;
    name: string;
    branding: any;
    publishedConfiguration: any;
    publishedVersion: number;
    allowedOrigins: string[] | null;
  };
  expiresAt: number;
}

const siteConfigCache = new Map<string, CachedSiteRecord>();
const CACHE_TTL_MS = 60 * 1000; // 60s cache TTL

/**
 * Invalidate cached public site configs on configuration updates.
 */
export function invalidatePublicSiteConfigCache(publicKey?: string) {
  if (publicKey) {
    siteConfigCache.delete(publicKey);
  } else {
    siteConfigCache.clear();
  }
}

/**
 * Public widget handshake endpoint:
 * Fetches site branding and public config using public key.
 * Enforces allowed origin validation against request Origin header.
 * Strictly avoids leaking backend credentials, tenant IDs, or private prompts.
 * Uses bounded in-memory cache with safe TTL to protect database connection pools.
 */
publicSiteRouter.get('/config', async (c) => {
  const publicKey = c.req.query('publicKey');
  if (!publicKey || !publicKey.startsWith('pk_live_')) {
    throw new ValidationError('A valid publicKey (pk_live_...) is required');
  }

  const now = Date.now();
  let site: CachedSiteRecord['site'] | undefined;

  const cached = siteConfigCache.get(publicKey);
  if (cached && cached.expiresAt > now) {
    site = cached.site;
  } else {
    const db = getDb();
    const [found] = await db
      .select({
        id: sites.id,
        publicKey: sites.publicKey,
        name: sites.name,
        branding: sites.branding,
        publishedConfiguration: sites.publishedConfiguration,
        publishedVersion: sites.publishedVersion,
        allowedOrigins: sites.allowedOrigins,
      })
      .from(sites)
      .where(eq(sites.publicKey, publicKey))
      .limit(1);

    if (!found) {
      throw new NotFoundError('Site with specified public key was not found');
    }

    site = found;
    siteConfigCache.set(publicKey, {
      site: found,
      expiresAt: now + CACHE_TTL_MS,
    });
  }

  // Check allowed origins if configured
  const requestOrigin = c.req.header('origin');
  if (site.allowedOrigins && site.allowedOrigins.length > 0 && requestOrigin) {
    const isAllowed = site.allowedOrigins.some((allowed) => {
      if (allowed === '*' || allowed === requestOrigin) return true;
      try {
        const allowedHost = new URL(allowed).host;
        const reqHost = new URL(requestOrigin).host;
        return allowedHost === reqHost;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      throw new ForbiddenError(`Origin '${requestOrigin}' is not permitted to embed this chat assistant`);
    }
  }

  const publicConfig: PublicSiteConfig = {
    siteId: site.id,
    publicKey: site.publicKey,
    name: site.name,
    branding: (site.branding || {}) as any,
    publishedVersion: site.publishedVersion || 1,
    studioConfig:
      site.publishedConfiguration && Object.keys(site.publishedConfiguration).length > 0
        ? (site.publishedConfiguration as any)
        : undefined,
  };

  const response: ApiSuccessResponse<PublicSiteConfig> = {
    success: true,
    data: publicConfig,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
  c.header('Vary', 'Origin');

  return c.json(response, 200);
});
