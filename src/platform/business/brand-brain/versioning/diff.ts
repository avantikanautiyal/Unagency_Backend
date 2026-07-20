/**
 * Versioning helpers — deep path diff for Brand Brain documents.
 */

import type { BrandBrainDocument, BrandBrainVersionDiff } from "../contracts";

export function diffBrandBrainDocuments(
  from: BrandBrainDocument,
  to: BrandBrainDocument
): BrandBrainVersionDiff {
  const fromFlat = flatten(from);
  const toFlat = flatten(to);
  const fromKeys = new Set(Object.keys(fromFlat));
  const toKeys = new Set(Object.keys(toFlat));

  const addedPaths: string[] = [];
  const removedPaths: string[] = [];
  const changedPaths: string[] = [];

  for (const k of toKeys) {
    if (!fromKeys.has(k)) addedPaths.push(k);
    else if (fromFlat[k] !== toFlat[k]) changedPaths.push(k);
  }
  for (const k of fromKeys) {
    if (!toKeys.has(k)) removedPaths.push(k);
  }

  return {
    fromVersion: 0,
    toVersion: 0,
    addedPaths: addedPaths.sort(),
    removedPaths: removedPaths.sort(),
    changedPaths: changedPaths.sort(),
  };
}

function flatten(
  value: unknown,
  prefix = ""
): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || value === undefined) {
    out[prefix || "$"] = String(value);
    return out;
  }
  if (Array.isArray(value)) {
    out[prefix || "$"] = JSON.stringify(value);
    value.forEach((item, i) => {
      Object.assign(out, flatten(item, `${prefix}[${i}]`));
    });
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, flatten(v, path));
    }
    return out;
  }
  out[prefix || "$"] = String(value);
  return out;
}
