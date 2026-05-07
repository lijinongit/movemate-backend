import { logger } from '../utils/logger';

/**
 * S3 adapter interface for document storage
 * Phase 1: Stub implementation with safe defaults
 * Phase 2: Integrate with AWS SDK v3 S3 client
 */

export interface S3Adapter {
  getPresignedUploadUrl(
    userId: string,
    documentType: string,
    contentType: string,
  ): Promise<{ url: string; fields?: Record<string, string> }>;

  getPresignedDownloadUrl(s3Path: string): Promise<string>;

  deleteObject(s3Path: string): Promise<void>;
}

export class StubS3Adapter implements S3Adapter {
  async getPresignedUploadUrl(
    userId: string,
    documentType: string,
    contentType: string,
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    logger.info(
      { userId, documentType, contentType },
      'S3.getPresignedUploadUrl (STUB)',
    );

    // TODO: Integrate with AWS SDK v3
    // Real implementation would call S3.getSignedUrl('putObject', { ... })
    // with 30-minute expiry and size constraints

    return {
      url: `https://s3.me-south-1.amazonaws.com/movemate-documents/${userId}/${Date.now()}/${documentType}`,
      fields: {
        'Content-Type': contentType,
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      },
    };
  }

  async getPresignedDownloadUrl(s3Path: string): Promise<string> {
    logger.info({ s3Path }, 'S3.getPresignedDownloadUrl (STUB)');

    // TODO: Call S3.getSignedUrl('getObject', { ... }) with 5-minute expiry
    return `https://s3.me-south-1.amazonaws.com/${s3Path}?X-Amz-Signature=...`;
  }

  async deleteObject(s3Path: string): Promise<void> {
    logger.info({ s3Path }, 'S3.deleteObject (STUB)');

    // TODO: Call S3.deleteObject({ Bucket, Key })
  }
}

/**
 * Factory function to get appropriate adapter
 */
export function getS3Adapter(): S3Adapter {
  const isStub = process.env.STUB_S3 === 'true' || process.env.NODE_ENV === 'development';

  if (isStub) {
    logger.info('Using stub S3 adapter');
    return new StubS3Adapter();
  }

  // TODO: Return real S3 adapter when AWS SDK is integrated
  return new StubS3Adapter();
}
