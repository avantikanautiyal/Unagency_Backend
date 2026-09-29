/**
 * Identity helpers — enforce Artifact ≠ Vault ObjectId ≠ execution Id.
 */

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const CDF_ART_PREFIX = "cdfart_";

let seq = 0;

export function resetCdfArtifactIdsForTests(): void {
  seq = 0;
}

export function isVaultAssetObjectIdShape(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

export function isExecutionIdShape(id: string): boolean {
  return id.startsWith("exec_");
}

/** Media/enterprise artifact ids (not CDF canonical). */
export function isMediaArtifactIdShape(id: string): boolean {
  return /^art_/.test(id) && !id.startsWith(CDF_ART_PREFIX);
}

export function isCdfCanonicalArtifactId(id: string): boolean {
  return id.startsWith(CDF_ART_PREFIX) && !isVaultAssetObjectIdShape(id);
}

export function assertNotVaultOrExecutionId(
  id: string,
  label = "artifactId",
): void {
  if (isVaultAssetObjectIdShape(id)) {
    throw new Error(
      `${label} must not be a Vault ObjectId (24-hex). Got: ${id}`,
    );
  }
  if (isExecutionIdShape(id)) {
    throw new Error(
      `${label} must not be an execution ID. Got: ${id}`,
    );
  }
}

export function createCdfArtifactId(artifactKey: string): string {
  seq += 1;
  const slug = artifactKey
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\./g, "-")
    .slice(0, 48);
  return `${CDF_ART_PREFIX}${Date.now().toString(36)}_${seq.toString(36)}_${slug}`;
}

export function assertCdfArtifactId(id: string): void {
  assertNotVaultOrExecutionId(id);
  if (!isCdfCanonicalArtifactId(id)) {
    throw new Error(`Invalid CDF artifact id (expected ${CDF_ART_PREFIX}*): ${id}`);
  }
}
