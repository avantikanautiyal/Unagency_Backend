/**
 * Platform blob storage configuration — reuses existing AWS credential env.
 */

export interface BlobStorageEnvConfig {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly providerInputSignedUrlTtlSeconds: number;
}

export function blobStorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): BlobStorageEnvConfig | undefined {
  const bucket = env.ENTERPRISE_BLOB_BUCKET ?? env.AWS_S3_BUCKET;
  if (!bucket?.trim()) return undefined;

  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "ap-south-1";
  const ttlRaw = Number(env.ENTERPRISE_BLOB_SIGNED_URL_TTL_SECONDS ?? 300);
  const providerInputSignedUrlTtlSeconds =
    Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.min(ttlRaw, 3600) : 300;

  return {
    bucket: bucket.trim(),
    region: region.trim(),
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    providerInputSignedUrlTtlSeconds,
  };
}

export function requireBlobStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): BlobStorageEnvConfig {
  const config = blobStorageConfigFromEnv(env);
  if (!config) {
    throw new Error(
      "Durable async media requires blob storage — set ENTERPRISE_BLOB_BUCKET or AWS_S3_BUCKET"
    );
  }
  return config;
}
