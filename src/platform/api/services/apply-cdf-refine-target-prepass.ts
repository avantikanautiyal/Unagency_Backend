/**
 * Refine of a generated visual phase → the creative being refined becomes the
 * authoritative subject reference.
 *
 * Live defect: a refine ("make the logo bigger") reached the image model with
 * only the brief, the approved upstream artwork and the logo — never the
 * creative it should change — so the model redrew the same design. The
 * session's current-phase pin is the exact version on screen (refines replace
 * the pin they modify), so it is stamped as the generation continuation and
 * applyGenerationContinuationVisualPrepass attaches its bytes, failing closed
 * when they cannot be resolved.
 */

import type { CdfGenerationContinuationSelection } from "../../cdf/types";

const VISUAL_MODALITIES = new Set(["image", "video", "hybrid"]);
const GROUNDED_ACTIONS = new Set(["MODIFY", "REGENERATE"]);

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function isCdfVisualRefineRun(
  meta: Readonly<Record<string, unknown>>,
): boolean {
  if (text(meta.refinePrompt)) return true;
  return (
    GROUNDED_ACTIONS.has(text(meta.conversationalAction)) &&
    Boolean(text(meta.refineFromExecutionId))
  );
}

/**
 * Returns metadata with the refine target stamped as the continuation, or the
 * input unchanged when this is not a refine of an already-generated visual
 * phase (first generation, multi-option / fanout phase, explicit source).
 */
export async function applyCdfRefineTargetPrepass(
  meta: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sessionId = text(meta.cdfSessionId);
  const phaseId = text(meta.cdfPhaseId);
  if (!sessionId || !phaseId) return meta;
  // The client already named the exact creative being refined.
  if (meta.cdfRefineSource === true) return meta;
  if (!isCdfVisualRefineRun(meta)) return meta;
  // A refine of an option set with no option selected refines every option:
  // each fanout leaf takes the option its own slot made last time.
  const fanoutTargetId = text(meta.generationFanoutTargetId);
  if (fanoutTargetId) return bindOwnPreviousOption(meta, sessionId, phaseId, fanoutTargetId);
  if (
    meta.generationFanoutLeaf === true ||
    text(meta.creativeOptionTargetId) ||
    meta.creativeOptionLeaf === true
  ) {
    return meta;
  }

  let artifactKey = text(meta.cdfArtifactKey);
  try {
    const { resolveCdfPhaseExecutionContract } = await import(
      "../../cdf/canonical"
    );
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: text(meta.cdfServiceId) || text(meta.service),
      phaseId,
    });
    if (!contract) return meta;
    if (!VISUAL_MODALITIES.has(String(contract.generationModality))) {
      return meta;
    }
    // Choice stages hold several creatives at once — no single refine target.
    if (contract.allowsModelGenerationFanout === true) return meta;
    artifactKey = contract.artifactKey || artifactKey;
  } catch {
    return meta;
  }

  let pins: readonly {
    artifactId: string;
    version: number;
    phaseId: string;
    artifactKey: string;
    generationExecutionId?: string;
    generationFanoutTargetId?: string;
  }[] = [];
  try {
    // Mongo-backed: the in-memory copy is empty after a restart or on
    // another worker, which silently dropped the refine target.
    const { ensureCdfSessionLoaded } = await import("../../cdf/session-store");
    pins = ((await ensureCdfSessionLoaded(sessionId))?.generatedArtifacts ?? []).filter(
      (p) =>
        p.phaseId === phaseId &&
        (!artifactKey || p.artifactKey === artifactKey) &&
        !p.generationFanoutTargetId &&
        typeof p.artifactId === "string" &&
        p.artifactId.startsWith("cdfart_") &&
        Number.isInteger(p.version) &&
        p.version >= 1,
    );
  } catch {
    return meta;
  }
  if (!pins.length) return meta;

  const refineFrom = text(meta.refineFromExecutionId);
  const distinct = new Set(pins.map((p) => `${p.artifactId}@${p.version}`));
  const exact = refineFrom
    ? pins.find((p) => p.generationExecutionId === refineFrom)
    : undefined;
  // Several distinct creatives and none named: refusing beats guessing.
  if (!exact && distinct.size > 1) return meta;
  const pin = exact ?? pins[pins.length - 1]!;
  const executionId = pin.generationExecutionId?.trim() || refineFrom;
  if (!executionId) return meta;

  console.info(
    JSON.stringify({
      scope: "cdf.refine_target",
      event: "refine_target_bound",
      sessionId,
      phaseId,
      artifactId: pin.artifactId,
      artifactVersion: pin.version,
      executionId,
      matchedRefineFrom: Boolean(exact),
      ts: new Date().toISOString(),
    }),
  );

  return withRefineTarget(meta, pin, executionId);
}

type RefinePin = {
  artifactId: string;
  version: number;
  artifactKey: string;
  generationExecutionId?: string;
};

function withRefineTarget(
  meta: Record<string, unknown>,
  pin: RefinePin & { phaseId: string },
  executionId: string,
): Record<string, unknown> {
  const continuation: CdfGenerationContinuationSelection = {
    selectionKind: "generation_continuation",
    sourcePhaseId: pin.phaseId,
    sourceArtifactKey: pin.artifactKey,
    selectedAt: new Date().toISOString(),
    executionId,
    visualArtifactId: pin.artifactId,
    visualArtifactVersion: pin.version,
    isDiagnosticRaw: false,
  };
  const {
    cdfContinuationRawArtifactIds: _raw,
    cdfContinuationFanoutTargetId: _fanout,
    ...rest
  } = meta;
  return {
    ...rest,
    cdfGenerationContinuation: continuation,
    cdfContinuationVisualArtifactId: pin.artifactId,
    cdfContinuationExecutionId: executionId,
    cdfContinuationIsDiagnosticRaw: false,
    cdfRefineSource: true,
    cdfRefineTargetArtifactId: pin.artifactId,
    cdfRefineTargetArtifactVersion: pin.version,
  };
}

/**
 * Fanout leaf of an option-set refine with no option selected: refine the
 * option this slot (same provider, same position) produced last. With no such
 * option the leaf regenerates from the brief and the refine note, as before.
 */
async function bindOwnPreviousOption(
  meta: Record<string, unknown>,
  sessionId: string,
  phaseId: string,
  fanoutTargetId: string,
): Promise<Record<string, unknown>> {
  let pin: (RefinePin & { phaseId: string }) | undefined;
  try {
    const { ensureCdfSessionLoaded } = await import("../../cdf/session-store");
    const pins = (await ensureCdfSessionLoaded(sessionId))?.generatedArtifacts ?? [];
    pin = pins
      .filter(
        (p) =>
          p.phaseId === phaseId &&
          p.generationFanoutTargetId === fanoutTargetId &&
          typeof p.artifactId === "string" &&
          p.artifactId.startsWith("cdfart_") &&
          Number.isInteger(p.version) &&
          p.version >= 1,
      )
      .at(-1);
  } catch {
    return meta;
  }
  const executionId = pin?.generationExecutionId?.trim();
  if (!pin || !executionId) return meta;
  console.info(
    JSON.stringify({
      scope: "cdf.refine_target",
      event: "refine_target_bound",
      sessionId,
      phaseId,
      artifactId: pin.artifactId,
      artifactVersion: pin.version,
      executionId,
      fanoutTargetId,
      ts: new Date().toISOString(),
    }),
  );
  return withRefineTarget(meta, pin, executionId);
}
