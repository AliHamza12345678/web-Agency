export type TenantRole = 'owner' | 'admin' | 'member';

export type Permission =
  | 'tenant:read'
  | 'tenant:update'
  | 'tenant:delete'
  | 'member:list'
  | 'member:invite'
  | 'member:remove'
  | 'site:create'
  | 'site:read'
  | 'site:update'
  | 'site:delete'
  | 'site:regenerate_key';

const ROLE_PERMISSIONS: Record<TenantRole, Set<Permission>> = {
  owner: new Set<Permission>([
    'tenant:read',
    'tenant:update',
    'tenant:delete',
    'member:list',
    'member:invite',
    'member:remove',
    'site:create',
    'site:read',
    'site:update',
    'site:delete',
    'site:regenerate_key',
  ]),
  admin: new Set<Permission>([
    'tenant:read',
    'tenant:update',
    'member:list',
    'member:invite',
    'site:create',
    'site:read',
    'site:update',
    'site:regenerate_key',
  ]),
  member: new Set<Permission>([
    'tenant:read',
    'member:list',
    'site:read',
    'site:update',
  ]),
};

/**
 * Evaluates whether a user role possesses a specific permission.
 * Super administrators automatically bypass all tenant-level permission checks.
 */
export function hasPermission(
  role: TenantRole | string | undefined,
  permission: Permission,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) {
    return true;
  }

  if (!role || !(role in ROLE_PERMISSIONS)) {
    return false;
  }

  return ROLE_PERMISSIONS[role as TenantRole]!.has(permission);
}
