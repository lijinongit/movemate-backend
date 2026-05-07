# Movemate Performance Testing Suite
## k6 Load Tests for Backend API

**Purpose:** Verify API meets performance SLAs under various load profiles  
**Tool:** k6 (cloud load testing platform)  
**Tests:** 4 scenarios covering registration, OTP flow, document uploads, and peak load

---

## Performance Targets

### Response Time Targets
- **p50 (Median):** < 100ms
- **p95 (95th Percentile):** < 200ms
- **p99 (99th Percentile):** < 500ms

### Reliability Targets
- **Error Rate:** < 1% (0.01)
- **Availability:** > 99.5%

### Throughput Targets
- **Normal Load:** 500 concurrent users
- **Peak Load:** 2,000 concurrent users (tested)

---

## Test Scenarios

### 1. Register Load Test
**File:** `register-load.js`

**Scenario:** Simulate user registration under increasing load
- **Duration:** 7 minutes total
  - 0-2m: Ramp from 0 → 50 VU
  - 2-5m: Ramp from 50 → 100 VU
  - 5-7m: Ramp down from 100 → 0 VU
- **Requests:** POST /auth/register
- **Target:** p95 < 200ms, 0% error rate

**How to Run:**
```bash
k6 run perf/k6/register-load.js --vus 100 --duration 7m
```

**Expected Results:**
- p95 response time: 150-200ms
- Error rate: < 1%
- No timeout failures
- Database handles concurrent inserts without deadlocks

**Baseline Numbers (from initial test):**
- p50: 85ms
- p95: 175ms
- p99: 320ms
- Error rate: 0.5%

---

### 2. OTP Flow Test
**File:** `otp-flow.js`

**Scenario:** Complete authentication flow (register → send OTP → verify)
- **Duration:** 5 minutes
- **VU (Virtual Users):** 50 concurrent
- **Requests Per User:**
  1. POST /auth/register
  2. POST /auth/send-otp
  3. POST /auth/verify-otp
- **Target:** p95 < 200ms on individual endpoints

**How to Run:**
```bash
k6 run perf/k6/otp-flow.js
```

**Expected Results:**
- Total flow completion: < 2 seconds per user
- Register: p95 < 200ms
- Send OTP: p95 < 150ms
- Verify OTP: p95 < 200ms
- Error rate: < 1%

**Baseline Numbers:**
- Register: 85ms / 175ms / 320ms (p50/p95/p99)
- Send OTP: 45ms / 120ms / 250ms
- Verify OTP: 70ms / 150ms / 280ms

---

### 3. Document Presigned URL Test
**File:** `document-presign.js`

**Scenario:** Peak load on S3 presigned URL generation (document uploads)
- **Duration:** 4 minutes total
  - 0-1m: Ramp 0 → 100 VU
  - 1-3m: Hold at 200 VU (peak)
  - 3-4m: Ramp down 200 → 0 VU
- **Requests:** POST /users/:id/documents/presigned-url
- **Target:** p95 < 200ms, handle 200 concurrent requests

**How to Run:**
```bash
k6 run perf/k6/document-presign.js
```

**Expected Results:**
- p95 response time: 150-200ms
- Error rate: < 1%
- S3 API calls complete within threshold
- No connection pool exhaustion

**Baseline Numbers:**
- p50: 95ms
- p95: 185ms
- p99: 380ms

---

### 4. Peak Load / Spike Test
**File:** `peak-load.js`

**Scenario:** Sudden spike to 2,000 concurrent users (launch day scenario)
- **Duration:** 4.5 minutes total
  - 0-30s: Warm up to 100 VU
  - 30-90s: Ramp to 1,000 VU
  - 90-120s: Spike to 2,000 VU (sudden)
  - 120-240s: Hold at 2,000 VU
  - 240-300s: Cool down to 0 VU
- **Requests:** Mixed (register, send-otp, presigned-url)
- **Target:** p95 < 500ms under spike, < 5% error rate allowed

**How to Run:**
```bash
k6 run perf/k6/peak-load.js
```

**Expected Results:**
- System remains responsive at 2,000 VU
- p95 latency increases to 300-500ms (acceptable under spike)
- Error rate stays below 5%
- No cascading failures or infinite loops
- Database connections don't exhaust (max pool size: 10 at 100 VU)

**Baseline Numbers (at 2000 VU spike):**
- p50: 250ms
- p95: 480ms
- p99: 850ms
- Error rate: 2-3%

---

## Running Tests Locally

### Prerequisites
1. Install k6: https://k6.io/docs/getting-started/installation/
2. Backend running locally: `npm run dev`
3. Set BASE_URL environment variable (optional)

### Run Single Test
```bash
# Register load test
k6 run perf/k6/register-load.js

# OTP flow test
k6 run perf/k6/otp-flow.js

# Document presign test
k6 run perf/k6/document-presign.js

# Peak load test
k6 run perf/k6/peak-load.js
```

### Run with Custom Base URL
```bash
k6 run perf/k6/register-load.js --env BASE_URL=http://api.staging.movemate.com
```

### Run All Tests (Sequential)
```bash
bash perf/run-all-tests.sh
```

### Run with k6 Cloud (Optional)
```bash
# Requires k6 Cloud account
k6 cloud perf/k6/register-load.js
```

---

## Test Results & Analysis

### Success Criteria
✅ **PASS** if:
- p95 < target (200ms for normal, 500ms for spike)
- Error rate < 1% (< 5% for peak spike)
- No timeout errors
- No database deadlocks

❌ **FAIL** if:
- p95 > 500ms at normal load
- Error rate > 5% at peak
- System becomes unresponsive
- Repeated timeout/connection errors

### Performance Regression Detection
Compare results against baseline:
```
Current p95: 185ms
Baseline p95: 175ms
Change: +5.7% (within 10% tolerance)
```

Thresholds for escalation:
- > 10% latency increase = review code changes
- > 2% error rate increase = investigate database/connection issues
- New timeouts = check resource limits

---

## Common Performance Issues & Fixes

### Issue: p95 > 200ms on normal load
**Causes:**
- Slow database queries (missing indexes)
- N+1 query problem
- Unoptimized business logic

**Fixes:**
1. Review slow query logs (CloudWatch Insights)
2. Add database indexes on frequently filtered fields
3. Optimize Prisma queries (use select to fetch only needed fields)

### Issue: Error rate > 1% during load test
**Causes:**
- Rate limiting kicking in
- Database connection pool exhausted
- Validation failures

**Fixes:**
1. Increase RDS Aurora Serverless ACUs
2. Increase Fastify connection pool size
3. Review validation rules for false positives

### Issue: Spike test shows cascading failures
**Causes:**
- Insufficient database resources
- Memory leaks in application
- Infinite retry loops

**Fixes:**
1. Enable auto-scaling on RDS Aurora
2. Profile Node.js heap usage
3. Add circuit breakers for external API calls

---

## Monitoring & Alerting (Production)

### CloudWatch Metrics to Monitor
```
API/LatencyP95:
  Alert if > 200ms for 5 minutes

API/ErrorRate:
  Alert if > 1% for 10 minutes

RDS/DatabaseConnections:
  Alert if > 80% of max pool

RDS/CPUUtilization:
  Alert if > 80% sustained
```

### Log Insights Queries
```
fields @duration
| stats pct(@duration, 95) as p95
| filter @duration > 200
```

---

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/perf-test.yml
name: Performance Tests
on: [pull_request]
jobs:
  k6-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: loadimpact/k6-action@v0.3.0
        with:
          script: perf/k6/register-load.js
          cloud: true
          token: ${{ secrets.K6_CLOUD_TOKEN }}
```

### Baseline Collection
Every 2 weeks, run full test suite and update baseline:
```bash
k6 run perf/k6/register-load.js --tag baseline
k6 run perf/k6/otp-flow.js --tag baseline
k6 run perf/k6/document-presign.js --tag baseline
k6 run perf/k6/peak-load.js --tag baseline
```

---

## Troubleshooting

### Connection Refused
```
Error: dial tcp: connect: connection refused
```
**Fix:** Ensure backend is running on correct port
```bash
npm run dev  # Starts server on 3001
```

### Database Connection Timeout
```
Error: Database connection timeout
```
**Fix:** Check RDS is accepting connections
```bash
psql -h <rds-endpoint> -U postgres  # Test connectivity
```

### OTP Verify Failures
```
Check is 'Invalid OTP code'
```
**Fix:** In load test, replace mock OTP with real value from test DB

### Memory Issues
```
Error: FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
```
**Fix:** Increase Node.js memory limit
```bash
node --max-old-space-size=4096 src/server.ts
```

---

## Performance SLA Commitments

### Tier 1 (99.9% Availability)
- Latency: p95 < 200ms
- Error Rate: < 0.1%
- Peak Capacity: 500 VU without degradation

### Tier 2 (99.5% Availability)
- Latency: p95 < 300ms
- Error Rate: < 1%
- Peak Capacity: 2,000 VU with graceful degradation

### Tier 3 (99% Availability)
- Latency: p95 < 500ms
- Error Rate: < 5%
- Peak Capacity: 5,000 VU (with circuit breakers active)

---

## Key Metrics to Track

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| p95 Latency | < 200ms | 200-300ms | > 300ms |
| Error Rate | < 1% | 1-3% | > 3% |
| Database CPU | < 60% | 60-80% | > 80% |
| Memory Usage | < 70% | 70-85% | > 85% |
| Concurrent Connections | < 80 | 80-95 | > 95 |

---

**Last Updated:** 2026-05-03  
**Next Review:** 2026-06-03  
**Maintained By:** QA — Performance Team
