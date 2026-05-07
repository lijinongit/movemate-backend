# Movemate Backend — Foundation (Phase 1)

Production-quality Node 20 LTS + TypeScript + Fastify backend for the Movemate on-demand coaching platform.

## Architecture

- **Monorepo:** npm workspaces (no pnpm/yarn)
- **Services:** auth-service, user-service (in services/)
- **Shared:** Utilities, middleware, adapters (shared/)
- **Database:** PostgreSQL 15 (AWS Aurora Serverless v2)
- **ORM:** Prisma

## Quick Start

### Setup

```bash
# Install dependencies
npm ci

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npx prisma generate

# Run database migrations
npm run prisma:migrate

# Seed database (optional, for development)
npm run prisma:seed
```

### Development

```bash
# Run all services in watch mode
npm run dev

# Run individual service
npm --workspace=@movemate/auth-service run dev
npm --workspace=@movemate/user-service run dev
```

### Build & Test

```bash
# Build all workspaces
npm run build

# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm test
```

## Services

### Auth Service (port 3001)

User registration, login, OTP verification, JWT token management.

**Endpoints:**
- `POST /auth/register` — Register new customer/trainer
- `POST /auth/send-otp` — Send/resend OTP
- `POST /auth/verify-otp` — Verify OTP and issue JWT
- `POST /auth/login` — Direct login with password
- `POST /auth/refresh-token` — Refresh JWT tokens
- `POST /auth/logout` — Logout and revoke tokens
- `GET /healthz` — Health check

### User Service (port 3002)

User profile management, document uploads, parental consent.

**Endpoints:**
- `GET /users/me` — Current user profile
- `GET /users/:id` — Get user by ID
- `PATCH /users/:id` — Update profile
- `POST /users/:id/documents/presigned-url` — Get S3 upload URL
- `POST /users/:id/documents/verify` — Verify document upload
- `GET /users/:id/documents` — List documents
- `POST /users/:id/documents/:docId/approve` — Admin approve
- `POST /users/:id/documents/:docId/reject` — Admin reject
- `POST /users/:id/parental-consent` — Request parental consent
- `GET /users/:id/parental-consent` — Get consent record
- `POST /users/:id/parental-consent/complete` — Complete consent
- `GET /healthz` — Health check

## Key Features

### Security

- Password hashing: Argon2 (fallback: bcrypt)
- JWT authentication with refresh token rotation
- AES-256-GCM encryption for sensitive fields (phone, DOB, Emirates ID)
- Rate limiting on public endpoints
- CSRF protection via SameSite cookies
- PII redaction in logs

### Validation

- Zod schemas for all inputs
- Email, phone (UAE E.164), password strength validation
- Database constraints for additional safety

### Adapters (Stubbed for Phase 1)

- **Cognito:** User authentication (fallback to local bcrypt)
- **S3:** Document storage (mock implementation)
- **SMS/Email:** OTP and transactional messages (console logging in dev)

## Database

### Schema Highlights

- **User:** Base entity with role discriminator (customer, trainer, studio_admin, platform_admin)
- **Customer/Trainer:** Role-specific tables
- **Document:** Unified PII storage (Emirates ID, certificates, videos)
- **ParentalConsent:** Under-18 protection with immutable consent records
- **AuditLog:** Immutable event stream for compliance
- **OtpRequest:** Short-lived OTP codes (5-min expiry)
- **Session:** Refresh token management with revocation

### Soft Deletes

All entities use soft deletes (`deleted_at` timestamp) for PDPL compliance and data recovery.

### Encryption

- **At rest:** RDS native encryption (KMS customer-managed key)
- **In transit:** TLS 1.3
- **Application level:** AES-256-GCM for phone, DOB, Emirates ID number

## Environment Variables

See `.env.example` for full list. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing key (change in production)
- `ENCRYPTION_KEY` — AES-256 encryption key (hex-encoded, 32 bytes)
- `STUB_*` — Use stub adapters for development

## Testing Strategy

- **Unit tests:** Shared utilities and adapters (Jest)
- **Integration tests:** API routes with stubbed dependencies (Supertest)
- **E2E tests:** Full flows with real database (TBD in Phase 2)

Placeholder `__tests__` folders created; tests are written by QA team.

## Logging

Structured JSON logging via Pino with:

- PII redaction (password, phone, DOB, tokens, OTP)
- Request ID propagation for tracing
- Log levels: debug, info, warn, error
- CloudWatch Logs integration (Phase 2)

## Deployment

### Docker

Each service has a Dockerfile for ECS Fargate deployment.

```bash
docker build -t movemate-auth-service:latest -f services/auth-service/Dockerfile .
docker build -t movemate-user-service:latest -f services/user-service/Dockerfile .
```

### CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) enforces:

- TypeScript strict mode
- 80% test coverage minimum
- npm audit for security
- Build verification

## Phase 1 Simplifications

The following are intentionally stubbed for the foundation slice:

- **Cognito:** Local password hashing used; Cognito integration in Phase 2
- **S3 Presigned URLs:** Mock implementation; real AWS SDK in Phase 2
- **Notifications:** Console logging only; SES/Twilio integration in Phase 2
- **KMS:** Encryption key from environment; AWS KMS integration in Phase 2
- **Trainer Approvals:** Pending UI/workflow; admin routes implemented
- **Multi-language:** Locale field added; i18n in Phase 2

## TODO for Phase 2

- Integrate AWS Cognito SDK
- Integrate AWS S3 SDK v3
- Implement SES/Twilio adapters
- Add real-time WebSocket for availability
- Trainer/studio approval workflows UI
- Email templates (SES)
- Subscription logic
- Booking service
- Payment integration (Stripe)

## Error Handling

All endpoints return RFC 7807 Problem Details format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": { "field": "email" }
  },
  "meta": {
    "request_id": "req-uuid",
    "timestamp": "2026-05-03T10:00:00Z"
  }
}
```

## Monitoring & Logging

- CloudWatch Logs: structured JSON logs with PII redaction
- Metrics: latency, errors, database queries
- Alerts: error rate >1%, p95 latency >500ms, auth failures >2%
- Audit log: all sensitive actions immutable and queryable

## References

- Prisma: https://www.prisma.io/docs/
- Fastify: https://www.fastify.io/docs/latest/
- Zod: https://zod.dev/
- JWT: https://tools.ietf.org/html/rfc7519
- RFC 7807: https://tools.ietf.org/html/rfc7807

## License

Movemate Backend © 2026. All rights reserved.
