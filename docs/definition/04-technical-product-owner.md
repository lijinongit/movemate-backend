# Technical Product Owner — Definition Phase Deliverable
## Non-Functional Requirements & Acceptance Criteria for Foundation (Sprint 1–2)

**Phase:** Definition  
**Owner:** Technical Product Owner (⚙️)  
**Scope:** Foundation services — Auth, User Management, Document Upload  
**Sprint Timeline:** Weeks 1–4 of 12-week MVP  
**Target Region:** AWS me-south-1 (Bahrain) — UAE data residency compliance

---

## Executive Summary

This document specifies the non-functional requirements (NFRs), service-level objectives (SLOs), and acceptance criteria for the Foundation slice. Every API endpoint, every database query, and every document upload must meet these thresholds. These are not aspirational — they are load-bearing constraints that define "done."

The Foundation slice is **supply-side gating**: trainers will not join a slow, unreliable platform; customers will not verify identity on a system that crashes. Therefore:
- **Performance SLO:** p95 latency <200ms for all authenticated endpoints
- **Availability SLA:** 99.9% uptime during business hours (6am–midnight UAE time)
- **Security:** Zero tolerance for PII leaks; all documents encrypted at rest and in transit
- **Compliance:** 100% PDPL data residency; all sensitive actions auditable

---

## Non-Functional Requirements (NFRs)

### 1. Performance Requirements

#### Endpoint Response Time Targets

**User Authentication APIs:**
| Endpoint | Operation | p50 | p95 | p99 | Concurrent Load |
|----------|-----------|-----|-----|-----|-----------------|
| `POST /auth/register` | Registration + OTP generation | <100ms | <200ms | <500ms | 100 concurrent |
| `POST /auth/verify-otp` | OTP verification | <150ms | <250ms | <600ms | 100 concurrent |
| `POST /auth/login` | Login + JWT issue | <80ms | <150ms | <400ms | 100 concurrent |
| `POST /auth/refresh-token` | Token refresh | <50ms | <100ms | <200ms | 500 concurrent |

**User Profile APIs:**
| Endpoint | Operation | p50 | p95 | p99 | Concurrent Load |
|----------|-----------|-----|-----|-----|-----------------|
| `GET /users/{id}` | Fetch user profile | <50ms | <100ms | <300ms | 200 concurrent |
| `PATCH /users/{id}` | Update profile | <100ms | <200ms | <400ms | 50 concurrent |
| `GET /users/{id}/documents` | List user documents | <100ms | <150ms | <300ms | 100 concurrent |

**Document APIs:**
| Endpoint | Operation | p50 | p95 | p99 | Concurrent Load |
|----------|-----------|-----|-----|-----|-----------------|
| `POST /documents/presigned-url` | Generate presigned S3 URL | <50ms | <100ms | <200ms | 200 concurrent |
| `POST /documents/{id}/verify` | Verify document status | <100ms | <200ms | <500ms | 100 concurrent |
| `GET /documents/{id}` | Download document (admin only) | <200ms | <400ms | <1s | 20 concurrent |

#### Acceptance Criteria (Performance)

- [ ] **Load Test Pass:** All endpoints meet p95 thresholds under sustained 100-200 concurrent user load (k6, Artillery, or AWS Load Testing)
- [ ] **Database Query Optimization:** All indexed queries execute in <50ms; no n+1 queries
- [ ] **Cache Hit Rate:** Redis cache achieves >90% hit rate for session and user data lookups
- [ ] **Cold Start Time:** API Gateway + Lambda (if applicable) cold starts <5s total
- [ ] **No Timeouts:** 0 timeout errors in 8-hour load test; request queue never blocks

**Test Scenarios:**
1. **Normal Load:** 100 concurrent users, 60s test duration
   - Expected: p95 <200ms, error rate <0.5%
2. **Peak Load:** 500 concurrent users, 60s ramp-up, 120s sustained
   - Expected: p95 <300ms, error rate <1%
3. **Database Stress:** 1000 concurrent reads on user table
   - Expected: p95 <100ms, no connection pool exhaustion

---

### 2. Scalability Requirements

#### Concurrent User Capacity

| Environment | Concurrent Users | Required | Notes |
|-------------|------------------|----------|-------|
| **Dev/Staging** | 50 | Minimum | For QA testing |
| **Production (Launch)** | 500 | Target | First 2 weeks (Dubai launch) |
| **Production (Scale)** | 2,000 | Target | Month 3 (post-marketing push) |
| **MENA Expansion** | 50,000 | Roadmap | Multi-region setup (Phase 2) |

#### Database Scalability

- **Aurora Serverless v2:** Auto-scales from 0.5 to 256 ACUs (Aurora Capacity Units)
- **Connection pool:** 100 connections per service instance; auto-scale ECS Fargate from 2 to 10 instances
- **Storage:** RDS auto-scaling; initial 50GB allocation, grows to 500GB by Month 6

#### Document Storage Scalability

- **S3 bucket design:** Partitioned by `[user_id]/[timestamp]/[document_id]` to avoid S3 key hash collisions
- **Capacity:** 10TB SSD-tier storage for Phase 1; S3 Intelligent Tiering moves cold documents to Glacier after 30 days
- **Expected volume:** ~1GB/month (500 customers × 2 documents/customer × 1MB avg)

---

### 3. Availability & Reliability Requirements

#### Uptime SLA

- **Business Hours (6am–midnight UAE time):** 99.9% uptime (max 43 seconds downtime/day)
- **Off-Hours (midnight–6am):** 95% uptime (maintenance window allowed)
- **Measured:** HTTP 2xx/3xx responses from API Gateway health check every 10 seconds

#### Failure Handling & Resilience

| Failure Scenario | Recovery Strategy | Allowed Downtime |
|------------------|-------------------|------------------|
| **Single AZ outage** | RDS multi-AZ failover (automatic) | <60 seconds |
| **Database connection pool exhausted** | ECS auto-scale up; connection retry with exponential backoff | <30 seconds per user |
| **S3 presigned URL generation fails** | Fallback to direct S3 API; circuit breaker prevents cascading failures | Error logged, user retried |
| **Cognito service degradation** | Fallback to local JWT validation (cached public keys) | Transparent |
| **Cache (Redis) failure** | Auto-failover to database; no data loss, <500ms latency impact | <500ms impact |

#### Idempotency & Replay Protection

- **OTP generation:** if same phone/email requests OTP twice in 30 seconds, same OTP is returned (no double-send)
- **User registration:** if same email submitted twice within 5 seconds, second request returns 409 Conflict with existing user ID
- **Document upload:** presigned URL valid for 30 minutes; if uploaded twice, second upload overwrites (idempotent), no duplicate stored
- **Trainer application submission:** double-click protection; second submission within 2 seconds ignored, returns same application ID

---

### 4. Security Requirements

#### Encryption at Rest

**All PII stored in RDS:**
- AES-256 encryption at rest (AWS RDS encryption enabled via KMS customer-managed key)
- Key managed in AWS Secrets Manager; auto-rotated every 90 days
- Database backups encrypted with same key

**Documents in S3:**
- AES-256 encryption at rest via KMS customer-managed key
- S3 bucket policy: `Deny` all unauthenticated access; only signed IAM role can download
- CloudFront pre-signed URLs with 30-minute expiry; no public sharing

**Sensitive Data in Application Logs:**
- Emirates ID numbers: hashed with SHA-256 before logging (original never logged)
- Phone numbers: masked (show last 4 digits only)
- Email addresses: hashed
- Passwords: never logged, ever
- Tokens (JWT): never logged; only token ID (jti claim) logged for audit trail

#### Encryption in Transit

- **TLS 1.3 mandatory:** All traffic between client and API, API and database, API and S3 encrypted
- **Certificate pinning (mobile apps):** React Native app pins Movemate API certificate; prevents MITM attacks
- **API Gateway:** enforce HTTPS only; reject HTTP requests with 301 redirect to HTTPS

#### Authentication & Authorization

**API Authentication:**
- JWT tokens issued by AWS Cognito; no custom auth implementation
- Token expiry: 1 hour access token, 30-day refresh token
- Refresh token rotation: every refresh issues new refresh token; old token invalidated
- No refresh token reuse: if same refresh token used twice, both tokens invalidated (token hijack detection)

**Admin Access:**
- MFA (multi-factor authentication) required for all admin users via Cognito
- IP allowlisting: admin panel only accessible from office IPs (192.168.1.0/24, etc.) or VPN
- Session timeout: 15 minutes of inactivity; re-authenticate required

**Role-Based Access Control (RBAC):**
| Resource | Customer | Trainer | Studio Admin | Platform Admin |
|----------|----------|---------|--------------|----------------|
| Own profile | RW | RW | RW | R |
| Other user's profile | — | — | — | R (no PII) |
| Documents (own) | RW | RW | RW | R (all) |
| Documents (other) | — | — | — | R (all) |
| Trainer applications | — | — | — | R, U, D (review/approve) |

#### Rate Limiting

| Endpoint | Limit | Window | Error Response |
|----------|-------|--------|-----------------|
| `POST /auth/register` | 10 per IP | 1 hour | 429 Too Many Requests |
| `POST /auth/verify-otp` | 10 per phone | 1 hour | 429 Too Many Requests |
| `POST /auth/login` | 5 per account | 15 mins | 429 Account locked; unlock via email link |
| `POST /documents/presigned-url` | 100 per user | 1 hour | 429 Too Many Requests |
| All read endpoints | 1000 per user | 1 hour | 429 Too Many Requests |

**Rate Limit Headers (RFC 6585):**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1234567890
```

#### Input Validation & Injection Prevention

**Form Input Validation:**
- Email: RFC 5322 regex; domain must exist (MX record check)
- Phone: E.164 format with UAE country code (+971); reject if invalid
- Password: 8+ chars, 1 uppercase, 1 number, 1 special char; zxcvbn.js score >3
- Dates: ISO 8601 format; validate DOB is 0-120 years old; reject future dates
- URLs: absolute URLs only; reject JavaScript URLs
- All inputs trimmed and normalized (lowercase email, canonicalized phone)

**SQL Injection Prevention:**
- Parameterized queries everywhere (Prisma ORM enforces this)
- No string concatenation for SQL; all values bound
- Test case: attempt SQL injection in every form input during QA

**XSS Prevention:**
- All user-generated content (review text, bio, etc.) sanitized with DOMPurify before storage
- Output escaping in templates (Handlebars or EJS); no unescaped user data in HTML
- Content Security Policy (CSP) header: `default-src 'self'; script-src 'self' cdn.movemate.app`

**CSRF Protection:**
- All state-changing requests (POST, PATCH, DELETE) require CSRF token
- Token generated per session; validated on every request
- SameSite cookie attribute set to `Strict`

---

### 5. Data Residency & Compliance

#### PDPL (UAE Personal Data Protection Law)

- **Data Location:** All user data (RDS, S3, backups) stored in AWS me-south-1 (Bahrain) only
- **No Cross-Region Replication:** RDS read replicas in same AZ only; CloudFront CDN may cache in other regions but never caches PII
- **Right to Erasure:** Delete request triggers automated job; PII purged within 30 days
  - Data: user account, profile, documents, audit logs with PII deleted
  - Backup: incremental backups delete PII-containing snapshots; full backup retained for 12 months encrypted
  - Application logs: entries with PII (hashed) retained for 30 days then purged
- **Data Processing Agreement (DPA):** signed with AWS before launch
- **Consent:** explicit opt-in checkbox for data processing; stored in audit log with timestamp

#### Audit Logging

**All sensitive actions logged to immutable audit table:**

| Action | Logged Data | Retention | Immutable |
|--------|-------------|-----------|-----------|
| User registration | user_id, email (hashed), phone (hashed), timestamp, IP | 12 months | Yes (no update/delete) |
| OTP verification | user_id, phone (hashed), timestamp, success/failure | 12 months | Yes |
| Emirates ID upload | user_id, document_id, file_size, S3_path, timestamp, admin_reviewer | 12 months | Yes |
| Trainer application decision | trainer_id, admin_id, decision (approve/reject), reason, timestamp | 12 months | Yes |
| Document download (admin) | admin_id, document_id, user_id, timestamp, download_ip | 12 months | Yes |

**Audit Log Schema:**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  action VARCHAR(50) NOT NULL,  -- 'register', 'otp_verify', 'id_upload', 'approval', 'download'
  user_id UUID,                  -- nullable if action is not user-specific
  admin_id UUID,                 -- nullable if action not admin action
  resource_id UUID,              -- document_id, trainer_id, etc.
  details JSONB NOT NULL,        -- action-specific data (no PII)
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT no_update CHECK (created_at = CURRENT_TIMESTAMP)  -- pseudo-immutable
);

CREATE INDEX idx_audit_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_action_date ON audit_log(action, created_at DESC);
```

---

### 6. Integration Contracts

#### Third-Party APIs (Foundation Phase)

| Service | Purpose | SLA | Fallback | Notes |
|---------|---------|-----|----------|-------|
| **AWS Cognito** | User auth, JWT, MFA | 99.99% | Local JWT cache (up to 5 mins) | Never self-implement auth |
| **AWS S3** | Document storage | 99.99% | Retry with exponential backoff; fail user request after 3 retries | Presigned URLs used exclusively |
| **AWS SES** | Transactional email (OTP, notifications) | 99.9% | Fallback to Twilio SendGrid (Phase 2); queue retries | Email rate limit: 14 msg/sec account-wide |
| **Twilio** | SMS OTP | 99.95% | Fallback to AWS SNS; Queue retries | SMS rate limit: 100 msgs/second per account |
| **AWS KMS** | Encryption key management | 99.99% | Keys cached in-memory; service continues with cached key for max 24hrs | Key rotation auto-managed |

#### API Response Contracts

**Success Response (2xx):**
```json
{
  "data": { /* resource */ },
  "meta": {
    "request_id": "req-uuid-4",
    "timestamp": "2026-05-03T10:00:00Z"
  }
}
```

**Error Response (4xx/5xx):**
```json
{
  "error": {
    "code": "INVALID_EMAIL",
    "message": "Email format invalid.",
    "details": {
      "field": "email",
      "value": "not-an-email"
    }
  },
  "meta": {
    "request_id": "req-uuid-5",
    "timestamp": "2026-05-03T10:00:01Z"
  }
}
```

**HTTP Status Codes Used:**
- `200 OK` — Request succeeded
- `201 Created` — Resource created
- `400 Bad Request` — Input validation failed
- `401 Unauthorized` — No authentication provided
- `403 Forbidden` — User lacks permission
- `404 Not Found` — Resource not found
- `409 Conflict` — Resource already exists (e.g., duplicate email)
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Unrecoverable error; alert on-call
- `503 Service Unavailable` — Dependency unavailable (Cognito, S3); retry advised

---

## Service-Level Indicators (SLIs) & Objectives (SLOs)

### SLI Definitions

**Latency SLI:** Percentage of requests with p95 response time <200ms
- **Measurement:** CloudWatch Metrics; query `APIGatewayLatency` percentile 95
- **Calculation:** (requests completing in <200ms) / (total requests) × 100
- **SLO:** >99% of requests should satisfy this

**Availability SLI:** Percentage of successful HTTP responses (2xx/3xx)
- **Measurement:** CloudWatch; query `HTTPResponseCount` for 2xx+3xx responses
- **Calculation:** (2xx+3xx responses) / (total responses) × 100
- **SLO:** >99.9% (max 0.1% errors allowed)

**Error Rate SLI:** Percentage of user-facing errors (5xx, timeouts, service unavailable)
- **Measurement:** CloudWatch Logs; count ERROR and FATAL entries
- **Calculation:** (errors) / (total requests) × 100
- **SLO:** <0.5% (alert if >1%)

**Authentication Success SLI:** Percentage of OTP verifications and login requests that complete successfully
- **Measurement:** DynamoDB Streams or Cognito CloudTrail logs
- **Calculation:** (successful authentications) / (auth attempts) × 100
- **SLO:** >99.5%

**Document Upload Success SLI:** Percentage of S3 document uploads that complete without error
- **Measurement:** S3 event notifications or application logs
- **Calculation:** (successful uploads) / (upload attempts) × 100
- **SLO:** >99.5%

### SLO Targets (Foundation Phase)

| Metric | SLI | SLO | Alert Threshold |
|--------|-----|-----|-----------------|
| **API Latency** | p95 <200ms | 99% of requests | >500ms sustained 5 mins |
| **Overall Availability** | HTTP 2xx/3xx | 99.9% uptime | <95% in 5-min window |
| **Error Rate** | HTTP 5xx / timeout | <0.5% | >1% in 5-min window |
| **Auth Success Rate** | Cognito + local JWT | >99.5% | <98% in 5-min window |
| **Document Upload** | S3 success | >99.5% | <98% in 5-min window |
| **Database Availability** | RDS health check | 99.9% | 1 failed check triggers alert |

### Error Budget

- **Monthly error budget (99.9% SLO):** 43 minutes
- **Weekly error budget:** ~6 minutes
- **If error budget exhausted:** deploy only critical bug fixes until next calendar month; no new features

---

## Acceptance Criteria — Testing & Verification

### Functional Acceptance Criteria (per US-001 through US-006)

**US-001: Customer Registration**
- [ ] Registration form accepts valid email (RFC 5322) and phone (+971 format)
- [ ] OTP sent within 3 seconds of registration submission
- [ ] Account status set to "Pending Email Verification" immediately
- [ ] Duplicate email check prevents re-registration
- [ ] Password validation enforced (8+ chars, uppercase, number, special char)

**US-002: Emirates ID Upload**
- [ ] Presigned S3 URL generated in <100ms
- [ ] Image compressed to <2MB client-side before upload
- [ ] S3 upload succeeds 99%+ of the time (test 100 concurrent uploads)
- [ ] Document marked "Pending Verification" in admin dashboard within 5 seconds
- [ ] Admin notified of pending verification via email (SES) within 10 seconds

**US-003: Parent/Guardian Registration**
- [ ] Child DOB validates age (must be <18)
- [ ] Parental consent record created and immutable
- [ ] Parent account auto-verified upon email confirmation
- [ ] Child account linked to parent via foreign key
- [ ] Under-18 badge visible to trainers/studios

**US-004: Trainer Application**
- [ ] All trainer documents (ID, certs, references) stored in S3 partition by trainer_id
- [ ] Application status transitions: Pending Review → (Approved | Rejected | Pending Resubmission)
- [ ] Admin email notification sent within 2 seconds of decision
- [ ] Trainer notified via email of approval/rejection within 5 seconds
- [ ] Reapplication pre-fills previous form data (except rejected fields)

**US-005: Studio Registration**
- [ ] Studio address geocoded via Google Maps API; lat/lng stored
- [ ] Contract PDF generated dynamically with studio name, revenue share, dates
- [ ] Digital signature authenticated via password; timestamp recorded
- [ ] Studio appears on customer map within 60 seconds of contract signing
- [ ] Studio admin receives portal credentials via email

**US-006: Admin Approval**
- [ ] Pending applications displayed in FIFO order (by submission timestamp)
- [ ] Admin can view all trainer documents (ID image, certs, video, references)
- [ ] Approval/rejection decision recorded in immutable audit log
- [ ] No email sent until admin clicks "Confirm" (safety check)
- [ ] Trainer status changes to "Approved" / "Rejected" in real-time

### Non-Functional Acceptance Criteria

**Performance Testing**
- [ ] All endpoints meet p95 <200ms under 100 concurrent users (k6 load test, 60s duration)
- [ ] No database connection pool exhaustion (tested up to 200 concurrent connections)
- [ ] S3 presigned URL generation maintains <100ms p95 even under 500 concurrent requests
- [ ] OTP delivery <3 seconds (via SES/Twilio, tested 500 concurrent)

**Scalability Testing**
- [ ] ECS Fargate auto-scales from 2 to 10 instances under 500+ concurrent load
- [ ] Database query latency remains <100ms even with 10,000 users in database (index testing)
- [ ] Cache hit rate >90% for session/user lookups (Redis monitoring)

**Security Testing**
- [ ] SQL injection: attempt injection in every form field; all blocked by Prisma parameterization
- [ ] XSS: script tags in user input sanitized; `<script>alert('xss')</script>` rendered as text
- [ ] CSRF: POST requests without CSRF token rejected with 403
- [ ] Rate limit: 10 OTP attempts per phone blocked on 11th attempt within 1-hour window
- [ ] JWT expiry: expired tokens rejected with 401; refresh flow works

**Compliance Testing**
- [ ] All RDS/S3 data resides in me-south-1 (AWS Config rule validates bucket region)
- [ ] Encryption at rest: RDS encryption enabled via KMS; S3 encryption enabled
- [ ] No PII in logs: grep for email/phone patterns returns 0 matches in production logs
- [ ] Audit log immutable: attempt UPDATE on audit_log table returns error
- [ ] Right to erasure: delete request purges PII within 30 days (automated job verified)

**Accessibility Testing**
- [ ] All form labels associated with inputs (`<label for="...">`)
- [ ] Error messages announced to screen readers (`aria-live="polite"`)
- [ ] Color contrast >4.5:1 (WCAG AA) verified by axe or similar tool
- [ ] Touch targets >48x48px on mobile
- [ ] RTL layout tested in Arabic mode (all elements flow right-to-left)

---

## Monitoring & Alerting

### Key Metrics to Monitor (CloudWatch Dashboard)

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| API p95 latency | >500ms sustained 5 mins | Page on-call; investigate database/cache |
| Error rate (5xx) | >1% in 5-min window | Page on-call; check CloudWatch Logs |
| RDS CPU | >80% sustained | Auto-scale RDS; check for slow queries |
| RDS connections | >80 of 100 max | Alert; check for connection leaks |
| S3 upload failures | >10 in 1-hour window | Alert; check S3 service status + quotas |
| Cognito auth failures | >2% in 5-min window | Alert; check Cognito service status |
| OTP delivery latency | >5 seconds p95 | Alert; check SES/Twilio service status |

### Logging Strategy

**Structured JSON Logs (CloudWatch Logs):**
```json
{
  "timestamp": "2026-05-03T10:00:00.123Z",
  "level": "INFO",
  "service": "auth-service",
  "request_id": "req-uuid-4",
  "user_id": "user-uuid-123",
  "action": "user_registration",
  "status": "success",
  "latency_ms": 145,
  "meta": {
    "email_hash": "sha256:abc123...",
    "ip_address": "192.168.1.100"
  }
}
```

**Log Retention:**
- Hot logs (CloudWatch Logs): 30 days
- Archive (S3 Glacier): 1 year (for compliance audits)
- Purge: automatic after 1 year

**Log Levels:**
- `ERROR` / `FATAL`: production alerts (page on-call)
- `WARN`: noteworthy but non-critical (check during daily standup)
- `INFO`: important business events (registration, approval, etc.)
- `DEBUG` / `TRACE`: development only; never in production

---

## Acceptance Test Cases (Examples)

### TC-001: Customer Registration with Valid Email
**Precondition:** Customer app on registration screen  
**Steps:**
1. Enter email "ali@example.com"
2. Enter password "SecurePass123!"
3. Tap "Create Account"

**Expected:**
- OTP sent to email within 3 seconds
- Account status "Pending Email Verification" in database
- Email confirmation sent

**Pass Threshold:** Response time <200ms; OTP received in <3 seconds

---

### TC-010: Load Test — 100 Concurrent Registrations
**Tool:** k6 (load testing)  
**Script:** 100 users spawn simultaneously, each registers and verifies OTP

**Expected:**
- p50 latency: <100ms
- p95 latency: <200ms
- p99 latency: <500ms
- 0 failed requests
- 0 duplicate accounts

**Pass Threshold:** p95 <200ms; 100% success rate

---

### TC-020: Security Test — SQL Injection on Email Field
**Input:** `test@example.com' OR '1'='1`

**Expected:**
- Email validation rejects input (not RFC 5322)
- No database error exposed to user
- Error message: "Please enter a valid email address."

**Pass Threshold:** Injection blocked; no SQL error in response

---

## Sign-Off & Approval

**Technical Review:**
- [ ] Tech Lead Backend — latency/scalability targets realistic
- [ ] Tech Lead Frontend — API contracts clear for implementation
- [ ] DevOps — infrastructure can support specified load; monitoring in place
- [ ] Security — encryption, auth, compliance requirements feasible

**Stakeholder Review:**
- [ ] Product Owner — no NFRs conflict with business goals
- [ ] Compliance/Legal — PDPL and audit logging requirements met

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-03  
**Next Review:** Week 3 of Sprint 1 (performance baseline established)  
**Approval:** Pending Tech Lead & DevOps sign-off
