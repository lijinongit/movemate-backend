export const config = {
  // Server
  port: parseInt(process.env.AUTH_SERVICE_PORT || '3001'),
  host: process.env.AUTH_SERVICE_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  jwtAccessTokenExpiresIn: '1h',
  jwtRefreshTokenExpiresIn: '30d',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/movemate',

  // OTP
  otpExpiryMinutes: 5,
  otpMaxAttemptsPerHour: 5,

  // Cognito (Phase 2)
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.COGNITO_CLIENT_ID,
  cognitoRegion: process.env.AWS_REGION || 'me-south-1',

  // Adapters
  stubCognito: process.env.STUB_COGNITO === 'true',
  stubSms: process.env.STUB_SMS === 'true',
  stubEmail: process.env.STUB_EMAIL === 'true',
};

export type Config = typeof config;
