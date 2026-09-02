/**
 * Strip non-durable / unsafe fields before Mongo persistence.
 * Mongo must never store base64 media bodies.
 */

import type {
  ProviderOperationMediaOutput,
  ProviderOperationRecord,
} from "../contracts/provider-operation";

export function sanitizeOutputsForPersistence(
  outputs?: readonly ProviderOperationMediaOutput[]
): readonly ProviderOperationMediaOutput[] | undefined {
  if (!outputs?.length) return outputs;
  return outputs.map((o) => ({
    index: o.index,
    type: o.type,
    mimeType: o.mimeType,
    temporaryUrl: o.temporaryUrl,
    storageRef: o.storageRef,
    metadata: o.metadata,
  }));
}

export function sanitizeOperationForPersistence(
  record: ProviderOperationRecord
): ProviderOperationRecord {
  const usageRecorded = Boolean(record.safeMetadata?.usageRecorded);
  const safeMetadata = record.safeMetadata
    ? Object.fromEntries(
        Object.entries(record.safeMetadata).filter(([k]) => k !== "signedUrl")
      )
    : undefined;
  return {
    ...record,
    outputs: sanitizeOutputsForPersistence(record.outputs),
    safeMetadata: usageRecorded ? { ...safeMetadata, usageRecorded: true } : safeMetadata,
  };
}
