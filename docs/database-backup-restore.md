# Database Backup, Disaster Recovery & Retention Enforcement Runbook

## 1. Overview & Objectives

The OpenAgent platform relies on PostgreSQL 16+ with the `pgvector` extension. To ensure business continuity, disaster preparedness, and compliance with data privacy mandates (GDPR, CCPA), this document outlines operational procedures for:

1. **Logical Backups:** Automated point-in-time logical dumps using `pg_dump`.
2. **Disaster Recovery (DR) & Point-In-Time-Recovery (PITR):** Write-Ahead Logging (WAL) archiving.
3. **Restoration Runbook:** Validated restoration drills and verification routines.
4. **Data Retention & Right to Erasure Enforcement:** Automatic purge workers and GDPR-compliant deletion.

---

## 2. Recovery Objectives (RTO & RPO)

| Metric | Target | Justification |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | < 15 minutes | Achieved via continuous WAL archiving to cloud object storage (S3 / GCS). |
| **RTO (Recovery Time Objective)** | < 30 minutes | Target recovery time for restoring logical snapshots in an isolated staging environment. |

---

## 3. Logical Backup Architecture

### 3.1 pg_dump Options & Hardened Flags
Automated backups are built using `@openagent/db`'s programmatic builder (`buildPgDumpCommand`) or standard shell automation:

```bash
# Recommended daily logical backup
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=c \
  --compress=9 \
  --file="/var/backups/openagent-$(date +%Y%m%d_%H%M%S).dump" \
  --clean \
  --if-exists
```

**Key Flags Explained:**
- `--format=c` (Custom format): Compressed, binary format supporting selective table restoration, parallel restore (`pg_restore -j`), and table reordering.
- `--compress=9`: Maximum gzip compression to reduce network egress and cold storage costs.
- `--clean --if-exists`: Ensures clean teardown of prior schema artifacts without failing on first-time initialization.
- **Identifier Sanitization:** The CLI generator automatically validates table names with `^[a-zA-Z0-9_]+$` to prevent parameter injection attacks.

### 3.2 Backup Storage & Encryption at Rest
- All backup artifacts (`.dump`) must be encrypted at rest using AES-256-GCM.
- In AWS environments, enable AWS S3 Server-Side Encryption with KMS (`aws:kms`) and Object Lock (WORM - Write Once Read Many) with a 30-day immutability retention period to safeguard against ransomware.
- In Google Cloud, use Cloud Storage Bucket-level Customer-Managed Encryption Keys (CMEK).

---

## 4. Disaster Recovery & Point-In-Time Recovery (PITR)

For production workloads, physical backups combined with WAL archiving are recommended:

1. **WAL Archiving Configuration** (`postgresql.conf`):
   ```ini
   wal_level = replica
   archive_mode = on
   archive_command = 'envdir /etc/wal-e.d/env wal-g wal-push %p'
   archive_timeout = 60
   ```
2. **Base Backups:**
   - Run daily base backups via `wal-g backup-push /var/lib/postgresql/data`.
3. **Point-In-Time Recovery Execution:**
   - When recovering to a specific timestamp (e.g. before an accidental data drop):
   ```ini
   restore_command = 'wal-g wal-fetch %f %p'
   recovery_target_time = '2026-10-11 14:30:00 UTC'
   recovery_target_action = 'promote'
   ```

---

## 5. Restoration Runbook

### 5.1 Verification Drill Protocol
**Rule:** An untested backup is not a backup. Monthly restoration drills must be executed on a staging database instance.

### 5.2 Step-by-Step Restoration Procedure

1. **Provision Clean Target Database:**
   Ensure PostgreSQL is running and the `vector` extension is installed:
   ```sql
   CREATE DATABASE openagent_restored;
   \c openagent_restored;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Run Restoration:**
   Execute `pg_restore` using `@openagent/db`'s builder or direct CLI:
   ```bash
   pg_restore \
     --dbname="${RESTORE_DATABASE_URL}" \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     --single-transaction \
     /var/backups/openagent-20261011_020000.dump
   ```

   **Security & Isolation Rationale:**
   - `--no-owner`: Prevents restored objects from assuming arbitrary foreign role ownership.
   - `--no-privileges`: Avoids granting inadvertent permissions from development/staging roles.
   - `--single-transaction`: Ensures atomic restoration; if any error occurs, the entire restore rolls back.

3. **Verify Integrity & Migration State:**
   ```bash
   # Run automated migration check
   pnpm --filter @openagent/db run db:migrate
   ```

4. **Sanity Check Row Counts & Schemas:**
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM tenants;
   SELECT count(*) FROM sites;
   SELECT count(*) FROM conversations;
   SELECT count(*) FROM messages;
   ```

---

## 6. Multi-Tenant Data Retention & Right to Erasure Enforcement

### 6.1 Retention Enforcement Architecture
Every site in OpenAgent has a configurable `retentionDays` setting (default: 30 days, range: 1–365 days):

1. **Automated Batch Purge Worker (`executeGlobalRetentionPurge`):**
   - Scheduled nightly via cron/job runner.
   - Iterates through all registered sites.
   - Computes `cutoffDate = now() - (retentionDays * 86400000)`.
   - Identifies and cascades deletion of:
     - All messages belonging to conversations created prior to `cutoffDate`.
     - Expired conversations.
     - Expired analytics events.
   - Writes an immutable audit entry in `admin_access_logs` with action `retention_purge`, recording exact counts purged and cutoff timestamps.

2. **On-Demand Site Purge API:**
   - Authorized tenant administrators (`site:update` permission) can trigger immediate retention cleanup via:
     `POST /api/v1/admin/tenants/:tenantId/sites/:siteId/analytics/retention/cleanup`

3. **GDPR / CCPA Right to Erasure (Article 17):**
   - When a visitor or tenant requests complete deletion:
   - Specific conversation deletion: `DELETE /api/v1/admin/tenants/:tenantId/sites/:siteId/analytics/conversations/:conversationId`
   - Cascading delete purges messages, citations, tool audit payloads, and associated analytics events.
   - Embeddings and knowledge chunks for deleted sites/documents are removed through PostgreSQL foreign key cascading rules (`onDelete: 'cascade'`).
