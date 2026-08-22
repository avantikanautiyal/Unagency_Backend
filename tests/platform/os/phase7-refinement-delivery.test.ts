/**
 * Phase 7 — Refinement re-execution, artifact versioning, approval-gated delivery.
 */

import {
  createBriefIntelligenceEngine,
  createExecutionIntelligenceOsEngine,
  createProductionNegotiationPlatform,
  createTaskGraphExecutorEngine,
  ControllableTaskCapabilityRunner,
  InMemoryTaskGraphRunStore,
  createRefinementEngine,
  createOsDeliveryService,
  executeRefinementThroughOs,
  MAX_REFINEMENT_QUESTIONS,
} from "../../../src/platform/os";
import { getValidationSuite } from "../../../src/platform/validation/suites/validation-suites";
import { getValidationScenario } from "../../../src/platform/validation/scenarios/end-to-end-scenarios";

describe("Phase 7 — M9 validation definitions", () => {
  it("includes phase7_refinement_delivery suite", () => {
    const suite = getValidationSuite("phase7_refinement_delivery");
    expect(suite?.scenarioIds).toContain("refinement_delivery");
    const scenario = getValidationScenario("refinement_delivery");
    expect(scenario?.stages).toEqual(
      expect.arrayContaining([
        "structured_feedback",
        "adaptive_mcq",
        "refinement_specification",
        "refinement_execution",
        "artifact_versioning",
        "delivery_authorization",
        "delivery_idempotency",
        "tenant_isolation",
      ])
    );
  });
});

describe("Phase 7 — Artifact versioning & delivery", () => {
  it("keeps v1 immutable when creating v2", async () => {
    const delivery = createOsDeliveryService();
    const store = delivery.getArtifactStore();
    const v1 = await store.createVersion({
      artifactId: "art_1",
      organizationId: "org_a",
      executionId: "exec_1",
      planVersion: 1,
      preview: "Caption v1 premium text for spring product launch.",
      approvalState: "APPROVED",
      approvalReference: "apr_v1",
    });
    const v2 = await store.createVersion({
      artifactId: "art_1",
      organizationId: "org_a",
      executionId: "exec_1_r2",
      planVersion: 2,
      refinementVersion: 2,
      sourceArtifactId: "art_1",
      sourceVersion: 1,
      preview: "Caption v2 more premium and concise for spring product.",
      approvalState: "UNAPPROVED",
    });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    const stillV1 = await store.getVersion("art_1", 1, "org_a");
    expect(stillV1?.preview).toContain("Caption v1");
    expect(stillV1?.approvalState).toBe("APPROVED");
    expect(v2.approvalState).toBe("UNAPPROVED");
  });

  it("Scenario D — unapproved v2 delivery denied; approved v2 succeeds; idempotent", async () => {
    const delivery = createOsDeliveryService();
    const store = delivery.getArtifactStore();
    await store.createVersion({
      artifactId: "art_d",
      organizationId: "org_a",
      executionId: "exec_d",
      planVersion: 1,
      preview: "v1 approved content long enough",
      approvalState: "APPROVED",
      approvalReference: "apr1",
    });
    const v2 = await store.createVersion({
      artifactId: "art_d",
      organizationId: "org_a",
      executionId: "exec_d_r2",
      planVersion: 2,
      refinementVersion: 2,
      sourceVersion: 1,
      preview: "v2 refined content long enough",
      approvalState: "UNAPPROVED",
    });

    const denied = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_d",
      artifactVersion: v2.version,
      executionId: "exec_d_r2",
      planVersion: 2,
      destination: "export",
    });
    expect(denied.status).toBe("DENIED");
    expect(denied.failureReason).toMatch(/No approval/i);

    await store.approveVersion({
      artifactId: "art_d",
      version: 2,
      organizationId: "org_a",
      approvalReference: "apr2",
    });

    const ok = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_d",
      artifactVersion: 2,
      executionId: "exec_d_r2",
      planVersion: 2,
      destination: "export",
    });
    expect(ok.status).toBe("SUCCEEDED");
    expect(ok.externalReference).toBeTruthy();

    const again = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_d",
      artifactVersion: 2,
      executionId: "exec_d_r2",
      planVersion: 2,
      destination: "export",
    });
    expect(again.deliveryId).toBe(ok.deliveryId);
    expect(again.idempotencyKey).toBe(ok.idempotencyKey);

    // Approval of v1 must not authorize wrong version delivery intent already covered;
    // revoked denies:
    await store.revokeVersion({
      artifactId: "art_d",
      version: 2,
      organizationId: "org_a",
    });
    // New idempotency key via intent
    const revoked = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_d",
      artifactVersion: 2,
      executionId: "exec_d_r2",
      planVersion: 2,
      destination: "export",
      deliveryIntent: "retry_after_revoke",
    });
    expect(revoked.status).toBe("DENIED");
  });

  it("denies wrong-version / cross-tenant delivery", async () => {
    const delivery = createOsDeliveryService();
    await delivery.getArtifactStore().createVersion({
      artifactId: "art_x",
      organizationId: "org_a",
      executionId: "exec_x",
      preview: "approved content here",
      approvalState: "APPROVED",
      approvalReference: "a",
    });
    const mismatch = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_x",
      artifactVersion: 1,
      executionId: "wrong_exec",
      destination: "export",
    });
    expect(mismatch.status).toBe("DENIED");

    const cross = await delivery
      .getArtifactStore()
      .getVersion("art_x", 1, "org_b");
    expect(cross).toBeUndefined();
  });

  it("creates versioned manifests", async () => {
    const delivery = createOsDeliveryService();
    const store = delivery.getArtifactStore();
    const v1 = await store.createVersion({
      artifactId: "a1",
      organizationId: "org_a",
      executionId: "ex1",
      preview: "one",
    });
    const m1 = await store.createManifest({
      organizationId: "org_a",
      executionId: "ex1",
      planVersion: 1,
      entries: [{ artifactId: "a1", version: v1.version }],
    });
    const v2 = await store.createVersion({
      artifactId: "a1",
      organizationId: "org_a",
      executionId: "ex1_r2",
      preview: "two",
      refinementVersion: 2,
    });
    const m2 = await store.createManifest({
      organizationId: "org_a",
      executionId: "ex1_r2",
      planVersion: 2,
      refinementVersion: 2,
      entries: [{ artifactId: "a1", version: v2.version }],
    });
    expect(m1.version).toBe(1);
    expect(m2.version).toBe(1); // per-execution manifest numbering
    expect(m2.refinementVersion).toBe(2);
  });
});

describe("Phase 7 — End-to-end refinement re-execution", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("v1 → feedback → spec → replan/execute → v2 requiring new approval boundary", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const graphStore = new InMemoryTaskGraphRunStore();
    const executor = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: graphStore,
      enableGovernance: true,
    });
    const intelligence = createExecutionIntelligenceOsEngine({
      capabilityRegistry: caps,
    });
    const brief = createBriefIntelligenceEngine().createBrief({
      tenant: {
        organizationId: "org_a",
        requestId: "req",
        executionId: "exec_ref",
      },
      rawPrompt: "Write a spring product caption for marketing.",
      clientCapabilityId: "text.generate",
    });
    const planV1 = intelligence.createPlan({
      organizationId: "org_a",
      executionId: "exec_ref",
      requestId: "req",
      brief,
    });
    const snapV1 = await executor.execute({
      organizationId: "org_a",
      executionId: "exec_ref",
      requestId: "req",
      plan: planV1,
      briefObjective: brief.objective,
      brandTone: "premium confident",
    });
    expect(snapV1.approvalStatus).toBe("APPROVED");
    const previewV1 = snapV1.tasks[0]!.outputRef!.preview!;

    const refinement = createRefinementEngine();
    const delivery = createOsDeliveryService();
    // Seal v1 artifact
    await delivery.getArtifactStore().createVersion({
      artifactId: snapV1.tasks[0]!.outputRef!.outputRefId,
      organizationId: "org_a",
      executionId: "exec_ref",
      planId: planV1.id,
      planVersion: planV1.planVersion,
      preview: previewV1,
      approvalState: "APPROVED",
      approvalReference: snapV1.lastGovernanceDecisionId ?? "apr_v1",
    });

    const { request, presented } = await refinement.requestRefinement({
      organizationId: "org_a",
      executionId: "exec_ref",
      sourceOutputId: snapV1.tasks[0]!.outputRef!.outputRefId,
      sourceVersion: 1,
      sourcePreview: previewV1,
      mode: "AI",
      outputType: "caption",
      outputContractId: snapV1.tasks[0]!.outputRef!.outputContractId,
      planId: planV1.id,
      planVersion: planV1.planVersion,
      sourceApprovalStatus: "APPROVED",
      brandTone: "premium confident",
    });

    let current = presented;
    let spec;
    for (let i = 0; i < MAX_REFINEMENT_QUESTIONS; i++) {
      const choice =
        current.question.options.find((o) => o.value === "tone") ??
        current.question.options.find((o) => o.value === "premium") ??
        current.question.options.find((o) => o.optionId.startsWith("pr_")) ??
        current.question.options[0]!;
      const res = await refinement.submitAnswer({
        refinementId: request.refinementId,
        organizationId: "org_a",
        questionId: current.question.questionId,
        optionIds:
          current.question.selectionType === "multi"
            ? [choice.optionId]
            : [choice.optionId],
      });
      if (res.completed) {
        spec = res.specification;
        break;
      }
      current = res.next!;
    }
    expect(spec).toBeDefined();
    expect(spec!.sourceVersion).toBe(1);
    expect(spec!.refinementVersion).toBe(2);

    const result = await executeRefinementThroughOs({
      organizationId: "org_a",
      requestId: "req_ref",
      refinementId: request.refinementId,
      specification: spec!,
      previousPlan: planV1,
      brief,
      executionIntelligence: intelligence,
      taskGraphExecutor: executor,
      refinementEngine: refinement,
      deliveryService: delivery,
      brandTone: "premium confident",
    });

    expect(result.plan.planVersion).toBeGreaterThan(planV1.planVersion);
    expect(result.artifactVersion).toBe(2);
    expect(result.sourceVersion).toBe(1);

    const v1 = await delivery
      .getArtifactStore()
      .getVersion(result.artifactId, 1, "org_a");
    expect(v1?.preview).toBe(previewV1);

    const v2 = await delivery
      .getArtifactStore()
      .getVersion(result.artifactId, 2, "org_a");
    expect(v2).toBeDefined();
    // v1 approval does not auto-approve mismatched delivery of unapproved state —
    // if governance approved v2, delivery ok; else denied.
    if (result.snapshot.approvalStatus !== "APPROVED") {
      expect(v2!.approvalState).toBe("UNAPPROVED");
      const denied = await delivery.createDelivery({
        organizationId: "org_a",
        artifactId: result.artifactId,
        artifactVersion: 2,
        executionId: result.snapshot.executionId,
        planVersion: result.plan.planVersion,
        destination: "export",
      });
      expect(denied.status).toBe("DENIED");
    } else {
      expect(v2!.approvalState).toBe("APPROVED");
      const ok = await delivery.createDelivery({
        organizationId: "org_a",
        artifactId: result.artifactId,
        artifactVersion: 2,
        executionId: result.snapshot.executionId,
        planVersion: result.plan.planVersion,
        destination: "export",
      });
      expect(ok.status).toBe("SUCCEEDED");
    }
  });
});
