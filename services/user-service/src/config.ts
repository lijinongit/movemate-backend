export const config = {
  // Server
  port: parseInt(process.env.USER_SERVICE_PORT || '3002'),
  host: process.env.USER_SERVICE_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/movemate',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',

  // S3
  stubS3: process.env.STUB_S3 === 'true',
  s3Region: process.env.AWS_REGION || 'me-south-1',
  s3BucketDocuments: process.env.S3_BUCKET_DOCUMENTS || 'movemate-documents',
  s3BucketVideos: process.env.S3_BUCKET_VIDEOS || 'movemate-videos',

  // Document upload
  maxDocumentSizeBytes: 52428800, // 50MB
  maxVideoSizeBytes: 104857600, // 100MB
};

export type Config = typeof config;
