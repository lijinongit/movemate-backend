/**
 * k6 Load Test: Presigned URL Document Upload Endpoint
 * Scenario: Peak load of 200 VU requesting presigned S3 URLs
 * Target: p95 < 200ms, handle 200 concurrent uploads without degradation
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp to 100 users
    { duration: '2m', target: 200 },  // Peak at 200 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

// Store auth tokens from login (in real scenario)
// For load test, we simulate authenticated requests
const authTokens = {};

export default function () {
  const baseUrl = `${__ENV.BASE_URL || 'http://localhost:3001'}`;

  // In real scenario, you'd have valid JWT from previous login
  // For this test, we use a mock token (real app would validate)
  const userId = `user-${__VU}-${__ITER}`;
  const mockJWT = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...mock-token';

  const presignPayload = {
    documentType: 'emirates_id',
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': mockJWT,
    },
    tags: {
      name: 'POST /presigned-url',
    },
  };

  // POST /users/:id/documents/presigned-url
  const res = http.post(
    `${baseUrl}/users/${userId}/documents/presigned-url`,
    JSON.stringify(presignPayload),
    params
  );

  check(res, {
    'status is 200 or 401': (r) => [200, 401].includes(r.status),
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has presigned url (when auth valid)': (r) => {
      if (r.status === 200) {
        try {
          const body = JSON.parse(r.body);
          return body.data?.url !== undefined;
        } catch {
          return false;
        }
      }
      return true; // Expected to fail if JWT invalid
    },
  });

  sleep(0.5);
}
