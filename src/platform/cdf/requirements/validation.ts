/**
 * Integrity validation for CDF requirement records (M2).
 */

import {
  CDF_REQUIREMENT_PRIORITIES,
  type CdfActiveBrief,
  type CdfRequirement,
  type CdfRequirementOverride,
  type CdfSourceInput,
} from "./types";

export type CdfRequirementValidationIssue = {
  code: string;
  message: string;
  entityId?: string;
};

export function validateSourceInput(
  s: CdfSourceInput,
): CdfRequirementValidationIssue[] {
  const issues: CdfRequirementValidationIssue[] = [];
  if (!s.sourceInputId) {
    issues.push({ code: "MISSING_SOURCE_ID", message: "sourceInputId required" });
  }
  if (!s.sessionId) {
    issues.push({ code: "MISSING_SESSION", message: "sessionId required" });
  }
  if (typeof s.rawContent !== "string") {
    issues.push({
      code: "MISSING_RAW",
      message: "rawContent must be a string (may be empty for binary refs)",
      entityId: s.sourceInputId,
    });
  }
  if (!Number.isInteger(s.sequence) || s.sequence < 0) {
    issues.push({
      code: "INVALID_SEQUENCE",
      message: "sequence must be a non-negative integer",
      entityId: s.sourceInputId,
    });
  }
  return issues;
}

export function validateRequirement(
  r: CdfRequirement,
): CdfRequirementValidationIssue[] {
  const issues: CdfRequirementValidationIssue[] = [];
  if (!r.requirementId) {
    issues.push({ code: "MISSING_REQ_ID", message: "requirementId required" });
  }
  if (!r.provenance?.sourceInputId) {
    issues.push({
      code: "MISSING_SOURCE_INPUT_ID",
      message: "provenance.sourceInputId required",
      entityId: r.requirementId,
    });
  }
  if (!CDF_REQUIREMENT_PRIORITIES.includes(r.priority)) {
    issues.push({
      code: "INVALID_PRIORITY",
      message: `Invalid priority ${r.priority}`,
      entityId: r.requirementId,
    });
  }
  if (r.explicit !== r.provenance.explicit) {
    issues.push({
      code: "EXPLICIT_MISMATCH",
      message: "explicit flag must match provenance.explicit",
      entityId: r.requirementId,
    });
  }
  if (
    r.priority === "ai_inference" &&
    r.explicit === true
  ) {
    issues.push({
      code: "INVALID_PROVENANCE",
      message: "ai_inference cannot be marked explicit",
      entityId: r.requirementId,
    });
  }
  return issues;
}

export function validateActiveBrief(
  brief: CdfActiveBrief,
  requirements: CdfRequirement[],
  sources: CdfSourceInput[],
): CdfRequirementValidationIssue[] {
  const issues: CdfRequirementValidationIssue[] = [];
  const reqIds = new Set(requirements.map((r) => r.requirementId));
  const srcIds = new Set(sources.map((s) => s.sourceInputId));

  if (new Set(requirements.map((r) => r.requirementId)).size !== requirements.length) {
    issues.push({
      code: "DUPLICATE_REQUIREMENT_ID",
      message: "Duplicate requirement IDs",
    });
  }
  if (new Set(sources.map((s) => s.sourceInputId)).size !== sources.length) {
    issues.push({
      code: "DUPLICATE_SOURCE_ID",
      message: "Duplicate source IDs",
    });
  }

  for (const id of brief.requirementIds) {
    if (!reqIds.has(id)) {
      issues.push({
        code: "BRIEF_DANGLING_REQUIREMENT",
        message: `ActiveBrief references missing requirement ${id}`,
        entityId: brief.activeBriefId,
      });
    }
  }
  for (const id of brief.sourceInputIds) {
    if (!srcIds.has(id)) {
      issues.push({
        code: "BRIEF_DANGLING_SOURCE",
        message: `ActiveBrief references missing source ${id}`,
        entityId: brief.activeBriefId,
      });
    }
  }

  if (!Number.isInteger(brief.version) || brief.version < 1) {
    issues.push({
      code: "INVALID_BRIEF_VERSION",
      message: "version must be >= 1",
      entityId: brief.activeBriefId,
    });
  }

  // Active conflicting same-key without conflict status
  const activeByKey = new Map<string, CdfRequirement[]>();
  for (const r of brief.activeRequirements) {
    const list = activeByKey.get(r.key) ?? [];
    list.push(r);
    activeByKey.set(r.key, list);
  }
  for (const [key, list] of activeByKey) {
    if (list.length > 1) {
      const values = new Set(list.map((r) => JSON.stringify(r.value)));
      if (values.size > 1) {
        issues.push({
          code: "UNRESOLVED_ACTIVE_CONFLICT",
          message: `Multiple active conflicting values for ${key}`,
          entityId: brief.activeBriefId,
        });
      }
    }
  }

  return issues;
}

export function validateOverride(
  o: CdfRequirementOverride,
  requirements: CdfRequirement[],
): CdfRequirementValidationIssue[] {
  const issues: CdfRequirementValidationIssue[] = [];
  const ids = new Set(requirements.map((r) => r.requirementId));
  if (!ids.has(o.targetRequirementId)) {
    issues.push({
      code: "BROKEN_OVERRIDE_TARGET",
      message: "override targetRequirementId missing",
      entityId: o.overrideId,
    });
  }
  if (!ids.has(o.newRequirementId)) {
    issues.push({
      code: "BROKEN_OVERRIDE_NEW",
      message: "override newRequirementId missing",
      entityId: o.overrideId,
    });
  }
  if (!o.sourceInputId) {
    issues.push({
      code: "MISSING_SOURCE_INPUT_ID",
      message: "override requires sourceInputId",
      entityId: o.overrideId,
    });
  }
  return issues;
}

export function assertValidOrThrow(
  issues: CdfRequirementValidationIssue[],
): void {
  if (issues.length) {
    const err = new Error(
      `CDF requirement validation failed: ${issues.map((i) => i.code).join(", ")}`,
    );
    (err as Error & { issues: CdfRequirementValidationIssue[] }).issues = issues;
    throw err;
  }
}
