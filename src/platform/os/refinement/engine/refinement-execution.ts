/**
 * Phase 7 — Execute a refinement via existing Execution Intelligence + Task Graph.
 * Produces a new output version; never mutates v1.
 */

import type { ExecutionPlan } from "../../execution-intelligence/contracts/execution-plan";
import type { IExecutionIntelligence } from "../../contracts/layer-ports";
import type { ITaskGraphExecutorEngine } from "../../task-graph-executor/engine/task-graph-executor-engine";
import type { TaskGraphRunSnapshot } from "../../task-graph-executor/contracts/task-graph-state";
import type { RefinementSpecification } from "../contracts/refinement-specification";
import type { RefinementEngine } from "./refinement-engine";
import type { OsDeliveryService } from "../../delivery/engine/delivery-service";
import { RefinementError } from "../contracts/errors";
import { logOsExecutionEvent } from "../../observability/execution-log";

export interface ExecuteRefinementResult {
  readonly plan: ExecutionPlan;
  readonly snapshot: TaskGraphRunSnapshot;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly sourceVersion: number;
}

export async function executeRefinementThroughOs(input: {
  readonly organizationId: string;
  readonly requestId: string;
  readonly refinementId: string;
  readonly specification: RefinementSpecification;
  readonly previousPlan: ExecutionPlan;
  readonly brief: Parameters<IExecutionIntelligence["replan"]>[0]["brief"];
  readonly brandContext?: Parameters<IExecutionIntelligence["replan"]>[0]["brandContext"];
  readonly knowledgeContext?: Parameters<
    IExecutionIntelligence["replan"]
  >["0"]["knowledgeContext"];
  readonly executionIntelligence: IExecutionIntelligence;
  readonly taskGraphExecutor: ITaskGraphExecutorEngine;
  readonly refinementEngine: RefinementEngine;
  readonly deliveryService: OsDeliveryService;
  readonly brandTone?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}): Promise<ExecuteRefinementResult> {
  if (input.organizationId !== input.specification.organizationId) {
    throw new RefinementError("TENANT_VIOLATION", "tenant isolation violation");
  }

  await input.refinementEngine.markExecuting(
    input.refinementId,
    input.organizationId,
    input.nowIso
  );

  const refinedExecutionId = `${input.specification.executionId}_r${input.specification.refinementVersion}`;

  const plan = input.executionIntelligence.replan({
    organizationId: input.organizationId,
    executionId: refinedExecutionId,
    requestId: input.requestId,
    brief: {
      ...input.brief,
      executionId: refinedExecutionId,
    },
    brandContext: input.brandContext,
    knowledgeContext: input.knowledgeContext,
    forceReplan: true,
    replanReason: input.specification.replanReason,
    existingPlanVersion: input.previousPlan.planVersion,
  });

  // Seed v1 artifact if missing for provenance chain
  const artifactId = input.specification.sourceOutputId;
  const existing = await input.deliveryService
    .getArtifactStore()
    .listVersions(artifactId, input.organizationId);
  if (!existing.length) {
    await input.deliveryService.getArtifactStore().createVersion({
      artifactId,
      organizationId: input.organizationId,
      executionId: input.specification.executionId,
      planId: input.previousPlan.id,
      planVersion: input.previousPlan.planVersion,
      preview: `source_v${input.specification.sourceVersion}`,
      approvalState: "APPROVED",
      approvalReference: `approval_v${input.specification.sourceVersion}`,
      nowIso: input.nowIso,
    });
  }

  const snap = await input.taskGraphExecutor.execute({
    organizationId: input.organizationId,
    executionId: refinedExecutionId,
    requestId: input.requestId,
    plan,
    briefObjective: [
      input.brief.objective,
      `REFINEMENT: ${input.specification.requestedChanges.map((c) => c.signal).join(", ")}`,
      `PRESERVE: ${input.specification.preserveRequirements.join(", ")}`,
    ].join(" | "),
    brandTone: input.brandTone,
    brandAvoidTerms: input.brandAvoidTerms,
    prohibitedPatterns: input.prohibitedPatterns,
    nowIso: input.nowIso,
    createId: input.createId,
  });

  const preview =
    snap.tasks.find((t) => t.status === "SUCCEEDED")?.outputRef?.preview ??
    "";

  const v2 = await input.deliveryService.getArtifactStore().createVersion({
    artifactId,
    organizationId: input.organizationId,
    executionId: snap.executionId,
    planId: plan.id,
    planVersion: plan.planVersion,
    refinementId: input.refinementId,
    refinementVersion: input.specification.refinementVersion,
    sourceArtifactId: artifactId,
    sourceVersion: input.specification.sourceVersion,
    outputContractId: input.previousPlan.tasks[0]?.outputRequirements.outputContractId,
    preview,
    approvalState:
      snap.approvalStatus === "APPROVED" ? "APPROVED" : "UNAPPROVED",
    approvalReference:
      snap.approvalStatus === "APPROVED"
        ? snap.lastGovernanceDecisionId
        : undefined,
    nowIso: input.nowIso,
  });

  await input.deliveryService.getArtifactStore().createManifest({
    organizationId: input.organizationId,
    executionId: snap.executionId,
    planVersion: plan.planVersion,
    refinementVersion: input.specification.refinementVersion,
    entries: [{ artifactId, version: v2.version, role: "primary" }],
    nowIso: input.nowIso,
    createId: input.createId,
  });

  logOsExecutionEvent("refinement.version.created", {
    requestId: input.requestId,
    executionId: snap.executionId,
    organizationId: input.organizationId,
    status: `v${v2.version}`,
    planId: plan.id,
    planVersion: plan.planVersion,
  });

  if (snap.approvalStatus === "APPROVED") {
    await input.deliveryService.getArtifactStore().approveVersion({
      artifactId,
      version: v2.version,
      organizationId: input.organizationId,
      approvalReference:
        snap.lastGovernanceDecisionId ?? `approval_v${v2.version}`,
      nowIso: input.nowIso,
    });
  }

  await input.refinementEngine.markCompleted(
    input.refinementId,
    input.organizationId,
    snap.approvalStatus === "BLOCKED" || snap.status === "FAILED"
      ? "FAILED"
      : "COMPLETED",
    input.nowIso
  );

  return {
    plan,
    snapshot: snap,
    artifactId,
    artifactVersion: v2.version,
    sourceVersion: input.specification.sourceVersion,
  };
}
