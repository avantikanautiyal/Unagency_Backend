/**
 * Generate FE surface artifacts from Format & Production Spec (Phase 4).
 *
 * Writes:
 *  - Unagency-frontend/packages/api/src/domain/c29-spec-pixels.generated.ts
 *  - Unagency-frontend/apps/UNagency-Admin/src/features/admin/qcChecklist.generated.ts
 *
 * Run: npm run sync:format-spec-surfaces
 */

import * as fs from "fs";
import * as path from "path";
import { buildFormatSpecSurfacesSnapshot } from "../src/platform/config/format-production-spec/format-spec-surfaces";

const ROOT = path.resolve(__dirname, "../..");
const FE_API = path.join(
  ROOT,
  "Unagency-frontend/packages/api/src/domain/c29-spec-pixels.generated.ts",
);
const FE_ADMIN = path.join(
  ROOT,
  "Unagency-frontend/apps/UNagency-Admin/src/features/admin/qcChecklist.generated.ts",
);

function headerComment(kind: string): string {
  const snap = buildFormatSpecSurfacesSnapshot();
  return `/**
 * AUTO-GENERATED — do not edit by hand.
 * Kind: ${kind}
 * Spec edition: ${snap.edition}
 * Stack provenance: ${snap.provenance}
 * Generated: ${snap.generatedAt}
 * Regenerate: cd unagency-backend && npm run sync:format-spec-surfaces
 */
`;
}

function writePixels(): void {
  const snap = buildFormatSpecSurfacesSnapshot();
  const entries = snap.pixels
    .slice()
    .sort((a, b) => a.formatId.localeCompare(b.formatId))
    .map((p) => {
      const key = JSON.stringify(p.formatId);
      return `  ${key}: [${p.width}, ${p.height}], // ${p.platform} ← ${p.ruleId} (${p.status})`;
    })
    .join("\n");

  const body = `${headerComment("C29 Spec pixel register")}
export type SpecPixelSize = readonly [width: number, height: number];

/** C29 format id → Spec master pixels [w, h]. Generated from FORMAT_TO_RULE_ID + rule canvas. */
export const C29_SPEC_PIXELS_GENERATED: Readonly<Record<string, SpecPixelSize>> = Object.freeze({
${entries}
});
`;
  fs.mkdirSync(path.dirname(FE_API), { recursive: true });
  fs.writeFileSync(FE_API, body, "utf8");
  console.log(`Wrote ${FE_API} (${snap.pixels.length} formats)`);
}

function writeQcCatalog(): void {
  const snap = buildFormatSpecSurfacesSnapshot();
  const byServiceBlocks = snap.qcByService
    .map((svc) => {
      const lines = svc.labels
        .map((l) => `    ${JSON.stringify(l)},`)
        .join("\n");
      return `  ${JSON.stringify(svc.service)}: Object.freeze([\n${lines}\n  ] as const),`;
    })
    .join("\n");

  const universal = snap.universalQc
    .map((l) => `  ${JSON.stringify(l)},`)
    .join("\n");

  const body = `${headerComment("Admin QC checklist catalog")}
export const UNIVERSAL_QC_GENERATED = Object.freeze([
${universal}
] as const);

export const BY_SERVICE_QC_GENERATED: Readonly<Record<string, readonly string[]>> = Object.freeze({
${byServiceBlocks}
});
`;
  fs.mkdirSync(path.dirname(FE_ADMIN), { recursive: true });
  fs.writeFileSync(FE_ADMIN, body, "utf8");
  console.log(
    `Wrote ${FE_ADMIN} (${snap.qcByService.length} services, universal=${snap.universalQc.length})`,
  );
}

writePixels();
writeQcCatalog();
