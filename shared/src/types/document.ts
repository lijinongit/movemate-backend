export interface DocumentMetadata {
  id: string;
  userId: string;
  documentType: string;
  s3Path: string;
  fileSizeBytes: number;
  status: 'pending_verification' | 'verified' | 'rejected' | 'expired';
  verifiedBy?: string;
  verifiedAt?: Date;
  rejectionReason?: string;
  expiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresignedUrlResponse {
  url: string;
  fields?: Record<string, string>;
  uploadId?: string;
}
