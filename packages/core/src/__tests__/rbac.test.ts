import { describe, it, expect } from 'vitest';
import { hasPermission } from '../rbac.js';

describe('Role-Based Access Control (RBAC)', () => {
  it('grants all permissions to organization owners', () => {
    expect(hasPermission('owner', 'tenant:delete')).toBe(true);
    expect(hasPermission('owner', 'site:create')).toBe(true);
    expect(hasPermission('owner', 'site:delete')).toBe(true);
    expect(hasPermission('owner', 'member:invite')).toBe(true);
  });

  it('restricts admin roles from deleting the tenant or removing members', () => {
    expect(hasPermission('admin', 'site:create')).toBe(true);
    expect(hasPermission('admin', 'site:update')).toBe(true);
    expect(hasPermission('admin', 'tenant:delete')).toBe(false);
    expect(hasPermission('admin', 'member:remove')).toBe(false);
  });

  it('restricts members from mutating tenant resources or creating/deleting sites', () => {
    expect(hasPermission('member', 'site:read')).toBe(true);
    expect(hasPermission('member', 'site:update')).toBe(true);
    expect(hasPermission('member', 'site:create')).toBe(false);
    expect(hasPermission('member', 'site:delete')).toBe(false);
    expect(hasPermission('member', 'member:invite')).toBe(false);
  });

  it('automatically grants all permissions to super administrators regardless of role', () => {
    expect(hasPermission('member', 'tenant:delete', true)).toBe(true);
    expect(hasPermission(undefined, 'site:delete', true)).toBe(true);
  });

  it('denies permissions to unknown roles', () => {
    expect(hasPermission('unknown_role', 'site:read')).toBe(false);
    expect(hasPermission(undefined, 'site:read')).toBe(false);
  });
});
