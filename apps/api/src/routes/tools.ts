import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@openagent/core';
import {
  getDb,
  sites,
  siteIntegrations,
  toolAuditLogs,
  pendingConfirmations,
} from '@openagent/db';
import {
  SafeToolExecutor,
  ToolRegistry,
  type IntegrationStatus,
} from '@openagent/tools';
import { authMiddleware, requireTenantAccess } from '../middleware/auth.js';

export const toolsRouter = new Hono();
export const adminToolsRouter = new Hono();

const executor = new SafeToolExecutor();
const registry = ToolRegistry.getInstance();

const executeRequestSchema = z.object({
  siteId: z.string().min(1, 'Site identifier / public key is required'),
  toolId: z.string().min(1, 'Tool ID is required'),
  parameters: z.record(z.any()).default({}),
  conversationId: z.string().optional(),
  visitorId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const confirmRequestSchema = z.object({
  siteId: z.string().min(1, 'Site identifier is required'),
  confirmationToken: z.string().min(1, 'Confirmation token is required'),
  confirmed: z.boolean(),
  visitorId: z.string().optional(),
});

/**
 * Helper to resolve site by either UUID id or publicKey, with origin check
 */
async function resolveSiteAndVerifyOrigin(c: any, siteIdentifier: string) {
  const db = getDb();
  let [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.publicKey, siteIdentifier))
    .limit(1);

  if (!site) {
    [site] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, siteIdentifier))
      .limit(1);
  }

  if (!site) {
    throw new NotFoundError('Website chatbot not found for the provided identifier');
  }

  // Origin verification
  const requestOrigin = c.req.header('origin');
  if (site.allowedOrigins && site.allowedOrigins.length > 0 && requestOrigin) {
    const isAllowed = site.allowedOrigins.some((allowed: string) => {
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
      throw new ForbiddenError(`Origin '${requestOrigin}' is not permitted to execute tools for this website`);
    }
  }

  return site;
}

// ============================================================================
// Public / Widget Tool Execution Routes (/api/v1/tools)
// ============================================================================

/**
 * POST /api/v1/tools/execute
 * Safely executes an authorized tool call on behalf of the chatbot or visitor.
 */
toolsRouter.post('/execute', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = executeRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { siteId, toolId, parameters, conversationId, visitorId, idempotencyKey } = parsed.data;
  const site = await resolveSiteAndVerifyOrigin(c, siteId);
  const db = getDb();

  // Load configured integrations from DB for this site
  const configuredIntegrations = await db
    .select()
    .from(siteIntegrations)
    .where(eq(siteIntegrations.siteId, site.id))
    .catch(() => []);

  // Determine allowed tool IDs
  const disabledTools = new Set(
    configuredIntegrations.filter((i: any) => i.enabled === false).map((i: any) => i.toolId)
  );

  const siteMetadata = (site.branding as any) || {};
  const toolConfigRow = configuredIntegrations.find((i: any) => i.toolId === toolId);
  const toolConfig = {
    ...siteMetadata,
    ...(toolConfigRow?.config || {}),
  };

  // If tool is explicitly disabled in DB, reject it
  if (disabledTools.has(toolId)) {
    return c.json(
      {
        success: false,
        toolId,
        error: {
          code: 'TOOL_UNAUTHORIZED',
          message: `Tool '${toolId}' is disabled on website '${site.name}'.`,
          retryable: false,
        },
      },
      403
    );
  }

  const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';

  const result = await executor.execute({
    toolId,
    parameters,
    context: {
      siteId: site.id,
      tenantId: site.tenantId,
      conversationId,
      visitorId,
      db,
      config: toolConfig,
      idempotencyKey,
      ipAddress: clientIp,
    },
  });

  const statusCode = result.success ? 200 : result.pendingConfirmation ? 202 : 400;
  return c.json(result, statusCode);
});

/**
 * POST /api/v1/tools/confirm
 * Confirms or cancels a pending consequential action.
 */
toolsRouter.post('/confirm', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { siteId, confirmationToken, confirmed, visitorId } = parsed.data;
  const site = await resolveSiteAndVerifyOrigin(c, siteId);
  const db = getDb();

  // Retrieve confirmation token record
  const [record] = await db
    .select()
    .from(pendingConfirmations)
    .where(
      and(
        eq(pendingConfirmations.id, confirmationToken),
        eq(pendingConfirmations.siteId, site.id)
      )
    )
    .limit(1);

  if (!record) {
    throw new NotFoundError('Pending confirmation token not found or already processed');
  }

  if (record.status !== 'pending') {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_TOOL_INPUT',
          message: `Action has already been ${record.status}.`,
          retryable: false,
        },
      },
      400
    );
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await db
      .update(pendingConfirmations)
      .set({ status: 'expired' })
      .where(eq(pendingConfirmations.id, confirmationToken));

    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Confirmation token has expired. Please initiate the request again.',
          retryable: false,
        },
      },
      410
    );
  }

  if (!confirmed) {
    await db
      .update(pendingConfirmations)
      .set({ status: 'cancelled' })
      .where(eq(pendingConfirmations.id, confirmationToken));

    return c.json({
      success: true,
      status: 'cancelled',
      message: `Action '${record.toolName}' was cancelled by the visitor.`,
    });
  }

  // Action is confirmed! Execute with isConfirmed: true
  const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
  const siteMetadata = (site.branding as any) || {};

  const result = await executor.execute({
    toolId: record.toolName,
    parameters: record.payload as Record<string, any>,
    context: {
      siteId: site.id,
      tenantId: site.tenantId,
      visitorId: visitorId || record.visitorId,
      db,
      config: siteMetadata,
      isConfirmed: true, // Affirmative confirmation supplied!
      confirmationToken,
      idempotencyKey: record.idempotencyKey || undefined,
      ipAddress: clientIp,
    },
  });

  if (result.success) {
    await db
      .update(pendingConfirmations)
      .set({ status: 'confirmed' })
      .where(eq(pendingConfirmations.id, confirmationToken));
  }

  return c.json(result);
});

/**
 * GET /api/v1/tools/public/status
 * Public feature discovery endpoint for the website widget.
 */
toolsRouter.get('/public/status', async (c) => {
  const publicKey = c.req.query('publicKey');
  if (!publicKey) {
    throw new ValidationError('A valid publicKey is required');
  }

  const site = await resolveSiteAndVerifyOrigin(c, publicKey);
  const db = getDb();

  const configs = await db
    .select()
    .from(siteIntegrations)
    .where(eq(siteIntegrations.siteId, site.id))
    .catch(() => []);

  const statuses = registry.getSiteIntegrationStatuses(configs as any, (site.branding as any) || {});

  return c.json({
    success: true,
    data: {
      siteName: site.name,
      tools: statuses.map((s: any) => ({
        toolId: s.toolId,
        name: s.name,
        enabled: s.enabled,
        status: s.status,
      })),
    },
  });
});

// ============================================================================
// Protected Admin Integration Routes (/api/v1/admin/tenants)
// ============================================================================

adminToolsRouter.use('*', authMiddleware);

/**
 * GET /api/v1/admin/tenants/:tenantId/sites/:siteId/integrations
 * Retrieves all tools and current configuration statuses for an admin.
 */
adminToolsRouter.get(
  '/:tenantId/sites/:siteId/integrations',
  requireTenantAccess('site:read'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const db = getDb();

    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) {
      throw new NotFoundError('Site not found');
    }

    const configs = await db
      .select()
      .from(siteIntegrations)
      .where(eq(siteIntegrations.siteId, siteId))
      .catch(() => []);

    const statuses: IntegrationStatus[] = registry.getSiteIntegrationStatuses(
      configs as any,
      (site.branding as any) || {}
    );

    return c.json({
      success: true,
      data: statuses,
    });
  }
);

/**
 * PUT /api/v1/admin/tenants/:tenantId/sites/:siteId/integrations
 * Updates or toggles a tool integration for a website.
 */
adminToolsRouter.put(
  '/:tenantId/sites/:siteId/integrations',
  requireTenantAccess('site:update'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const body = await c.req.json().catch(() => {
      throw new ValidationError('Malformed JSON payload');
    });

    const updateSchema = z.object({
      toolId: z.string().min(1),
      enabled: z.boolean(),
      requiresConfirmation: z.boolean().optional(),
      config: z.record(z.any()).optional().default({}),
    });

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation error', parsed.error.issues);
    }

    const { toolId, enabled, requiresConfirmation = false, config } = parsed.data;
    const db = getDb();

    // Upsert integration configuration
    const [existing] = await db
      .select()
      .from(siteIntegrations)
      .where(
        and(
          eq(siteIntegrations.siteId, siteId),
          eq(siteIntegrations.toolId, toolId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(siteIntegrations)
        .set({
          enabled,
          requiresConfirmation,
          config,
          updatedAt: new Date(),
        })
        .where(eq(siteIntegrations.id, existing.id));
    } else {
      await db.insert(siteIntegrations).values({
        siteId,
        toolId,
        enabled,
        requiresConfirmation,
        config,
      });
    }

    return c.json({
      success: true,
      message: `Integration '${toolId}' updated successfully`,
    });
  }
);

/**
 * GET /api/v1/admin/tenants/:tenantId/sites/:siteId/tools/audit-logs
 * Retrieves security and execution audit logs for a website's tool calls.
 */
adminToolsRouter.get(
  '/:tenantId/sites/:siteId/tools/audit-logs',
  requireTenantAccess('site:read'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const limit = Math.min(Number(c.req.query('limit')) || 25, 100);
    const toolName = c.req.query('toolName');
    const db = getDb();

    let query = db
      .select()
      .from(toolAuditLogs)
      .where(eq(toolAuditLogs.siteId, siteId))
      .orderBy(desc(toolAuditLogs.createdAt))
      .limit(limit);

    if (toolName) {
      query = db
        .select()
        .from(toolAuditLogs)
        .where(
          and(
            eq(toolAuditLogs.siteId, siteId),
            eq(toolAuditLogs.toolName, toolName)
          )
        )
        .orderBy(desc(toolAuditLogs.createdAt))
        .limit(limit);
    }

    const logs = await query.catch(() => []);

    return c.json({
      success: true,
      data: logs,
    });
  }
);
