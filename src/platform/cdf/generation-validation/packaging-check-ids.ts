/** Stable check id sequence for Packaging structural validators. */

let seq = 0;

export function resetPackagingCheckIdsForTests(): void {
  seq = 0;
}

export function nextPackagingCheckId(key: string): string {
  seq += 1;
  return `vchk_pack_${seq}_${key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40)}`;
}
