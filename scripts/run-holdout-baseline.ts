/**
 * Track A Phase A0 — offline holdout verification.
 *
 * Usage:
 *   npm run holdout:baseline              # intent + bind simulation (no API)
 *   npm run holdout:baseline -- --rollout # print env rollout snapshot
 *
 * Human preference scores (M2) still require creative review — fill docs/BASELINE_THIN_v1.md.
 */

import {
  BrandKnowledgeResolver,
  BrandMemoryPromoteService,
  InMemoryBrandMemoryStore,
  detectIntentGateFromBrief,
  runContinuityBindPipeline,
} from "../src/platform/os/creative";
import {
  HOLDOUT_CASES_V0,
  holdoutFixtureSlots,
  type HoldoutCaseV0,
  type HoldoutContinuityExpect,
} from "../src/platform/os/creative/holdout-cases";
import {
  captureContinuityRolloutSnapshot,
  continuityRolloutSummary,
} from "../src/platform/os/creative/continuity-rollout-status";
import type { BrandMemorySlotKey } from "../src/platform/os/creative/brand-memory-slots";

const ORG = "holdout_org";
const BRAND = "brand_northstar";

async function seedFixture(
  store: InMemoryBrandMemoryStore,
  fixture: HoldoutCaseV0["brandFixture"]
): Promise<void> {
  const promote = new BrandMemoryPromoteService(store, () => "on");
  const slots = holdoutFixtureSlots(fixture);
  const slotAsset: Partial<Record<BrandMemorySlotKey, string>> = {
    logo: "vault_logo_h01",
    colors: "vault_colors_1",
    voice: "vault_voice_1",
    productHero: "vault_product_1",
    type: "vault_type_1",
  };
  const slotFacts: Partial<
    Record<BrandMemorySlotKey, Record<string, string>>
  > = {
    colors: { primary: "navy", accent: "warm gold" },
    voice: { tone: "warm and direct" },
  };

  for (const slot of slots) {
    await promote.promoteOnApprove({
      organizationId: ORG,
      brandId: BRAND,
      artifactId: `art_${slot}`,
      artifactVersion: 1,
      executionId: `exec_seed_${slot}`,
      approvalReference: "holdout",
      slotKey: slot,
      assetId: slotAsset[slot],
      facts: slotFacts[slot],
      nowIso: "2026-08-25T12:00:00.000Z",
    });
  }
}

type OfflineResult = {
  readonly caseId: string;
  readonly intentTags: readonly string[];
  readonly requiredSlots: readonly string[];
  readonly missingSlots: readonly string[];
  readonly boundAssetIds: readonly string[];
  readonly needsAsk: boolean;
  readonly briefUnchanged: boolean;
  readonly simulated: HoldoutContinuityExpect | "skip";
  readonly pass: boolean | "manual";
  readonly note?: string;
};

async function simulateCase(
  testCase: HoldoutCaseV0
): Promise<OfflineResult> {
  const intent = detectIntentGateFromBrief(testCase.brief);
  const base = {
    caseId: testCase.id,
    intentTags: intent.intentTags,
    requiredSlots: intent.requiredSlots,
    briefUnchanged: intent.briefUnchanged,
  };

  if (
    testCase.continuityExpect === "N/A" ||
    testCase.continuityExpect === "thin_quality" ||
    testCase.phaseRequired === "A0" ||
    testCase.brief.trim().length === 0
  ) {
    return {
      ...base,
      missingSlots: [],
      boundAssetIds: [],
      needsAsk: false,
      simulated: "skip",
      pass: "manual",
      note: "Preference / thin quality — score in BASELINE_THIN_v1",
    };
  }

  if (
    testCase.service === "website" &&
    intent.requiredSlots.length === 0
  ) {
    return {
      ...base,
      missingSlots: [],
      boundAssetIds: [],
      needsAsk: false,
      simulated: testCase.continuityExpect,
      pass: "manual",
      note: "Website binds via brandId + service — verify in app integration",
    };
  }

  if (testCase.phaseRequired === "A6" && testCase.continuityExpect === "conflict_surface") {
    return {
      ...base,
      missingSlots: [],
      boundAssetIds: [],
      needsAsk: false,
      simulated: "conflict_surface",
      pass: "manual",
      note: "A6 UX — verify CONTINUITY_COLOR_CONTRADICTION in app",
    };
  }

  const store = new InMemoryBrandMemoryStore();
  await seedFixture(store, testCase.brandFixture);
  const resolver = new BrandKnowledgeResolver(store);

  const bind = await runContinuityBindPipeline({
    brief: testCase.brief,
    brandId: BRAND,
    organizationId: ORG,
    metadata: { brandId: BRAND, service: testCase.service },
    rollout: "on",
    resolver,
  });

  const missing = bind?.packet.missingRequiredSlots ?? [];
  const assetIds = bind?.metadata.assetIds;
  const boundAssetIds = Array.isArray(assetIds)
    ? assetIds.map(String)
    : typeof assetIds === "string"
      ? [assetIds]
      : [];

  let pass = false;
  let simulated: HoldoutContinuityExpect = testCase.continuityExpect;

  switch (testCase.continuityExpect) {
    case "ASK":
      pass = bind?.needsAsk === true && missing.length > 0;
      break;
    case "bind_logo":
      pass = boundAssetIds.includes("vault_logo_h01") && missing.length === 0;
      break;
    case "bind_colors":
      pass = missing.length === 0 && bind?.packet.facts.some((f) => f.key === "primary");
      break;
    case "bind_voice":
      pass =
        missing.length === 0 &&
        bind?.packet.facts.some((f) => f.key === "tone" || f.key === "voice");
      break;
    case "bind_productHero":
      pass = boundAssetIds.includes("vault_product_1");
      break;
    case "bind_brand_kit":
      pass =
        boundAssetIds.includes("vault_logo_h01") &&
        bind?.packet.facts.some((f) => f.key === "primary");
      break;
    default:
      pass = false;
  }

  return {
    ...base,
    missingSlots: missing,
    boundAssetIds,
    needsAsk: bind?.needsAsk === true,
    simulated,
    pass,
  };
}

function formatResult(r: OfflineResult): string {
  const status =
    r.pass === "manual" ? "MANUAL" : r.pass ? "PASS" : "FAIL";
  const lines = [
    `[${r.caseId}] ${status}`,
    `  expect: ${r.simulated}`,
    `  intent: ${r.intentTags.join(", ") || "(none)"}`,
    `  required: ${r.requiredSlots.join(", ") || "(none)"}`,
  ];
  if (r.missingSlots.length) {
    lines.push(`  missing: ${r.missingSlots.join(", ")}`);
  }
  if (r.boundAssetIds.length) {
    lines.push(`  bound assets: ${r.boundAssetIds.join(", ")}`);
  }
  if (r.note) lines.push(`  note: ${r.note}`);
  if (r.pass === false) {
    lines.push(`  briefUnchanged: ${r.briefUnchanged}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--rollout")) {
    const snap = captureContinuityRolloutSnapshot();
    console.log(continuityRolloutSummary(snap));
    console.log("\nRecommended dev shadow env:");
    for (const [k, v] of Object.entries(snap.recommendedDevShadow)) {
      console.log(`  ${k}=${v}`);
    }
    return;
  }

  console.log("BASELINE_THIN_v1 — offline continuity verification\n");
  const snap = captureContinuityRolloutSnapshot();
  console.log(continuityRolloutSummary(snap));
  console.log("\n--- Holdout cases ---\n");

  let autoPass = 0;
  let autoFail = 0;
  let manual = 0;

  for (const testCase of HOLDOUT_CASES_V0) {
    const result = await simulateCase(testCase);
    console.log(formatResult(result));
    console.log("");
    if (result.pass === "manual") manual += 1;
    else if (result.pass) autoPass += 1;
    else autoFail += 1;
  }

  console.log("--- Summary ---");
  console.log(`  auto PASS: ${autoPass}`);
  console.log(`  auto FAIL: ${autoFail}`);
  console.log(`  MANUAL (preference): ${manual}`);
  console.log(
    "\nNext: fill preference scores in docs/BASELINE_THIN_v1.md, then enable shadow flags in .env"
  );

  if (autoFail > 0) process.exitCode = 1;
}

void main();
