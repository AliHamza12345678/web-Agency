import { Hono } from 'hono';
import { z } from 'zod';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  type ApiSuccessResponse,
} from '@openagent/core';
import { getDb, tenants, tenantMembers, users } from '@openagent/db';
import { eq, and } from 'drizzle-orm';
import { authMiddleware, requireTenantAccess } from '../middleware/auth.js';

export const tenantsRouter = new Hono();

tenantsRouter.use('*', authMiddleware);

const createTenantSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
});

const updateTenantSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
});

const addMemberSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
});

/**
 * List all workspaces accessible by the current user.
 */
tenantsRouter.get('/', async (c) => {
  const sessionUser = c.get('user');
  const db = getDb();

  const workspaces = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      plan: tenants.plan,
      role: tenantMembers.role,
      createdAt: tenants.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, sessionUser.userId));

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: workspaces,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Create a new workspace/organization.
 */
tenantsRouter.post('/', async (c) => {
  const sessionUser = c.get('user');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const db = getDb();
  const [newTenant] = await db
    .insert(tenants)
    .values({
      name: parsed.data.name.trim(),
      plan: 'free',
    })
    .returning();

  if (!newTenant) {
    throw new Error('Failed to create workspace');
  }

  await db.insert(tenantMembers).values({
    tenantId: newTenant.id,
    userId: sessionUser.userId,
    role: 'owner',
  });

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      ...newTenant,
      role: 'owner',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});

/**
 * Get workspace details.
 */
tenantsRouter.get('/:tenantId', requireTenantAccess('tenant:read'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const role = c.get('tenantRole');
  const db = getDb();

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError('Organization', tenantId);
  }

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      ...tenant,
      currentUserRole: role,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Update workspace name.
 */
tenantsRouter.put('/:tenantId', requireTenantAccess('tenant:update'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const db = getDb();
  const [updated] = await db
    .update(tenants)
    .set({
      name: parsed.data.name.trim(),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Organization', tenantId);
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
 * List workspace members.
 */
tenantsRouter.get('/:tenantId/members', requireTenantAccess('member:list'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const db = getDb();

  const members = await db
    .select({
      id: tenantMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: tenantMembers.role,
      joinedAt: tenantMembers.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .where(eq(tenantMembers.tenantId, tenantId));

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: members,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Add or invite member to workspace.
 */
tenantsRouter.post('/:tenantId/members', requireTenantAccess('member:invite'), async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const db = getDb();
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase().trim()))
    .limit(1);

  if (!targetUser) {
    throw new NotFoundError(`User with email '${parsed.data.email}' was not found. Please ask them to register first.`);
  }

  const [existingMembership] = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, targetUser.id)))
    .limit(1);

  if (existingMembership) {
    throw new ConflictError('User is already a member of this workspace');
  }

  const [newMember] = await db
    .insert(tenantMembers)
    .values({
      tenantId,
      userId: targetUser.id,
      role: parsed.data.role,
    })
    .returning();

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      id: newMember?.id,
      userId: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: newMember?.role,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});
