/**
 * Phase 19 — Known path bypass catalog (classification only).
 * Rollout blockers are flagged; Phase 19 only fixes concrete blockers.
 */

import type { BypassCatalogEntry } from "./types";

export const BYPASS_CATALOG: readonly BypassCatalogEntry[] = [
  {
    id: "direct_execution_spine",
    description:
      "Primary product generation still goes through DirectExecutionEngine",
    location: "src/platform/direct/direct-execution-engine.ts",
    classification: "INTENTIONALLY_LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "cdf_canonical_phase_accidental_legacy_fallback",
    description:
      "CDF phases with executionStrategy=canonical must not silently fall back to route_visual/direct_routes_*/stamp-less Direct. Generic contract + prepass now fail-closed; remains a rollout blocker until live STAGE_2 E2E proves canonical path for allowlisted services (not merely unit tests).",
    location:
      "packages/api/src/domain/cdf/execution-contract.ts + execution-create-prepass.ts",
    classification: "BUG",
    rolloutBlocker: true,
  },
  {
    id: "execution_release_gate_process_local",
    description:
      "CREATIVE_QA release stamp for CDF approve is process-local Map — NOT durable, NOT multi-instance safe. Approve may fail-open when stamp is absent on another instance. Durable shared store required before production governance claims.",
    location: "src/platform/cdf/social-media-runtime/execution-release-gate.ts",
    classification: "BUG",
    rolloutBlocker: true,
  },
  {
    id: "flag_off_approval_notes",
    description:
      "Flag OFF uses truncated approval notes / brief as context source",
    location: "src/platform/cdf/context-resolver/generation-path-audit.ts",
    classification: "LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "approval_note_session_decisions",
    description:
      "approved.note stored into session decisions/requirements (not ArtifactVersion SoT)",
    location: "src/platform/cdf/transition/execute-action.ts",
    classification: "LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "note_slice_prompt_adapter",
    description: "prompt-adapter truncates note for display/compat",
    location: "src/platform/cdf/context-resolver/prompt-adapter.ts",
    classification: "LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "legacy_get_latest_active_brief",
    description:
      "getLatestActiveBrief when session refs missing (legacy contextSource)",
    location: "src/platform/cdf/context-resolver/resolve.ts",
    classification: "LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "validation_latest_when_version_omitted",
    description:
      "Some validation gates use latest when version omitted — not generation continuity",
    location: "src/platform/cdf/generation-validation/service.ts",
    classification: "INTENTIONALLY_LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "canonical_rejects_latest_head",
    description:
      "Canonical loaders explicitly reject latest/HEAD for generation continuity",
    location: "src/platform/cdf/generation-context + session-bind",
    classification: "CANONICAL",
    rolloutBlocker: false,
  },
  {
    id: "qa_repair_not_auto_wired",
    description:
      "Output QA and Repair are opt-in; not automatically attached to all HTTP creates",
    location: "src/platform/ai/output-qa + repair",
    classification: "INTENTIONALLY_LEGACY",
    rolloutBlocker: false,
  },
  {
    id: "class_d_incomplete_continuity",
    description:
      "Class-D services lack deep ArtifactVersion ingest",
    location: "src/platform/ai/conversational-runtime/dependency-contracts.ts",
    classification: "UNSUPPORTED",
    rolloutBlocker: false,
  },
];

export function listBypassCatalog(): readonly BypassCatalogEntry[] {
  return BYPASS_CATALOG;
}

export function listRolloutBlockers(): readonly BypassCatalogEntry[] {
  return BYPASS_CATALOG.filter((b) => b.rolloutBlocker);
}

export function assertNoOpenRolloutBlockers(): {
  readonly ok: true;
  readonly blockerCount: 0;
} {
  const blockers = listRolloutBlockers();
  if (blockers.length > 0) {
    throw new Error(
      `Open rollout blockers: ${blockers.map((b) => b.id).join(", ")}`,
    );
  }
  return { ok: true, blockerCount: 0 };
}
