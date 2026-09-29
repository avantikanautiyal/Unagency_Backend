/**
 * Central generation reference resolver.
 * Deterministic only — ambiguous/unresolved never silently guessed.
 */

import {
  detectReferenceSpans,
  isDesignKey,
  isSlideContentKey,
  isStorylineKey,
  isSelectableChoiceArtifactKey,
  parseExplicitSlideNumber,
  parseExplicitVersionNumber,
  parseOptionReference,
  parseOrdinalSlide,
} from "./parse";
import type {
  GenerationReferenceCandidate,
  GenerationReferenceResolutionResult,
  GenerationResolutionMethod,
  ResolveGenerationReferencesInput,
  ResolvedGenerationReference,
} from "./types";

function summary(c: GenerationReferenceCandidate): string {
  return `${c.artifactKey ?? "artifact"} ${c.artifactId}@${c.version}${
    c.sessionRole ? ` (${c.sessionRole})` : ""
  }`;
}

function byKey(
  candidates: readonly GenerationReferenceCandidate[],
  pred: (c: GenerationReferenceCandidate) => boolean,
): GenerationReferenceCandidate[] {
  return candidates.filter(pred);
}

function uniqueOrAmbiguous(
  hits: readonly GenerationReferenceCandidate[],
):
  | { status: "ok"; hit: GenerationReferenceCandidate }
  | { status: "ambiguous"; hits: readonly GenerationReferenceCandidate[] }
  | { status: "none" } {
  if (hits.length === 0) return { status: "none" };
  if (hits.length === 1) return { status: "ok", hit: hits[0]! };
  // Same artifactId@version duplicates collapse
  const keys = new Set(hits.map((h) => `${h.artifactId}@${h.version}`));
  if (keys.size === 1) return { status: "ok", hit: hits[0]! };
  return { status: "ambiguous", hits };
}

function artifactRef(
  sourceText: string,
  hit: GenerationReferenceCandidate,
  referenceType: ResolvedGenerationReference["referenceType"],
  method: GenerationResolutionMethod,
  provenance: string[],
  status: "exact" | "deterministic" = "deterministic",
): ResolvedGenerationReference {
  return {
    sourceText,
    referenceType,
    targetType: isDesignKey(hit.artifactKey)
      ? hit.artifactKey!.includes("design-route")
        ? "design_route"
        : "design_system"
      : "artifact_version",
    status,
    resolutionMethod: method,
    provenance: Object.freeze(provenance),
    targetId: `${hit.artifactId}@${hit.version}`,
    artifactId: hit.artifactId,
    version: hit.version,
    artifactKey: hit.artifactKey,
    phaseId: hit.phaseId,
  };
}

function ambiguousRef(
  sourceText: string,
  referenceType: ResolvedGenerationReference["referenceType"],
  hits: readonly GenerationReferenceCandidate[],
  reason: string,
): ResolvedGenerationReference {
  return {
    sourceText,
    referenceType,
    targetType: "unknown",
    status: "ambiguous",
    resolutionMethod: "unresolved",
    provenance: Object.freeze([reason]),
    candidateSummaries: Object.freeze(hits.map(summary)),
    reason,
  };
}

function unresolvedRef(
  sourceText: string,
  referenceType: ResolvedGenerationReference["referenceType"],
  reason: string,
): ResolvedGenerationReference {
  return {
    sourceText,
    referenceType,
    targetType: "unknown",
    status: "unresolved",
    resolutionMethod: "unresolved",
    provenance: Object.freeze([reason]),
    reason,
  };
}

function resolveSlideNumber(
  slideNumber: number,
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  method: GenerationResolutionMethod,
): ResolvedGenerationReference {
  const decks = byKey(
    candidates,
    (c) =>
      (c.slideCount != null && c.slideCount > 0) ||
      isSlideContentKey(c.artifactKey) ||
      Boolean(c.artifactKey?.includes("presentation.deck")),
  );
  // Prefer slide-content / deck with structured slides
  const withSlides = decks.filter((c) => (c.slideCount ?? 0) > 0);
  const pool = withSlides.length ? withSlides : decks;

  if (pool.length === 0) {
    // Still emit slide target without artifact when number is explicit
    return {
      sourceText,
      referenceType: "slide",
      targetType: "slide",
      status: "exact",
      resolutionMethod: method,
      provenance: Object.freeze([`explicit_slide:${slideNumber}`]),
      slideNumber,
      targetId: `slide:${slideNumber}`,
    };
  }

  const pick = uniqueOrAmbiguous(pool);
  if (pick.status === "ambiguous") {
    // Explicit slide index still wins as a slide target; attach first deck only if unique key family
    const contentOnly = pool.filter((c) => isSlideContentKey(c.artifactKey));
    const one = uniqueOrAmbiguous(contentOnly.length ? contentOnly : pool);
    if (one.status !== "ok") {
      return ambiguousRef(sourceText, "slide", pick.hits, "ambiguous_deck_source");
    }
    const hit = one.hit;
    if (hit.slideCount != null && slideNumber > hit.slideCount) {
      return unresolvedRef(
        sourceText,
        "slide",
        `slide_${slideNumber}_out_of_range_${hit.slideCount}`,
      );
    }
    return {
      sourceText,
      referenceType: "slide",
      targetType: "slide",
      status: "exact",
      resolutionMethod: method,
      provenance: Object.freeze([
        `explicit_slide:${slideNumber}`,
        summary(hit),
      ]),
      slideNumber,
      slideId: hit.slideIds?.[slideNumber - 1],
      artifactId: hit.artifactId,
      version: hit.version,
      artifactKey: hit.artifactKey,
      phaseId: hit.phaseId,
      targetId: `${hit.artifactId}@${hit.version}#slide:${slideNumber}`,
    };
  }
  if (pick.status === "none") {
    return unresolvedRef(sourceText, "slide", "no_slide_structure");
  }
  const hit = pick.hit;
  if (hit.slideCount != null && slideNumber > hit.slideCount) {
    return unresolvedRef(
      sourceText,
      "slide",
      `slide_${slideNumber}_out_of_range_${hit.slideCount}`,
    );
  }
  return {
    sourceText,
    referenceType: "slide",
    targetType: "slide",
    status: "exact",
    resolutionMethod: method,
    provenance: Object.freeze([`explicit_slide:${slideNumber}`, summary(hit)]),
    slideNumber,
    slideId: hit.slideIds?.[slideNumber - 1],
    artifactId: hit.artifactId,
    version: hit.version,
    artifactKey: hit.artifactKey,
    phaseId: hit.phaseId,
    targetId: `${hit.artifactId}@${hit.version}#slide:${slideNumber}`,
  };
}

/**
 * Resolve "option N" / "Nth option" against a unique upstream selectable
 * choice artifact (storyline / routes / directions / selected parent, etc.).
 * Does not invent which option content to use beyond the index; binds to exact ArtifactVersion.
 */
function resolveOptionIndex(
  optionIndex: number,
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  method: GenerationResolutionMethod,
): ResolvedGenerationReference {
  const choiceSets = byKey(
    candidates,
    (c) =>
      isSelectableChoiceArtifactKey(c.artifactKey) ||
      c.sessionRole === "selected" ||
      c.role === "selected_reference",
  );
  const selectedOnly = byKey(
    choiceSets,
    (c) => c.sessionRole === "selected" || c.role === "selected_reference",
  );
  const approvedChoice = byKey(
    choiceSets,
    (c) => c.sessionRole === "approved" || !c.sessionRole,
  );
  const previous = byKey(
    candidates,
    (c) =>
      c.sessionRole === "generated" ||
      c.sessionRole === "approved" ||
      c.sessionRole === "selected",
  );
  const pool =
    selectedOnly.length === 1
      ? selectedOnly
      : approvedChoice.length === 1
        ? approvedChoice
        : choiceSets.length === 1
          ? choiceSets
          : previous.length === 1
            ? previous
            : [];

  if (pool.length === 0) {
    if (choiceSets.length > 1 || previous.length > 1) {
      return ambiguousRef(
        sourceText,
        "option",
        choiceSets.length > 1 ? choiceSets : previous,
        "ambiguous_option_source",
      );
    }
    return unresolvedRef(sourceText, "option", "no_option_source_artifact");
  }

  const hit = pool[0]!;
  return {
    sourceText,
    referenceType: "option",
    targetType: "option",
    status: "exact",
    resolutionMethod: method,
    provenance: Object.freeze([
      `option_index:${optionIndex}`,
      summary(hit),
    ]),
    optionIndex,
    artifactId: hit.artifactId,
    version: hit.version,
    artifactKey: hit.artifactKey,
    phaseId: hit.phaseId,
    targetId: `${hit.artifactId}@${hit.version}#option:${optionIndex}`,
  };
}

function resolvePreviousOutput(
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  phaseId?: string,
): ResolvedGenerationReference {
  const generated = byKey(candidates, (c) => c.sessionRole === "generated");
  const genPick = uniqueOrAmbiguous(generated);
  if (genPick.status === "ok") {
    return artifactRef(
      sourceText,
      genPick.hit,
      "previous_output",
      "generated_artifact",
      ["previous_output:generated", summary(genPick.hit)],
    );
  }
  if (genPick.status === "ambiguous") {
    return ambiguousRef(
      sourceText,
      "previous_output",
      genPick.hits,
      "ambiguous_generated",
    );
  }

  // Prefer approved dependency that is not the current phase's own key when known
  const approved = byKey(candidates, (c) => c.sessionRole === "approved");
  const relevant = phaseId
    ? approved.filter((c) => c.phaseId !== phaseId)
    : approved;
  const pool = relevant.length ? relevant : approved;
  const pick = uniqueOrAmbiguous(pool);
  if (pick.status === "ok") {
    return artifactRef(
      sourceText,
      pick.hit,
      "previous_output",
      "previous_phase_output",
      ["previous_output:approved_dependency", summary(pick.hit)],
    );
  }
  if (pick.status === "ambiguous") {
    // Prefer slide-content when multiple approved deps (common CDF path)
    const slideContent = pool.filter((c) => isSlideContentKey(c.artifactKey));
    const sc = uniqueOrAmbiguous(slideContent);
    if (sc.status === "ok") {
      return artifactRef(
        sourceText,
        sc.hit,
        "previous_output",
        "previous_phase_output",
        ["previous_output:prefer_slide_content", summary(sc.hit)],
      );
    }
    return ambiguousRef(
      sourceText,
      "previous_output",
      pick.hits,
      "ambiguous_previous_output",
    );
  }

  const any = uniqueOrAmbiguous(candidates);
  if (any.status === "ok") {
    return artifactRef(
      sourceText,
      any.hit,
      "previous_output",
      "previous_phase_output",
      ["previous_output:single_candidate", summary(any.hit)],
    );
  }
  if (any.status === "ambiguous") {
    return ambiguousRef(
      sourceText,
      "previous_output",
      any.hits,
      "ambiguous_previous_output",
    );
  }
  return unresolvedRef(sourceText, "previous_output", "no_previous_output");
}

function resolveApprovedByKey(
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  pred: (c: GenerationReferenceCandidate) => boolean,
  referenceType: ResolvedGenerationReference["referenceType"],
): ResolvedGenerationReference {
  const approved = byKey(
    candidates,
    (c) => (c.sessionRole === "approved" || !c.sessionRole) && pred(c),
  );
  const pick = uniqueOrAmbiguous(
    approved.length ? approved : byKey(candidates, pred),
  );
  if (pick.status === "ok") {
    return artifactRef(
      sourceText,
      pick.hit,
      referenceType,
      "approved_artifact",
      ["approved_artifact", summary(pick.hit)],
      "exact",
    );
  }
  if (pick.status === "ambiguous") {
    return ambiguousRef(sourceText, referenceType, pick.hits, "ambiguous_approved");
  }
  return unresolvedRef(sourceText, referenceType, "no_approved_match");
}

function resolveDesign(
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  prefer: "selected" | "approved" | "any",
): ResolvedGenerationReference {
  const designs = byKey(candidates, (c) => isDesignKey(c.artifactKey));
  const filtered =
    prefer === "selected"
      ? designs.filter((c) => c.sessionRole === "selected")
      : prefer === "approved"
        ? designs.filter((c) => c.sessionRole === "approved")
        : designs;
  const pool = filtered.length ? filtered : designs;
  const systems = pool.filter((c) => c.artifactKey?.includes("design-system"));
  const routes = pool.filter((c) => c.artifactKey?.includes("design-route"));

  // Prefer single design-system when "same design"
  const preferPool = systems.length === 1 ? systems : pool;
  const pick = uniqueOrAmbiguous(preferPool);
  if (pick.status === "ok") {
    return artifactRef(
      sourceText,
      pick.hit,
      pick.hit.artifactKey?.includes("design-route")
        ? "design_route"
        : "design_system",
      prefer === "selected" ? "selected_artifact" : "design_reference",
      [`design:${prefer}`, summary(pick.hit)],
    );
  }
  if (pick.status === "ambiguous") {
    // If both system + route for same selection, prefer system only when one system
    if (systems.length === 1 && routes.length >= 1 && prefer !== "approved") {
      return artifactRef(
        sourceText,
        systems[0]!,
        "design_system",
        prefer === "selected" ? "selected_artifact" : "design_reference",
        ["design:prefer_system_over_route", summary(systems[0]!)],
      );
    }
    return ambiguousRef(sourceText, "design_system", pick.hits, "ambiguous_design");
  }
  return unresolvedRef(sourceText, "design_system", "no_design_candidate");
}

function resolveExplicitVersion(
  sourceText: string,
  version: number,
  candidates: readonly GenerationReferenceCandidate[],
): ResolvedGenerationReference {
  const hits = byKey(candidates, (c) => c.version === version);
  const pick = uniqueOrAmbiguous(hits);
  if (pick.status === "ok") {
    return artifactRef(
      sourceText,
      pick.hit,
      "artifact_version",
      "explicit_artifact_version",
      [`explicit_version:${version}`, summary(pick.hit)],
      "exact",
    );
  }
  if (pick.status === "ambiguous") {
    // Same artifactId different keys unlikely; if same id collapse
    const byId = new Map<string, GenerationReferenceCandidate[]>();
    for (const h of pick.hits) {
      const list = byId.get(h.artifactId) ?? [];
      list.push(h);
      byId.set(h.artifactId, list);
    }
    if (byId.size === 1) {
      const only = pick.hits[0]!;
      return artifactRef(
        sourceText,
        only,
        "artifact_version",
        "explicit_artifact_version",
        [`explicit_version:${version}`, summary(only)],
        "exact",
      );
    }
    return ambiguousRef(
      sourceText,
      "artifact_version",
      pick.hits,
      "ambiguous_version_target",
    );
  }

  // Version requested but not among candidates — do NOT substitute another version.
  const sameFamily = candidates.filter((c) => c.version !== version);
  if (sameFamily.length) {
    return unresolvedRef(
      sourceText,
      "artifact_version",
      `version_${version}_not_in_authorized_candidates`,
    );
  }
  return unresolvedRef(sourceText, "artifact_version", "no_version_candidate");
}

function resolveDeictic(
  sourceText: string,
  candidates: readonly GenerationReferenceCandidate[],
  selectedSlideNumber: number | undefined,
  ctiArtifactId: string | undefined,
  ctiArtifactVersion: number | undefined,
): ResolvedGenerationReference {
  // Explicit CTI hint only if it matches an authorized candidate.
  if (ctiArtifactId) {
    const hits = byKey(
      candidates,
      (c) =>
        c.artifactId === ctiArtifactId &&
        (ctiArtifactVersion == null || c.version === ctiArtifactVersion),
    );
    const pick = uniqueOrAmbiguous(hits);
    if (pick.status === "ok") {
      return artifactRef(
        sourceText,
        pick.hit,
        "deictic",
        "existing_cti_target",
        ["deictic:cti", summary(pick.hit)],
      );
    }
  }

  if (selectedSlideNumber != null) {
    return resolveSlideNumber(
      selectedSlideNumber,
      sourceText,
      candidates,
      "current_phase_target",
    );
  }

  const single = uniqueOrAmbiguous(candidates);
  if (single.status === "ok") {
    return artifactRef(
      sourceText,
      single.hit,
      "deictic",
      "current_phase_target",
      ["deictic:single_candidate", summary(single.hit)],
    );
  }
  if (single.status === "ambiguous") {
    return unresolvedRef(sourceText, "deictic", "ambiguous_deictic");
  }
  return unresolvedRef(sourceText, "deictic", "unresolved_deictic");
}

/**
 * Resolve conversational references against already-authorized candidates.
 * Never rewrites the instruction. Never guesses under ambiguity.
 */
export function resolveGenerationReferences(
  input: ResolveGenerationReferencesInput,
): GenerationReferenceResolutionResult {
  const instruction = input.instruction ?? "";
  const candidates = input.candidates ?? [];
  const spans = detectReferenceSpans(instruction);
  const refs: ResolvedGenerationReference[] = [];

  // Explicit slide always processed (and wins over selected).
  const explicitSlide = parseExplicitSlideNumber(instruction);
  if (explicitSlide != null) {
    const span =
      spans.find((s) => s.kind === "explicit_slide")?.sourceText ??
      `slide ${explicitSlide}`;
    refs.push(
      resolveSlideNumber(
        explicitSlide,
        span,
        candidates,
        "explicit_slide_index",
      ),
    );
  } else {
    const ordinal = parseOrdinalSlide(instruction);
    if (ordinal) {
      let n: number | undefined = ordinal.index;
      if (ordinal.kind === "last") {
        const withSlides = candidates.filter((c) => (c.slideCount ?? 0) > 0);
        const pick = uniqueOrAmbiguous(
          withSlides.length
            ? withSlides
            : candidates.filter((c) => isSlideContentKey(c.artifactKey)),
        );
        if (pick.status === "ok" && pick.hit.slideCount) {
          n = pick.hit.slideCount;
        } else {
          refs.push(
            unresolvedRef(
              ordinal.sourceText,
              "slide",
              "ordinal_last_without_structure",
            ),
          );
        }
      }
      if (n != null) {
        refs.push(
          resolveSlideNumber(
            n,
            ordinal.sourceText,
            candidates,
            "ordinal_slide",
          ),
        );
      }
    } else if (input.selectedSlideNumber != null) {
      // Only when instruction refers to "this/that slide" or deictic without number —
      // handled in deictic path; do not inject selected slide for unrelated instructions.
    }
  }

  const optionRef = parseOptionReference(instruction);
  if (optionRef) {
    refs.push(
      resolveOptionIndex(
        optionRef.index,
        optionRef.sourceText,
        candidates,
        optionRef.kind === "ordinal" ? "ordinal_option" : "explicit_option_index",
      ),
    );
  }

  const version = parseExplicitVersionNumber(instruction);
  if (version != null) {
    const span =
      spans.find((s) => s.kind === "explicit_version")?.sourceText ??
      `version ${version}`;
    refs.push(resolveExplicitVersion(span, version, candidates));
  }

  for (const span of spans) {
    if (
      span.kind === "explicit_slide" ||
      span.kind === "ordinal_slide" ||
      span.kind === "explicit_option" ||
      span.kind === "ordinal_option" ||
      span.kind === "explicit_version"
    ) {
      continue;
    }
    switch (span.kind) {
      case "previous_output":
        refs.push(
          resolvePreviousOutput(span.sourceText, candidates, input.phaseId),
        );
        break;
      case "approved_storyline":
        refs.push(
          resolveApprovedByKey(
            span.sourceText,
            candidates,
            (c) => isStorylineKey(c.artifactKey),
            "approved_output",
          ),
        );
        break;
      case "approved_slide_content":
        refs.push(
          resolveApprovedByKey(
            span.sourceText,
            candidates,
            (c) => isSlideContentKey(c.artifactKey),
            "approved_output",
          ),
        );
        break;
      case "approved_design":
        refs.push(resolveDesign(span.sourceText, candidates, "approved"));
        break;
      case "same_design":
        refs.push(resolveDesign(span.sourceText, candidates, "selected"));
        break;
      case "approved_output":
        refs.push(
          resolveApprovedByKey(
            span.sourceText,
            candidates,
            () => true,
            "approved_output",
          ),
        );
        break;
      case "selected_output": {
        const selected = byKey(
          candidates,
          (c) => c.sessionRole === "selected",
        );
        const pick = uniqueOrAmbiguous(selected);
        if (pick.status === "ok") {
          refs.push(
            artifactRef(
              span.sourceText,
              pick.hit,
              "selected_output",
              "selected_artifact",
              ["selected_artifact", summary(pick.hit)],
            ),
          );
        } else if (pick.status === "ambiguous") {
          refs.push(
            ambiguousRef(
              span.sourceText,
              "selected_output",
              pick.hits,
              "ambiguous_selected",
            ),
          );
        } else {
          refs.push(
            unresolvedRef(span.sourceText, "selected_output", "no_selected"),
          );
        }
        break;
      }
      case "deictic_that":
        // Skip deictic when an explicit slide already resolved the target.
        if (explicitSlide != null) break;
        refs.push(
          resolveDeictic(
            span.sourceText,
            candidates,
            input.selectedSlideNumber,
            input.ctiArtifactId,
            input.ctiArtifactVersion,
          ),
        );
        break;
      default:
        break;
    }
  }

  // If no spans detected but instruction is empty of references — applied=false.
  const applied = refs.length > 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let ambiguousCount = 0;
  for (const r of refs) {
    if (r.status === "exact" || r.status === "deterministic") resolvedCount += 1;
    else if (r.status === "ambiguous") ambiguousCount += 1;
    else unresolvedCount += 1;
  }

  return {
    originalUserInstruction: instruction,
    references: Object.freeze(refs.map((r) => Object.freeze(r))),
    resolvedCount,
    unresolvedCount,
    ambiguousCount,
    applied,
  };
}

/** Safe observability projection (IDs only). */
export function summarizeGenerationReferencesForTrace(
  result: GenerationReferenceResolutionResult,
): {
  referenceResolutionApplied: boolean;
  resolvedReferenceCount: number;
  unresolvedReferenceCount: number;
  ambiguousReferenceCount: number;
  references: Array<{
    referenceType: string;
    targetType: string;
    status: string;
    artifactId?: string;
    version?: number;
    resolutionMethod: string;
    slideNumber?: number;
    optionIndex?: number;
  }>;
} {
  return {
    referenceResolutionApplied: result.applied,
    resolvedReferenceCount: result.resolvedCount,
    unresolvedReferenceCount: result.unresolvedCount,
    ambiguousReferenceCount: result.ambiguousCount,
    references: result.references.map((r) => ({
      referenceType: r.referenceType,
      targetType: r.targetType,
      status: r.status,
      artifactId: r.artifactId,
      version: r.version,
      resolutionMethod: r.resolutionMethod,
      slideNumber: r.slideNumber,
      optionIndex: r.optionIndex,
    })),
  };
}
