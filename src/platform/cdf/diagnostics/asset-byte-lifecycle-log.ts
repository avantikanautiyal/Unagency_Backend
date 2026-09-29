/**
 * TEMPORARY diagnostic logging for composition → OCR → VaultAsset byte lifecycle.
 * Do not log image bytes. Remove after C/E certification divergence is closed.
 */

export type CdfAssetByteLifecycleDiag = {
  readonly boundary: string;
  readonly executionId?: string;
  readonly rawArtifactId?: string | null;
  readonly compositionInputRef?: string | null;
  readonly compositionOutputRef?: string | null;
  readonly compositionOutputStorageKey?: string | null;
  readonly previewAssetRef?: string | null;
  readonly vaultAssetId?: string | null;
  readonly promotedVaultAssetId?: string | null;
  readonly mediaFileId?: string | null;
  readonly mediaArtifactId?: string | null;
  readonly finalizedArtifactId?: string | null;
  readonly storageKey?: string | null;
  readonly tenantScope?: {
    readonly organizationId?: string | null;
    readonly projectId?: string | null;
  };
  readonly mimeType?: string | null;
  readonly byteLength?: number | null;
  readonly resolverResult?: string | null;
  readonly referenceExists?: boolean;
  readonly referenceResolves?: boolean;
  readonly bytesExist?: boolean;
  readonly extra?: Readonly<Record<string, unknown>>;
};

export function logCdfAssetByteLifecycle(diag: CdfAssetByteLifecycleDiag): void {
  // eslint-disable-next-line no-console
  console.warn(
    "CDF_ASSET_BYTE_LIFECYCLE",
    JSON.stringify({
      ...diag,
      // never include bytes
      ts: new Date().toISOString(),
    }),
  );
}
