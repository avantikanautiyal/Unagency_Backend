let seq = 0;

export function resetCdfRequirementIdsForTests(): void {
  seq = 0;
}

function next(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function createSourceInputId(): string {
  return next("src");
}

export function createRequirementId(): string {
  return next("req");
}

export function createActiveBriefId(): string {
  return next("abr");
}

export function createOverrideId(): string {
  return next("ovr");
}

export function createConflictId(): string {
  return next("cnf");
}

export function checksumText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `c${(h >>> 0).toString(16)}`;
}
