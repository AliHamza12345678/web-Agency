import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import {
  ValidationError,
  NotFoundError,
  siteBrandingSchema,
  type ApiSuccessResponse,
} from '@openagent/core';
import { getDb, sites, documents, conversations } from '@openagent/db';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { authMiddleware, requireTenantAccess } from '../middleware/auth.js';

export const sitesRouter = new Hono();

sitesRouter.use('*', authMiddleware);

const createSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100),
  allowedOrigins: z.array(z.string().url('Must be a valid URL (e.g. https://example.com)')).default([]),
  systemPrompt: z.string().max(4000).optional(),
  branding: siteBrandingSchema.optional(),
  retentionDays: z.coerce.number().int().min(1).max(365).default(30),
});

const updateSiteSchema = createSiteSchema.partial();

/**
 * List sites under an organization with optional search and usage metrics.
 */
sitesRouter.get('/:tenantId/sites', requireTenantAccess('site:read'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const query = c.req.query('q');
  const db = getDb();

  let conditions = eq(sites.tenantId, tenantId);
  if (query && query.trim().length > 0) {
    conditions = and(conditions, ilike(sites.name, `%${query.trim()}%`)) as any;
  }

  const siteList = await db
    .select({
      id: sites.id,
      tenantId: sites.tenantId,
      name: sites.name,
      publicKey: sites.publicKey,
      allowedOrigins: sites.allowedOrigins,
      branding: sites.branding,
      systemPrompt: sites.systemPrompt,
      retentionDays: sites.retentionDays,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
    })
    .from(sites)
    .where(conditions)
    .orderBy(sites.createdAt);

  // Fetch quick metrics for each site
  const siteIds = siteList.map((s: any) => s.id);
  const metricsMap: Record<string, { docsCount: number; convsCount: number }> = {};

  if (siteIds.length > 0) {
    const docCounts = await db
      .select({
        siteId: documents.siteId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(documents)
      .where(sql`${documents.siteId} IN ${siteIds}`)
      .groupBy(documents.siteId);

    const convCounts = await db
      .select({
        siteId: conversations.siteId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(conversations)
      .where(sql`${conversations.siteId} IN ${siteIds}`)
      .groupBy(conversations.siteId);

    for (const d of docCounts) {
      metricsMap[d.siteId] = { ...(metricsMap[d.siteId] || { docsCount: 0, convsCount: 0 }), docsCount: d.count };
    }
    for (const conv of convCounts) {
      metricsMap[conv.siteId] = { ...(metricsMap[conv.siteId] || { docsCount: 0, convsCount: 0 }), convsCount: conv.count };
    }
  }

  const result = siteList.map((s: any) => ({
    ...s,
    stats: metricsMap[s.id] || { docsCount: 0, convsCount: 0 },
  }));

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: result,
    meta: {
      total: result.length,
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Create a new website chatbot under an organization.
 */
sitesRouter.post('/:tenantId/sites', requireTenantAccess('site:create'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = createSiteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const db = getDb();
  const publicKey = `pk_live_${crypto.randomBytes(16).toString('hex')}`;

  const siteData = parsed.data as any;
  const [newSite] = await db
    .insert(sites)
    .values({
      tenantId,
      name: String(siteData.name).trim(),
      publicKey,
      allowedOrigins: siteData.allowedOrigins,
      systemPrompt: siteData.systemPrompt,
      branding: siteData.branding || {},
      retentionDays: siteData.retentionDays,
    })
    .returning();

  if (!newSite) {
    throw new Error('Failed to create site');
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: newSite,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});

/**
 * Retrieve a specific website chatbot's full configuration (IDOR protected).
 */
sitesRouter.get('/:tenantId/sites/:siteId', requireTenantAccess('site:read'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const siteId = c.req.param('siteId');
  const db = getDb();

  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);

  if (!site) {
    throw new NotFoundError('Site', siteId);
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: site,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Update website chatbot configuration.
 */
sitesRouter.put('/:tenantId/sites/:siteId', requireTenantAccess('site:update'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const siteId = c.req.param('siteId');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = updateSiteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const db = getDb();

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  const updateData = parsed.data as any;
  if (typeof updateData.name === 'string') updateValues.name = updateData.name.trim();
  if (updateData.allowedOrigins !== undefined) updateValues.allowedOrigins = updateData.allowedOrigins;
  if (updateData.systemPrompt !== undefined) updateValues.systemPrompt = updateData.systemPrompt;
  if (updateData.branding !== undefined) updateValues.branding = updateData.branding;
  if (updateData.retentionDays !== undefined) updateValues.retentionDays = updateData.retentionDays;

  const [updated] = await db
    .update(sites)
    .set(updateValues)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .returning();

  if (!updated) {
    throw new NotFoundError('Site', siteId);
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: updated,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Delete a website chatbot (Requires 'site:delete').
 */
sitesRouter.delete('/:tenantId/sites/:siteId', requireTenantAccess('site:delete'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const siteId = c.req.param('siteId');
  const db = getDb();

  const [deleted] = await db
    .delete(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .returning();

  if (!deleted) {
    throw new NotFoundError('Site', siteId);
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: { message: `Site '${deleted.name}' deleted successfully` },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Rotate public widget key.
 */
sitesRouter.post('/:tenantId/sites/:siteId/regenerate-key', requireTenantAccess('site:regenerate_key'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const siteId = c.req.param('siteId');
  const db = getDb();

  const newPublicKey = `pk_live_${crypto.randomBytes(16).toString('hex')}`;

  const [updated] = await db
    .update(sites)
    .set({
      publicKey: newPublicKey,
      updatedAt: new Date(),
    })
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .returning();

  if (!updated) {
    throw new NotFoundError('Site', siteId);
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      siteId: updated.id,
      publicKey: updated.publicKey,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
