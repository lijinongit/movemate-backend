# Data Engineer — Definition Phase Deliverable
## Data Model, Schema Design & PII Handling for Foundation (Sprint 1–2)

**Phase:** Definition  
**Owner:** Data Engineer (📊)  
**Scope:** Foundation database schema — User, Customer, Trainer, Studio, Document, ParentalConsent, AuditLog  
**Database:** PostgreSQL 15 (AWS Aurora Serverless v2)  
**Region:** me-south-1 (Bahrain) — PDPL compliance

---

## Executive Summary

The Foundation slice requires a minimal but robust data model that enforces identity verification, under-18 safety, trainer credential management, and immutable audit logging. This narrative explains the design decisions behind the Prisma schema, particularly around:

1. **PII encryption at rest:** Emirates ID numbers, phone numbers, and sensitive dates encrypted at database level
2. **Soft deletes vs hard deletes:** PDPL right-to-erasure compliance with audit trail preservation
3. **Indexing strategy:** Query performance under high concurrency (100+ simultaneous users)
4. **Audit logging:** immutable table for all sensitive actions (registration, approvals, document access)

---

## Data Model Overview

### Core Entity Relationships

```
User (base entity for all user types)
  ├── Customer (extends User)
  ├── Trainer (extends User)
  │   ├── Document (Emirates ID, DSC certs, intro video)
  │   ├── TrainerApplication (approval workflow)
  │   └── Reference (background check contacts)
  ├── StudioAdmin (extends User)
  └── PlatformAdmin (extends User)

ParentalConsent (links parent to child)
  └── ConsentAudit (immutable record)

Document (generic PII storage)
  ├── EmiratesID
  ├── DSCCertification
  ├── ProfilePhoto
  └── IntroVideo

AuditLog (immutable event stream)
  └── All sensitive actions logged here
```

---

## Detailed Schema Design Decisions

### 1. User Table — Base Entity

**Approach:** Single User table with `role` discriminator (customer, trainer, studio_admin, platform_admin)

**Rationale:**
- **Simplicity:** One table to query all users; one authentication path
- **Flexibility:** Easy to add admin users later without schema changes
- **Performance:** Single-table inheritance avoids JOINs for basic user lookups

**PII Handling:**
- Email: hashed with SHA-256 for lookups; original stored plaintext (encrypted at S3/RDS level)
- Phone: encrypted AES-256 at application level; indexed on hash of encrypted value
- Password: hashed with bcrypt (Cognito or local); never stored plaintext
- DOB: encrypted AES-256 (used only for age verification, never displayed to trainers)
- Emirates ID number: encrypted AES-256; only admin can see

**Soft Delete:**
- `deleted_at` timestamp (nullable); NULL = active, non-NULL = deleted
- Queries always filter `WHERE deleted_at IS NULL`
- Allows PDPL right-to-erasure: set `deleted_at`, purge PII fields in background job

### 2. Customer Table — Specialized User

**Extends User; adds customer-specific fields:**
- Activity preferences (gym, dance, swimming, etc.) — JSON array
- Subscription status (none, fixed, flexible, auto-renewing)
- Profile bio (optional)

**Rationale:** Keep trainer-specific fields (certifications, rate) separate; customer profile is minimal.

### 3. Trainer Table — Specialized User with Credentials

**Extends User; tracks certification and application state:**
- `status`: pending_review, approved, suspended, rejected (state machine)
- `hourly_rate_aed`: 50–500 AED
- `dsc_license_no`: encrypted (DSC reference number)
- `disciplines`: JSON array (Personal Training, Dance, Swimming, etc.)
- `bio`: trainer intro text
- `intro_video_url`: S3 path (presigned at retrieval)
- `rating_avg`: float (1–5); updated after each session review
- `total_sessions`: count
- `studio_affiliation_id`: nullable (if trainer is studio-based)

**Rationale:** 
- Status workflow ensures only "approved" trainers appear in customer search
- Disciplines are JSON (flexible; no separate table needed for MVP)
- Rating is denormalized (could be computed from Reviews table, but cached for performance)

### 4. Studio Table

**Represents a physical training venue:**
- `name`: Studio name (e.g., "FitZone Dubai Marina")
- `address`: street address (geocoded)
- `lat`, `lng`: coordinates for map display
- `facilities`: JSON (Gym, Studio Rooms, Lounge, Outdoor, etc.)
- `phone`: contact phone
- `email`: contact email
- `contract_signed_at`: timestamp (studio live once contract signed)
- `revenue_share_pct`: 20–50% (percentage of session fee to studio)
- `status`: active, inactive, contract_pending
- `deleted_at`: soft delete

**Rationale:**
- No explicit approval needed (contract signature is approval)
- Facilities stored as JSON (no separate table for MVP)
- Coordinates enable map display in customer app

### 5. Document Table — Unified PII Storage

**Generic table for all document uploads (Emirates ID, DSC cert, intro video, photos):**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User |
| `document_type` | VARCHAR | 'emirates_id', 'dsc_cert_personal_training', 'intro_video', 'profile_photo', etc. |
| `s3_path` | TEXT | Encrypted S3 path (e.g., `s3://movemate-emiratesid/user-123/2026-05-03/doc.jpg`) |
| `file_size_bytes` | INT | For quota enforcement |
| `status` | VARCHAR | 'pending_verification', 'verified', 'rejected', 'expired' |
| `verified_by` | UUID | Foreign key to admin user (who approved) |
| `verified_at` | TIMESTAMP | When admin approved |
| `rejection_reason` | TEXT | Why rejected (e.g., "ID expired", "Invalid DSC cert") |
| `expiry_date` | DATE | For Emirates ID and certs (NULL for photos/videos) |
| `created_at` | TIMESTAMP | Upload timestamp |
| `deleted_at` | TIMESTAMP | Soft delete (PDPL right-to-erasure) |

**Rationale:**
- **Single table:** Flexible for different document types without schema changes
- **S3 path storage:** Never re-download from S3; path is source of truth
- **Immutable verification:** once verified, admin cannot change status (append-only)
- **Expiry tracking:** cron job marks expired documents as 'expired'

### 6. TrainerApplication Table — Approval Workflow

**Tracks trainer application state and decisions:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `trainer_id` | UUID | Foreign key to Trainer |
| `status` | VARCHAR | 'pending_review', 'approved', 'rejected', 'pending_resubmission' |
| `submitted_at` | TIMESTAMP | When trainer submitted application |
| `reviewed_by` | UUID | Admin who made decision |
| `reviewed_at` | TIMESTAMP | When decision made |
| `decision_notes` | TEXT | Admin's notes (e.g., "Fast approval: excellent credentials") |
| `rejection_reason` | VARCHAR | Structured reason (e.g., "invalid_dsc_cert", "unresponsive_reference") |
| `founding_trainer_badge` | BOOLEAN | TRUE if trainer is in first 100 (lifetime badge) |
| `created_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP | Soft delete (if trainer deletes account) |

**Rationale:**
- **Immutable audit trail:** once approved, decision cannot be changed (only notes visible)
- **Reapplication support:** new row created if trainer reapplies; old row archived
- **Badge tracking:** "Founding Trainer" is a one-time achievement

### 7. Reference Table — Background Check Contacts

**Stores reference contact details for trainer background checks:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `trainer_id` | UUID | Foreign key to Trainer |
| `application_id` | UUID | Which application this reference is for |
| `name` | VARCHAR | Contact name (e.g., "Gym Manager Dubai") |
| `email` | VARCHAR | Contact email |
| `relationship` | VARCHAR | 'gym_manager', 'current_client', 'previous_client', 'coach', 'studio_owner', 'other' |
| `contact_attempted_at` | TIMESTAMP | When admin first emailed this reference |
| `contact_response_at` | TIMESTAMP | When reference responded |
| `feedback` | TEXT | Unstructured feedback from reference |
| `status` | VARCHAR | 'pending_contact', 'contacted', 'unresponsive' |
| `created_at` | TIMESTAMP | |

**Rationale:**
- **Contact tracking:** prevent duplicate emails to same reference
- **Feedback storage:** preserve reference validation for audit
- **Status machine:** unresponsive references trigger admin escalation

### 8. ParentalConsent Table — Under-18 User Protection

**Links parent to child; immutable consent record for PDPL compliance:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `child_id` | UUID | Foreign key to User (under-18) |
| `parent_id` | UUID | Foreign key to User (18+, verified) |
| `consent_given` | BOOLEAN | Parent confirms "I will accompany child to sessions" |
| `consent_timestamp` | TIMESTAMP | When parent accepted |
| `terms_accepted` | BOOLEAN | Parent accepted terms (immutable) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Updated if consent withdrawn (rare) |
| `deleted_at` | TIMESTAMP | Soft delete if parent/child deleted (record kept for audit) |

**Rationale:**
- **Immutable consent:** timestamp proves parent agreed at specific time (PDPL requirement)
- **Guardian verification:** parent_id only set after parent Emirates ID verified
- **Audit trail:** never delete; always available for compliance audits

### 9. AuditLog Table — Immutable Event Stream

**Every sensitive action logged here; no updates, only inserts:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `action` | VARCHAR | 'user_registration', 'otp_verification', 'emirates_id_upload', 'trainer_approved', 'document_downloaded', 'account_deleted', etc. |
| `user_id` | UUID | User performing action (nullable if system action) |
| `admin_id` | UUID | Admin performing action (if applicable) |
| `resource_id` | UUID | Document, trainer, application ID, etc. |
| `resource_type` | VARCHAR | 'user', 'document', 'trainer_application', etc. |
| `details` | JSONB | Action-specific metadata (no PII) |
| `ip_address` | INET | Client IP (for security analysis) |
| `user_agent` | TEXT | Browser/app version |
| `created_at` | TIMESTAMP | Immutable timestamp |

**Constraints:**
- No UPDATE or DELETE allowed (database constraint)
- Automatic cleanup: archive to S3 Glacier after 90 days; purge after 3 years

**Rationale:**
- **Compliance:** PDPL requires 12-month audit trail
- **Immutability:** cannot tamper with logs
- **Privacy:** never logs PII (only hashes/IDs)

---

## Indexing Strategy

**Indexes optimized for common queries; added only if necessary (avoid index bloat):**

### User Table

```sql
CREATE INDEX idx_user_email_hash ON users (email_hash)     — Fast email lookup
WHERE deleted_at IS NULL;

CREATE INDEX idx_user_phone_hash ON users (phone_hash)     — Fast phone lookup
WHERE deleted_at IS NULL;

CREATE INDEX idx_user_created_at ON users (created_at)     — Recent registrations
WHERE deleted_at IS NULL;

CREATE INDEX idx_user_role_status ON users (role, status)  — Filter by role + status
WHERE deleted_at IS NULL;
```

### Trainer Table

```sql
CREATE INDEX idx_trainer_status ON trainers (status)       — Show only "approved" trainers
WHERE status = 'approved' AND deleted_at IS NULL;

CREATE INDEX idx_trainer_disciplines ON trainers USING GIN (disciplines)  — Search by discipline (JSON)
WHERE status = 'approved' AND deleted_at IS NULL;

CREATE INDEX idx_trainer_rating ON trainers (rating_avg DESC)  — Sort by rating
WHERE status = 'approved' AND deleted_at IS NULL;

CREATE INDEX idx_trainer_studio ON trainers (studio_affiliation_id)  — Trainers per studio
WHERE deleted_at IS NULL;
```

### Document Table

```sql
CREATE INDEX idx_document_user_type ON documents (user_id, document_type)  — All docs per user
WHERE deleted_at IS NULL;

CREATE INDEX idx_document_status ON documents (status, created_at DESC)  — Pending verifications
WHERE deleted_at IS NULL;

CREATE INDEX idx_document_expiry ON documents (expiry_date)  — Find expired docs
WHERE status != 'expired' AND deleted_at IS NULL;
```

### AuditLog Table

```sql
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC)  — User activity history

CREATE INDEX idx_audit_action ON audit_log (action, created_at DESC)  — Track specific actions

CREATE INDEX idx_audit_resource ON audit_log (resource_type, resource_id)  — What happened to this resource
```

**Index Maintenance:**
- Run `ANALYZE` weekly to update statistics
- Monitor index bloat: `SELECT * FROM pg_stat_user_indexes WHERE idx_blks_read > 10000;`
- Remove unused indexes: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;`

---

## PII Encryption & Masking

### Encryption at Rest (AWS RDS)

All databases encrypted with KMS customer-managed key:
- Key rotation: automatic, every 90 days
- Key policy: only Movemate IAM roles can use key

### Application-Level Encryption

**Fields encrypted before storing in RDS:**

| Field | Encryption | Reason |
|-------|-----------|--------|
| `user.phone` | AES-256 | PII; PDPL sensitive |
| `user.dob` | AES-256 | Age verification; kept encrypted |
| `user.emirates_id_number` | AES-256 | PII; only admin can view |
| `trainer.dsc_license_no` | AES-256 | DSC reference; not displayed publicly |

**Implementation:**
```typescript
import crypto from 'crypto';

function encryptField(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptField(encrypted: string, key: Buffer): string {
  const [ivHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

**Key Management:**
- Encryption key stored in AWS Secrets Manager
- Rotated every 90 days (Secrets Manager handles rotation)
- Different keys for different environments (dev, staging, production)

### Masking in Logs

**No PII logged; only hashes and IDs:**

| Original | Logged As | Example |
|----------|-----------|---------|
| `ali@example.com` | `email_hash` | `sha256:3e89...` |
| `+971501234567` | `phone_hash` | `sha256:8f2a...` |
| `20050315` (DOB) | `age_group` | `13-18` |
| `313004567` (Emirates ID) | `id_hash` | `sha256:1b4c...` |

**Logging code:**
```typescript
import { createHash } from 'crypto';

function hashPII(value: string): string {
  return createHash('sha256').update(value).digest('hex').substring(0, 8);
}

logger.info('User registration', {
  user_id: 'user-123',
  email_hash: hashPII(email),
  phone_hash: hashPII(phone),
  ip_address: req.ip,
});
```

---

## PDPL Right-to-Erasure Implementation

**When user requests deletion, automated job runs:**

```sql
-- Phase 1: Anonymize PII (keep user record for transaction history)
UPDATE users SET
  email = NULL,
  phone = NULL,
  dob = NULL,
  first_name = 'Deleted User',
  last_name = '',
  deleted_at = NOW()
WHERE id = $1;

-- Phase 2: Delete PII from extended tables
UPDATE customers SET bio = NULL WHERE user_id = $1;
UPDATE trainers SET bio = NULL, dsc_license_no = NULL WHERE user_id = $1;

-- Phase 3: Delete documents (but keep audit log)
DELETE FROM documents WHERE user_id = $1;

-- Phase 4: Archive PII to S3 Glacier (for compliance backup)
INSERT INTO backup_deleted_users (user_id, backup_date, s3_path)
VALUES ($1, NOW(), 's3://movemate-backups/deleted/2026-05-03/user-123.json');

-- Audit log remains intact (no delete)
INSERT INTO audit_log (action, user_id, details) VALUES
  ('account_deleted', $1, '{"deleted_at": "2026-05-03T10:00:00Z"}');
```

**Timing:**
- User requests deletion → immediate UI confirmation
- PII deletion → within 1 hour (async job)
- Full cleanup → within 30 days (includes reference purge)
- Backup archive → 3 years (then auto-purge)

---

## Soft Delete vs Hard Delete

**Decision: Soft delete everywhere (set `deleted_at` timestamp)**

**Rationale:**
1. **Audit trail:** can trace why user was deleted (accident vs malicious)
2. **PDPL compliance:** preserve immutable record for 12 months
3. **Data recovery:** deleted records recoverable within 24 hours (emergency restore)
4. **Query simplicity:** `WHERE deleted_at IS NULL` filter on every query

**Trade-off:** Database grows with deleted records; mitigated by:
- Archiving deleted records to S3 after 1 year
- Purging from RDS after 3 years (legal hold)

---

## Data Validation & Constraints

### Database Constraints (enforced at table creation)

```sql
ALTER TABLE users ADD CONSTRAINT email_unique UNIQUE (email)
  WHERE deleted_at IS NULL;

ALTER TABLE users ADD CONSTRAINT phone_unique UNIQUE (phone)
  WHERE deleted_at IS NULL;

ALTER TABLE users ADD CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

ALTER TABLE users ADD CONSTRAINT valid_dob CHECK (dob >= '1900-01-01' AND dob <= CURRENT_DATE);

ALTER TABLE trainers ADD CONSTRAINT valid_rate CHECK (hourly_rate_aed >= 50 AND hourly_rate_aed <= 500);

ALTER TABLE documents ADD CONSTRAINT valid_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 52428800);  -- 50MB max

ALTER TABLE parental_consent ADD CONSTRAINT parent_adult CHECK (
  (SELECT dob FROM users WHERE id = parent_id) <= CURRENT_DATE - INTERVAL '18 years'
);
```

### Application Validation (Prisma/Zod)

**Input validation before hitting database:**

```typescript
import { z } from 'zod';

const UserRegisterSchema = z.object({
  email: z.string().email().max(255),
  phone: z.string().regex(/^\+971\d{9}$/, 'Invalid UAE phone'),
  password: z.string().min(8).regex(/[A-Z]/).regex(/\d/).regex(/[!@#$%^&*]/),
  first_name: z.string().min(2).max(50),
  last_name: z.string().min(2).max(50),
  dob: z.coerce.date().max(new Date()), // not in future
});

const registerData = UserRegisterSchema.parse(req.body); // throws if invalid
```

---

## Migration Strategy

**Prisma Migrate** manages schema changes:

```bash
# Developer adds new field to schema.prisma
# Then:
npx prisma migrate dev --name add_new_field
# Creates migration file: prisma/migrations/20260503100000_add_new_field/migration.sql

# On deployment:
npx prisma migrate deploy  # Applies all pending migrations (CI/CD gate)
```

**Zero-downtime migrations:**
1. Add nullable column
2. Deploy code that writes to both old and new columns
3. Migrate data in background
4. Remove old column in follow-up migration
5. Deploy code that reads only new column

---

## Query Performance Optimization

### N+1 Query Prevention (Prisma Relations)

**Bad (N+1):**
```typescript
const trainers = await db.trainer.findMany({ where: { status: 'approved' } });
for (const trainer of trainers) {
  const docs = await db.document.findMany({ where: { user_id: trainer.user_id } });  // N queries!
}
```

**Good (JOIN):**
```typescript
const trainers = await db.trainer.findMany({
  where: { status: 'approved' },
  include: { user: { include: { documents: {} } } },  // 1 query with JOINs
});
```

### Query Optimization Tips

1. **Always use indexes:** analyze query plan with `EXPLAIN ANALYZE`
2. **Avoid SELECT \*:** specify only needed columns
3. **Use pagination:** `skip()`, `take()` for large result sets
4. **Cache hot queries:** user by ID, trainer by status, documents by user

---

## Sign-Off & Approval

**Data Review:**
- [ ] Data Engineer — schema normalized; indexes optimize for queries; soft-delete strategy sound
- [ ] Security — PII encrypted; audit log immutable; no plaintext secrets
- [ ] Compliance — PDPL compliance enforced (data residency, right-to-erasure, audit trail)
- [ ] DevOps — migration strategy safe; backup/recovery plan in place

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-03  
**Next Review:** Week 1 of Sprint 1 (schema deployed to staging)  
**Approval:** Pending Data Engineer & Compliance review
