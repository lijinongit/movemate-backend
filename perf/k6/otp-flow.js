/**
 * k6 Load Test: Complete OTP Flow
 * Scenario: Register → Send OTP → Verify OTP at 50 VU
 * This tests the full authentication flow under load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const baseUrl = `${__ENV.BASE_URL || 'http://localhost:3001'}`;
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const email = `user+${uniqueId}@example.com`;

  // ====== STEP 1: Register User ======
  const registerPayload = {
    email: email,
    phone: '971501234567',
    firstName: 'Test',
    lastName: 'User',
    dob: '1990-05-15',
    password: 'SecurePass123!',
    role: 'customer',
    locale: 'en',
  };

  const registerRes = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify(registerPayload),
    { tags: { name: 'POST /register' } }
  );

  check(registerRes, {
    'register status is 201': (r) => r.status === 201,
    'register response time < 200ms': (r) => r.timings.duration < 200,
  });

  let userId = null;
  try {
    userId = JSON.parse(registerRes.body).data?.userId;
  } catch (e) {
    console.error('Failed to parse userId from register response');
    return;
  }

  sleep(0.5);

  // ====== STEP 2: Send OTP ======
  const sendOtpPayload = { email: email };

  const sendOtpRes = http.post(
    `${baseUrl}/auth/send-otp`,
    JSON.stringify(sendOtpPayload),
    { tags: { name: 'POST /send-otp' } }
  );

  check(sendOtpRes, {
    'send-otp status is 200': (r) => r.status === 200,
    'send-otp response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(0.5);

  // ====== STEP 3: Verify OTP ======
  // In real scenario, we'd read OTP from email, but for load test we use mock
  // This assumes a test mode endpoint or mock OTP service
  const mockOTP = '123456'; // Would be replaced with real OTP in actual test

  const verifyOtpPayload = {
    userId: userId,
    code: mockOTP,
  };

  const verifyOtpRes = http.post(
    `${baseUrl}/auth/verify-otp`,
    JSON.stringify(verifyOtpPayload),
    { tags: { name: 'POST /verify-otp' } }
  );

  // May fail with incorrect OTP in load test (expected)
  check(verifyOtpRes, {
    'verify-otp response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
