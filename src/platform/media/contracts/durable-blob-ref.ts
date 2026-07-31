/**
 * Canonical durable blob reference — no credentials, no public URLs required.
 */

export interface DurableBlobRef {
  readonly blobId: string;
  readonly storageKey: string;
  readonly organizationId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum?: string;
  readonly createdAt: string;
}

export interface BlobOwnershipRecord {
  readonly storageKey: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly artifactId?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly checksum?: string;
  readonly createdAt: string;
}
