/**
 * Maps memory records to Experience objects for injection.
 */

import type { Experience } from "../../experience-intelligence/contracts/experience";
import { asExperienceId } from "../../experience-intelligence/contracts/identifiers";
import type { CapabilityId } from "../../shared/identifiers";
import type { MemoryRecord } from "../../memory/contracts/memory-models";

export function memoryRecordToExperience(record: MemoryRecord): Experience | undefined {
  const summary =
    typeof record.content.summary === "string"
      ? record.content.summary
      : typeof record.content.recommendation === "string"
        ? record.content.recommendation
        : typeof record.content.text === "string"
          ? record.content.text
          : undefined;
  if (!summary?.trim()) return undefined;

  const now = record.metadata.updatedAt ?? record.metadata.createdAt;
  const capabilityId = record.identity.capabilityId
    ? String(record.identity.capabilityId)
    : undefined;

  return {
    experienceId: asExperienceId(`mem_${record.id}`),
    category:
      record.classification === "learning_reference"
        ? "best_practice"
        : record.classification === "human_feedback"
          ? "correction"
          : "optimization",
    type:
      record.classification === "learning_reference"
        ? "best_practice"
        : "optimization",
    trigger: record.metadata.title ?? record.classification,
    context: record.content,
    rootCause: {
      causeId: `rc_${record.id}`,
      kind: "missing_context",
      description: record.metadata.sourceModule ?? "memory_intelligence",
      evidence: record.metadata.tags ?? [],
      confidence: 0.5,
    },
    observedBehaviour: summary.slice(0, 500),
    correctionStrategy: {
      strategyId: `cs_${record.id}`,
      kind: "increase_context_window",
      instruction: summary.slice(0, 500),
      rationale: "Memory-derived guidance",
      priority: "medium",
      advisoryOnly: true as const,
    },
    recommendation: summary.slice(0, 500),
    confidence: Math.min(1, Math.max(0.2, (record.importance ?? 5) / 10)),
    evidence: record.metadata.tags ?? [],
    supportingArtifactIds: [],
    applicableConditions: {
      capabilityId: capabilityId as CapabilityId | undefined,
      organizationId: record.identity.organizationId,
      workspaceId: record.identity.workspaceId,
      projectId: record.identity.projectId,
      campaignId: record.identity.campaignId,
    },
    capabilityId,
    organizationId: String(record.identity.organizationId),
    workspaceId: String(record.identity.workspaceId),
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    averageImprovement: 0,
    scores: {
      confidence: Math.min(1, Math.max(0.2, (record.importance ?? 5) / 10)),
      evidenceScore: 0.5,
      impactScore: 0.4,
      reuseScore: 0.3,
      improvementScore: 0.2,
      applicabilityScore: 0.5,
    },
    explanation: {
      whyExists: "Retrieved from memory intelligence store",
      evidenceSummary: record.metadata.title ?? record.classification,
      whenApplies: "matching organization/workspace context",
      whenNotApplies: "archived or out-of-scope memory",
      historicalImprovement: "n/a",
    },
    lifecycle: record.lifecycleState === "archived" ? "archived" : "trusted",
    version: "1.0.0",
    createdAt: now,
  };
}
