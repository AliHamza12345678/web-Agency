# OpenAgent Chat: Multi-Tenant Access-Control Matrix (RBAC)

This document formalizes the Role-Based Access Control (RBAC) and Tenant Isolation Model enforced by OpenAgent Chat. Every protected operation is authorized server-side before execution; security is never delegated to UI element hiding.

---

## 1. Actor Classifications

| Actor | Scope & Description |
|---|---|
| **Super Admin (`super_admin`)** | Platform administrator across all tenant workspaces. System monitoring, cross-organization audits. |
| **Organization Owner (`owner`)** | Primary billing and administrative owner of a specific tenant workspace. Full permissions over all sites and members. |
| **Organization Admin (`admin`)** | Team administrator. Can create and configure website chatbots and invite team members, but cannot delete the organization or purge members. |
| **Organization Member (`member`)** | Operational member. Can inspect chatbots, view visitor conversations, and update prompts, but cannot create/delete sites or manage members. |
| **Public Widget (`public_widget`)** | Embedded client on authorized website. Identifies via `pk_live_...`. Strictly restricted to public branding and streaming chat. |
| **Unauthenticated (`anonymous`)** | External visitor without credentials. Can only access public health checks and login/register endpoints. |

---

## 2. Access Control Matrix

| Resource & Operation | Endpoint | Anonymous | Public Widget | Member | Admin | Owner | Super Admin |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Platform Liveness** | `GET /health/live` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Platform Readiness** | `GET /health/ready` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **User Registration** | `POST /api/v1/auth/register` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **User Login** | `POST /api/v1/auth/login` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Current Profile** | `GET /api/v1/auth/me` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **List Workspaces** | `GET /api/v1/admin/tenants` | ❌ | ❌ | ✅ (Own) | ✅ (Own) | ✅ (Own) | ✅ (All) |
| **Create Workspace** | `POST /api/v1/admin/tenants` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Get Workspace Details** | `GET /api/v1/admin/tenants/:id` | ❌ | ❌ | ✅ (Own) | ✅ (Own) | ✅ (Own) | ✅ (Any) |
| **Update Workspace Name** | `PUT /api/v1/admin/tenants/:id` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Delete Workspace** | `DELETE /api/v1/admin/tenants/:id` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **List Members** | `GET /api/v1/admin/tenants/:id/members` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Invite Member** | `POST /api/v1/admin/tenants/:id/members` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Remove Member** | `DELETE /api/v1/admin/tenants/:id/members/:uid` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **List Sites** | `GET /api/v1/admin/tenants/:id/sites` | ❌ | ❌ | ✅ (Own) | ✅ (Own) | ✅ (Own) | ✅ (Any) |
| **Create Site** | `POST /api/v1/admin/tenants/:id/sites` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Get Site Details** | `GET /api/v1/admin/tenants/:id/sites/:siteId` | ❌ | ❌ | ✅ (Own) | ✅ (Own) | ✅ (Own) | ✅ (Any) |
| **Update Site / Branding** | `PUT /api/v1/admin/tenants/:id/sites/:siteId` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Delete Site** | `DELETE /api/v1/admin/tenants/:id/sites/:siteId` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Rotate Public Key** | `POST /api/v1/admin/tenants/:id/sites/:siteId/regenerate-key` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Public Widget Handshake** | `GET /api/v1/site/config?publicKey=...` | ❌ | ✅ (Allowed Origins Only) | ❌ | ❌ | ❌ | ❌ |
| **Visitor Chat Stream** | `POST /api/v1/chat/stream` | ❌ | ✅ (Allowed Origins Only) | ❌ | ❌ | ❌ | ❌ |

---

## 3. Defense Against Common Vulnerabilities

### 1. Insecure Direct Object References (IDOR)
- **Vulnerability**: Attacker in Organization A queries `/api/v1/admin/tenants/org_b/sites/site_b`.
- **Mitigation**: `requireTenantAccess` middleware verifies membership in `org_b`. The database query explicitly enforces `WHERE id = :siteId AND tenant_id = :tenantId`. If not found, returns `404 Not Found` without revealing existence.

### 2. Privilege Escalation
- **Vulnerability**: Member attempts to promote themselves or delete the organization workspace.
- **Mitigation**: Server-side RBAC checks `hasPermission(role, permission)`. Even if an attacker manually calls the deletion endpoint, the server returns `403 Forbidden`.

### 3. Public Key Misuse
- **Vulnerability**: Attacker extracts `pk_live_...` from host website HTML and attempts to read backend configuration or prompts.
- **Mitigation**: Public keys are only accepted on `/api/v1/site/config` and `/api/v1/chat/stream`. Admin routes require cryptographically signed Bearer JWTs. Furthermore, request `Origin` is validated against `sites.allowed_origins`.

### 4. Credential Disclosure
- **Vulnerability**: Public widget endpoint returns internal system prompts or database credentials.
- **Mitigation**: Dedicated projection schema in `publicSiteRouter` filters output strictly to `siteId`, `name`, and `branding`. Private prompts and tenant credentials are never serialized.
