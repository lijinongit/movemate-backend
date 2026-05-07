/**
 * k6 Load Test: User Registration Endpoint
 * Scenario: Ramp from 0 to 100 concurrent users over 5 minutes
 * Target: p95 < 200ms, 0% error rate
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },  // Ramp to 50 users over 2 minutes
    { duration: '3m', target: 100 }, // Ramp to 100 over next 3 minutes
    { duration: '2m', target: 0 },   // Ramp down to 0 over 2 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'], // p95 < 200ms, p99 < 500ms
    http_req_failed: ['rate<0.01'],                 // Error rate < 1%
  },
};

export default function () {
  const baseUrl = `${__ENV.BASE_URL || 'http://localhost:3001'}`;

  // Generate unique email for each iteration
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const email = `user+${uniqueId}@example.com`;

  const payload = {
    email: email,
    phone: '971501234567',
    firstName: 'Test',
    lastName: 'User',
    dob: '1990-05-15',
    password: 'SecurePass123!',
    role: 'customer',
    locale: 'en',
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      name: 'POST /register',
    },
  };

  // POST /register
  const res = http.post(`${baseUrl}/auth/register`, JSON.stringify(payload), params);

  check(res, {
    'status is 201': (r) => r.status === 201,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'response has userId': (r) => JSON.parse(r.body).data?.userId !== undefined,
    'response has status': (r) => JSON.parse(r.body).data?.status !== undefined,
  });

  sleep(1); // Wait 1 second between requests per user
}
