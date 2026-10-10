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

/**
 * Public widget handshake endpoint:
 * Fetches site branding and public config using public key.
 * Enforces allowed origin validation against request Origin header.
 * Strictly avoids leaking backend credentials, tenant IDs, or private prompts.
 */
publicSiteRouter.get('/config', async (c) => {
  const publicKey = c.req.query('publicKey');
  if (!publicKey || !publicKey.startsWith('pk_live_')) {
    throw new ValidationError('A valid publicKey (pk_live_...) is required');
  }

  const db = getDb();
  const [site] = await db
    .select({
      id: sites.id,
      publicKey: sites.publicKey,
      name: sites.name,
      branding: sites.branding,
      allowedOrigins: sites.allowedOrigins,
    })
    .from(sites)
    .where(eq(sites.publicKey, publicKey))
    .limit(1);

  if (!site) {
    throw new NotFoundError('Site with specified public key was not found');
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
  };

  const response: ApiSuccessResponse<PublicSiteConfig> = {
    success: true,
    data: publicConfig,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
