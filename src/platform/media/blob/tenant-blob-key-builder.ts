/**
 * Server-controlled blob storage key construction.
 */

export function buildTenantBlobStorageKey(input: {
  organizationId: string;
  executionId: string;
  artifactId: string;
  outputIndex: number;
  extension?: string;
}): string {
  const ext = input.extension ? `.${input.extension.replace(/^\./, "")}` : "";
  return `tenant/${input.organizationId}/executions/${input.executionId}/artifacts/${input.artifactId}/output-${input.outputIndex}${ext}`;
}

export function parseStorageRefKey(storageRef: string): string {
  if (storageRef.startsWith("blob:")) return storageRef.slice("blob:".length);
  return storageRef;
}
