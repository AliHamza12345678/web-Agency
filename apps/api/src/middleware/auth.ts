import type { MiddlewareHandler } from 'hono';
import { verifyJwt, UnauthorizedError, ForbiddenError, hasPermission, type UserSessionPayload, type Permission, type TenantRole } from '@openagent/core';
import { getDb, tenantMembers } from '@openagent/db';
import { eq, and } from 'drizzle-orm';

declare module 'hono' {
  interface ContextVariableMap {
    user: UserSessionPayload;
    tenantId: string;
    tenantRole: TenantRole;
  }
}

/**
 * Authentication Middleware: Validates Bearer JWT in Authorization header.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const token = authHeader.substring(7).trim();
  const jwtSecret = process.env.JWT_SECRET || 'fallback_development_secret_only';

  try {
    const payload = verifyJwt<UserSessionPayload>(token, jwtSecret);
    c.set('user', payload);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError('Invalid authorization token');
  }

  await next();
};

/**
 * Tenant Authorization Guard:
 * 1. Resolves :tenantId from route params.
 * 2. Verifies the authenticated user is a verified member of that tenant.
 * 3. Checks if the member's role has the requested permission.
 * 4. Super administrators automatically bypass tenant-level role restrictions.
 */
export function requireTenantAccess(permission?: Permission): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    const tenantId = c.req.param('tenantId');
    if (!tenantId) {
      throw new ForbiddenError('Tenant ID is required for this operation');
    }

    // Super admin bypass
    if (user.isSuperAdmin) {
      c.set('tenantId', tenantId);
      c.set('tenantRole', 'owner');
      return await next();
    }

    const db = getDb();
    const membership = await db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, user.userId)))
      .limit(1);

    if (membership.length === 0 || !membership[0]) {
      throw new ForbiddenError('You do not have access to this organization');
    }

    const role = membership[0].role as TenantRole;

    if (permission && !hasPermission(role, permission, false)) {
      throw new ForbiddenError(`Insufficient permissions. Required: ${permission}`);
    }

    c.set('tenantId', tenantId);
    c.set('tenantRole', role);

    await next();
  };
}
