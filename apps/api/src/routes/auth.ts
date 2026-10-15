import { Hono } from 'hono';
import { z } from 'zod';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  ValidationError,
  UnauthorizedError,
  ConflictError,
  ForbiddenError,
  type ApiSuccessResponse,
} from '@openagent/core';
import { getDb, users, tenants, tenantMembers } from '@openagent/db';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

export const authRouter = new Hono();

/**
 * Public authentication settings check (whether public signups are allowed)
 */
authRouter.get('/config', (c) => {
  const response: ApiSuccessResponse<{ allowRegistration: boolean }> = {
    success: true,
    data: {
      allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  return c.json(response);
});

const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(1, 'Name is required'),
  organizationName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Register a new platform administrator or tenant owner.
 */
authRouter.post('/register', async (c) => {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    throw new ForbiddenError('Public registrations are closed. This dashboard is restricted exclusively to Web Agency administrators.');
  }

  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  if (body && typeof body.email === 'string') {
    let emailStr = body.email.trim();
    if (emailStr.endsWith('@gmailcom')) {
      emailStr = emailStr.replace(/@gmailcom$/, '@gmail.com');
    } else if (emailStr.endsWith('@yahoocom')) {
      emailStr = emailStr.replace(/@yahoocom$/, '@yahoo.com');
    } else if (emailStr.endsWith('@hotmailcom')) {
      emailStr = emailStr.replace(/@hotmailcom$/, '@hotmail.com');
    } else if (emailStr.endsWith('@outlookcom')) {
      emailStr = emailStr.replace(/@outlookcom$/, '@outlook.com');
    }
    body.email = emailStr;
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { email, password, name, organizationName } = parsed.data;
  const db = getDb();

  // Check existing user
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('A user with this email address already exists');
  }

  const passwordHash = await hashPassword(password);
  const orgName = organizationName || `${name.trim()}'s Workspace`;

  // Create User, Tenant, and Membership
  const [newUser] = await db
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
    })
    .returning();

  if (!newUser) {
    throw new Error('Failed to create user');
  }

  const [newTenant] = await db
    .insert(tenants)
    .values({
      name: orgName,
      plan: 'free',
    })
    .returning();

  if (!newTenant) {
    throw new Error('Failed to create organization');
  }

  await db.insert(tenantMembers).values({
    tenantId: newTenant.id,
    userId: newUser.id,
    role: 'owner',
  });

  const jwtSecret = process.env.JWT_SECRET || 'fallback_development_secret_only';
  const token = signJwt(
    {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      isSuperAdmin: newUser.isSuperAdmin,
    },
    jwtSecret
  );

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        isSuperAdmin: newUser.isSuperAdmin,
      },
      tenant: {
        id: newTenant.id,
        name: newTenant.name,
        role: 'owner',
      },
      token,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});

/**
 * Login with email and password.
 */
authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { email, password } = parsed.data;
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Fetch associated tenants
  const memberships = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      name: tenants.name,
      plan: tenants.plan,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, user.id));

  const jwtSecret = process.env.JWT_SECRET || 'fallback_development_secret_only';
  const token = signJwt(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    },
    jwtSecret
  );

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
      },
      tenants: memberships,
      token,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Get current session profile.
 */
authRouter.get('/me', authMiddleware, async (c) => {
  const sessionUser = c.get('user');
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isSuperAdmin: users.isSuperAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, sessionUser.userId))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError('User session is invalid');
  }

  const memberships = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      name: tenants.name,
      plan: tenants.plan,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, user.id));

  const response: ApiSuccessResponse<unknown> = {
    success: true,
    data: {
      user,
      tenants: memberships,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
