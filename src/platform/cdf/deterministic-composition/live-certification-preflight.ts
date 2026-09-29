/**
 * Pre-live certification preflight — shared authority + fanout pin checks.
 * No live provider calls.
 */

import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
  type GenerationFanoutPlan,
} from "../../generation/generation-fanout";
import { resolveDeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  contractRequiresDeterministicComposition,
  resolveSharedCompositionAuthority,
} from "./composition-authority-input";
import { resolveBrandMarkFromExecutionAuthority } from "./resolve-brand-mark-authority";
import { expectedTextsFromExecutionMetadata } from "../generation-validation/structural-composition-validation";
import type { CompositionCanvasSpec } from "./types";

export const LIVE_CERT_REQUIRED_TARGETS = [
  {
    providerId: "provider.openai",
    modelId: "gpt-image-2.5-sunburst",
  },
  {
    providerId: "provider.google",
    modelId: "gemini-3-pro-image",
  },
  {
    providerId: "provider.ideogram",
    modelId: "ideogram-3",
  },
] as const;

export type PreflightCheck = {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
};

export type LiveCertificationPreflightReport = {
  readonly status: "READY_FOR_LIVE_CERTIFICATION" | "BLOCKED";
  readonly checks: readonly PreflightCheck[];
  readonly sharedAuthority: {
    readonly primaryMessageSource: string;
    readonly brandSource: string;
    readonly routePin: string;
    readonly contractKind: string;
    readonly canvas: CompositionCanvasSpec;
  };
  readonly fanout: {
    readonly groupId: string;
    readonly leaves: readonly {
      readonly providerId: string;
      readonly modelId: string;
      readonly targetId: string;
      readonly generationFanoutLeaf: true;
      readonly imageFailoverChain: readonly [];
    }[];
  };
};

function check(id: string, pass: boolean, detail: string): PreflightCheck {
  return { id, pass, detail };
}

/**
 * Build a marketing_creative fanout plan with all three cert families executable.
 */
export function buildLiveCertFanoutPlan(groupId: string): GenerationFanoutPlan {
  return planImageGenerationFanout({
    useCase: "marketing_creative",
    groupId,
    executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    providerFamilies: GENERATION_FANOUT_PROVIDER_FAMILIES,
    maxTargets: 3,
  });
}

/**
 * Assert shared composition authority can be recovered from representative
 * fanout leaf metadata (CMR + assets + selected artifact stamps) without
 * live providers.
 */
export function runLiveCertificationPreflight(input: {
  readonly fanoutGroupId: string;
  readonly leafMetadataSamples: readonly Record<string, unknown>[];
  readonly canvas: CompositionCanvasSpec;
}): LiveCertificationPreflightReport {
  const checks: PreflightCheck[] = [];
  const plan = buildLiveCertFanoutPlan(input.fanoutGroupId);

  checks.push(
    check(
      "exactly_three_fanout_leaves",
      plan.targets.length === 3,
      `targets=${plan.targets.length}`,
    ),
  );

  for (const required of LIVE_CERT_REQUIRED_TARGETS) {
    const hit = plan.targets.find(
      (t) =>
        t.providerId === required.providerId && t.modelId === required.modelId,
    );
    checks.push(
      check(
        `target_${required.providerId}`,
        Boolean(hit),
        hit
          ? `${hit.providerId}/${hit.modelId}`
          : `missing ${required.providerId}/${required.modelId}`,
      ),
    );
  }

  const leafMetas = plan.targets.map((t) =>
    buildGenerationFanoutLeafMetadata({ plan, target: t }),
  );
  checks.push(
    check(
      "all_leaves_fanout_flag",
      leafMetas.every((m) => m.generationFanoutLeaf === true),
      "generationFanoutLeaf=true",
    ),
  );
  checks.push(
    check(
      "no_cross_leaf_failover",
      leafMetas.every(
        (m) =>
          Array.isArray(m.imageFailoverChain) &&
          m.imageFailoverChain.length === 0,
      ),
      "imageFailoverChain=[]",
    ),
  );

  // Shared authority across provided leaf samples
  const contract = resolveDeliverableCompositionContract("social_creative");
  checks.push(
    check(
      "composition_contract",
      Boolean(contract) &&
        contractRequiresDeterministicComposition(contract),
      `kind=${contract?.kind ?? "null"}`,
    ),
  );

  const primaries: string[] = [];
  const brandProvenances: string[] = [];
  const routePins: string[] = [];

  for (const sample of input.leafMetadataSamples) {
    const primary =
      expectedTextsFromExecutionMetadata(sample)[0] ??
      (typeof sample.cdfSelectedPrimaryMessage === "string"
        ? sample.cdfSelectedPrimaryMessage
        : "");
    primaries.push(primary.trim());
    const brand = resolveBrandMarkFromExecutionAuthority(sample);
    brandProvenances.push(brand?.provenance ?? "MISSING");
    const routeId =
      typeof sample.cdfSelectedArtifactId === "string"
        ? sample.cdfSelectedArtifactId
        : "";
    const routeVer = sample.cdfSelectedArtifactVersion;
    routePins.push(`${routeId}@${routeVer}`);
  }

  const primaryOk =
    primaries.length > 0 &&
    primaries.every((p) => p.length > 0) &&
    new Set(primaries).size === 1;
  checks.push(
    check(
      "shared_primary_message",
      primaryOk,
      primaryOk
        ? `source=CMR_or_stamp; identical across ${primaries.length} leaves`
        : `primaries=${JSON.stringify(primaries)}`,
    ),
  );

  const brandOk =
    brandProvenances.length > 0 &&
    brandProvenances.every((p) => p !== "MISSING") &&
    new Set(brandProvenances).size >= 1;
  checks.push(
    check(
      "deterministic_brand_bytes",
      brandOk,
      brandOk
        ? `provenance=${brandProvenances[0]}`
        : `brand=${JSON.stringify(brandProvenances)}`,
    ),
  );

  const routeOk =
    routePins.length > 0 &&
    routePins.every((p) => /.+@\d+$/.test(p) && !p.startsWith("@")) &&
    new Set(routePins).size === 1;
  checks.push(
    check(
      "exact_route_xv",
      routeOk,
      routeOk ? `pin=${routePins[0]}` : `pins=${JSON.stringify(routePins)}`,
    ),
  );

  checks.push(
    check(
      "canvas_1080",
      input.canvas.widthPx === 1080 && input.canvas.heightPx === 1080,
      `${input.canvas.widthPx}x${input.canvas.heightPx}`,
    ),
  );
  checks.push(
    check(
      "safe_area_72",
      input.canvas.safeArea.top === 72 &&
        input.canvas.safeArea.right === 72 &&
        input.canvas.safeArea.bottom === 72 &&
        input.canvas.safeArea.left === 72,
      JSON.stringify(input.canvas.safeArea),
    ),
  );

  // Authority resolve on first sample
  const sample0 = input.leafMetadataSamples[0] ?? {};
  const brand0 = resolveBrandMarkFromExecutionAuthority(sample0);
  const authority = resolveSharedCompositionAuthority({
    contract: contract!,
    canvas: input.canvas,
    primaryMessage: primaries[0] ?? "",
    brandMark: brand0,
    selectedRoute:
      typeof sample0.cdfSelectedArtifactId === "string" &&
      sample0.cdfSelectedArtifactVersion != null
        ? {
            artifactId: String(sample0.cdfSelectedArtifactId),
            artifactVersion: Number(sample0.cdfSelectedArtifactVersion),
            artifactKey:
              typeof sample0.cdfSelectedArtifactKey === "string"
                ? sample0.cdfSelectedArtifactKey
                : "social-media.routes",
          }
        : undefined,
  });
  checks.push(
    check(
      "shared_composition_authority_resolves",
      authority.ok === true,
      authority.ok ? "ok" : authority.reason,
    ),
  );

  // Matrix model pins for marketing_creative (ChatGPT + two Gemini slots)
  const plannedPins = plan.targets.map((t) => `${t.providerId}/${t.modelId}`);
  for (const required of LIVE_CERT_REQUIRED_TARGETS) {
    const pin = `${required.providerId}/${required.modelId}`;
    checks.push(
      check(
        `matrix_${required.providerId}_${required.modelId}`,
        plannedPins.includes(pin),
        plannedPins.includes(pin) ? pin : `missing ${pin} in ${plannedPins.join(",")}`,
      ),
    );
  }

  const allPass = checks.every((c) => c.pass);
  return {
    status: allPass ? "READY_FOR_LIVE_CERTIFICATION" : "BLOCKED",
    checks,
    sharedAuthority: {
      primaryMessageSource: "CMR.requiredRenderedCommunication / expectedTextsFromExecutionMetadata",
      brandSource: brandProvenances[0] ?? "MISSING",
      routePin: routePins[0] ?? "MISSING",
      contractKind: contract?.kind ?? "null",
      canvas: input.canvas,
    },
    fanout: {
      groupId: plan.groupId,
      leaves: plan.targets.map((t) => {
        const meta = buildGenerationFanoutLeafMetadata({ plan, target: t });
        return {
          providerId: meta.preferredProviderId,
          modelId: meta.preferredModelId,
          targetId: meta.generationFanoutTargetId,
          generationFanoutLeaf: true as const,
          imageFailoverChain: [] as const,
        };
      }),
    },
  };
}
