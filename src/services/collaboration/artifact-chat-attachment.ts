/**
 * Copy a client's generated artifact into a normal chat attachment.
 *
 * A shared artifact is otherwise only a reference (`artifactId`) that the
 * Client Servicing admin app cannot open. Copying the file the same way a
 * chat upload is stored (same bucket / prefix / ACL as `fileUpload`) lets CS
 * see creatives — and download website code ZIPs — exactly like files a
 * Human mode client uploads.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import AwsS3 from "../../config/aws.config";

/** Mirrors `multers3.middleware` (chat uploads). */
const CHAT_UPLOAD_BUCKET = "prakriadirect";
const CHAT_UPLOAD_REGION = "ap-south-1";
const MAX_ATTACHMENT_BYTES = 60 * 1024 * 1024;

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/html": "html",
};

export type ArtifactChatAttachment = {
  readonly url: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
};

function safeFileStem(value: string): string {
  return (
    value
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "creative"
  );
}

/**
 * Returns undefined when the artifact cannot be copied (not owned by the
 * caller's organization, no stored file, too large, storage unavailable) —
 * the caller then falls back to sharing the reference only.
 */
export async function copyArtifactToChatAttachment(input: {
  readonly artifactId: string;
  /** The sender's organization — the artifact must belong to it. */
  readonly organizationId: string;
  readonly label?: string;
}): Promise<ArtifactChatAttachment | undefined> {
  const artifactId = input.artifactId.trim();
  const organizationId = input.organizationId.trim();
  if (!artifactId || !organizationId) return undefined;

  const { getEnterpriseApiRuntime } = await import(
    "../../platform/api/runtime/bootstrap-enterprise-api"
  );
  const delivery =
    getEnterpriseApiRuntime()?.platform.durableStores?.asyncMedia?.mediaDelivery;
  if (!delivery) return undefined;

  // Tenant-checked read: another organization's artifact id resolves to "not found".
  const binary = await delivery.resolveArtifactBinaryForTenant(
    artifactId,
    organizationId
  );
  if (!binary.ok) return undefined;
  const { bytes, contentType } = binary.value;
  if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) return undefined;

  const mimeType = (contentType || "application/octet-stream").toLowerCase();
  const extension =
    EXTENSION_BY_MIME[mimeType] ??
    binary.value.fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ??
    "bin";
  const fileName = `${safeFileStem(input.label || binary.value.fileName || artifactId)}.${extension}`;
  const key = `mixed/${Date.now()}-${artifactId}-${fileName}`;

  await AwsS3.send(
    new PutObjectCommand({
      Bucket: CHAT_UPLOAD_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      ACL: "public-read",
    })
  );

  return {
    url: `https://${CHAT_UPLOAD_BUCKET}.s3.${CHAT_UPLOAD_REGION}.amazonaws.com/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    fileName,
    mimeType,
    size: bytes.length,
  };
}
