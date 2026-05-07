/**
 * k6 Load Test: Peak Load / Spike Test
 * Scenario: 2000 VU sudden spike to simulate launch day traffic
 * Purpose: Identify breaking points, database connection limits, etc.
 * Target: System should remain responsive (p95 < 500ms), no cascading failures
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Warm up
    { duration: '1m', target: 1000 },   // Ramp to 1000
    { duration: '30s', target: 2000 },  // Spike to 2000 (sudden)
    { duration: '2m', target: 2000 },   // Hold spike
    { duration: '1m', target: 0 },      // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // More lenient under spike
    http_req_failed: ['rate<0.05'],                  // Allow up to 5% errors under load
  },
};

export default function () {
  const baseUrl = `${__ENV.BASE_URL || 'http://localhost:3001'}`;

  // Vary the endpoint being tested
  const endpoint = __ITER % 3; // Cycle through 3 different endpoints

  if (endpoint === 0) {
    // Test registration endpoint
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
      email: `user+${uniqueId}@example.com`,
      phone: '971501234567',
      firstName: 'Test',
      lastName: 'User',
      dob: '1990-05-15',
      password: 'SecurePass123!',
      role: 'customer',
      locale: 'en',
    };

    const res = http.post(`${baseUrl}/auth/register`, JSON.stringify(payload), {
      tags: { name: 'POST /register' },
    });

    check(res, {
      'register success or rate limited': (r) => [201, 429].includes(r.status),
    });
  } else if (endpoint === 1) {
    // Test send OTP endpoint
    const payload = {
      email: `user+${Math.random()}@example.com`,
    };

    const res = http.post(`${baseUrl}/auth/send-otp`, JSON.stringify(payload), {
      tags: { name: 'POST /send-otp' },
    });

    check(res, {
      'send otp success or error': (r) => [200, 400, 429].includes(r.status),
    });
  } else {
    // Test presigned URL endpoint (simulated auth)
    const userId = `user-${__VU}`;
    const payload = {
      documentType: 'emirates_id',
    };

    const res = http.post(
      `${baseUrl}/users/${userId}/documents/presigned-url`,
      JSON.stringify(payload),
      {
        headers: {
          'Authorization': 'Bearer mock-token',
        },
        tags: { name: 'POST /presigned-url' },
      }
    );

    check(res, {
      'presigned response in time': (r) => r.timings.duration < 500,
    });
  }

  sleep(Math.random() * 2); // Random sleep 0-2 seconds
}
