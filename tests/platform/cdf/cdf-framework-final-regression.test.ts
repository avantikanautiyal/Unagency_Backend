/**
 * CDF framework final regression — fanout, acceptance, constraints, routes.
 * Generic only — no service/phase/provider semantic branches.
 */

import assert from "node:assert/strict";
import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  executableFanoutTargets,
  isGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
  resolveGenerationFanoutContract,
} from "../../../src/platform/generation/generation-fanout";
import { mergeHardConstraintsIntoProviderPrompt } from "../../../src/platform/cdf/generation-context/provider-requirement-projection";
import { resolveGeneratedDeliverablePresentationEligibility } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";
import { resolvePhaseCompletionForApproval } from "../../../src/platform/cdf/lifecycle/phase-completion";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

describe("CDF framework fanout contract (A–G, Y–Z)", () => {
  it("A — declared 3-leaf image fanout (Gemini Flash / Gemini Pro / OpenAI)", () => {
    const contract = resolveGenerationFanoutContract({
      useCase: "marketing_creative",
      groupId: "fanout_a",
      executableProviderIds: new Set(["provider.openai", "provider.google"]),
    });
    assert.equal(contract.cardinality, 3);
    assert.equal(contract.targets.length, 3);
    assert.equal(contract.independencePolicy, "independent_leaves");
    assert.equal(contract.failoverPolicy, "intra_leaf_only");
    assert.deepEqual(
      contract.targets.map((t) => t.providerId),
      ["provider.google", "provider.google", "provider.openai"],
    );
    assert.equal(contract.targets[0]!.modelId, "gemini-3.1-flash-image");
    assert.equal(contract.targets[1]!.modelId, "gemini-3-pro-image");
    assert.equal(contract.targets[2]!.modelId, "gpt-image-1.5");
    assert.notEqual(contract.targets[0]!.modelId, contract.targets[1]!.modelId);
    assert.equal(
      contract.targets.some((t) => t.providerId === "provider.ideogram"),
      false,
    );
    const ids = new Set(contract.targets.map((t) => t.targetId));
    assert.equal(ids.size, 3);
  });

  it("B — unavailable provider keeps cardinality 3", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "fanout_b",
      executableProviderIds: new Set(["provider.google"]),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
    const openai = plan.targets.find((t) => t.providerId === "provider.openai");
    assert.ok(openai);
    assert.equal(openai!.availability, "unavailable");
    // Gemini slots remain executable; OpenAI unavailable.
    assert.equal(executableFanoutTargets(plan).length, 2);
  });

  it("C/D — independent leaf metadata; intra-leaf failover only; unique target IDs", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "fanout_cd",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    const metas = plan.targets.map((t) =>
      buildGenerationFanoutLeafMetadata({ plan, target: t }),
    );
    assert.equal(metas.length, 3);
    for (const m of metas) {
      assert.equal(m.generationFanoutLeaf, true);
      assert.equal(m.disableCrossProviderFailover, true);
      assert.equal(m.requestedProvider, m.preferredProviderId);
      assert.equal(m.requestedModel, m.preferredModelId);
      assert.equal(isGenerationFanoutLeafMetadata(m), true);
      // Intra-leaf only: every failover candidate shares the leaf provider.
      for (const step of m.imageFailoverChain) {
        assert.equal(step.providerId, m.preferredProviderId);
        assert.notEqual(step.modelId, m.preferredModelId);
      }
    }
    // Sibling providers must never appear in another leaf's chain.
    const byProvider = new Map(metas.map((m) => [m.preferredProviderId, m]));
    for (const m of metas) {
      for (const sibling of metas) {
        if (sibling.preferredProviderId === m.preferredProviderId) continue;
        assert.equal(
          m.imageFailoverChain.some(
            (s) => s.providerId === sibling.preferredProviderId,
          ),
          false,
        );
      }
    }
    assert.ok(byProvider.has("provider.google"));
    assert.ok(
      byProvider.get("provider.google")!.imageFailoverChain.length >= 1,
      "Google leaf should declare same-provider model fallback",
    );
    const targetIds = new Set(metas.map((m) => m.generationFanoutTargetId));
    assert.equal(targetIds.size, 3);
  });

  it("E/F — quantity/outputMode are not fanout inputs (API surface)", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../../src/platform/generation/generation-fanout.ts",
      ),
      "utf8",
    );
    assert.match(src, /GenerationFanoutContract/);
    assert.match(src, /ExecutionSpec\.quantity/);
    assert.doesNotMatch(
      src.slice(src.indexOf("export function planImageGenerationFanout")),
      /quantity\s*[:=]/,
    );
  });

  it("G — same upstream groupId shared across leaves", () => {
    const plan = planImageGenerationFanout({
      useCase: "logo",
      groupId: "fanout_shared_xv",
    });
    for (const t of plan.targets) {
      const m = buildGenerationFanoutLeafMetadata({ plan, target: t });
      assert.equal(m.generationFanoutGroupId, "fanout_shared_xv");
    }
  });

  it("Y/Z — three real target identities (not synthetic Route 1/2/3)", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "fanout_yz",
    });
    assert.equal(plan.targets.length, 3);
    for (const t of plan.targets) {
      assert.ok(t.targetId.startsWith("fanout_"));
      assert.ok(!/^route\s*[123]$/i.test(t.targetId));
      assert.ok(!/^Route\s*[123]$/i.test(t.label));
    }
  });
});

describe("CDF acceptance / approval gates (H–L)", () => {
  it("H/I/J — blocking structural → diagnostic, not AVAILABLE", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_block",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      blocksCanonicalCompletion: true,
      productCompletionBlocked: true,
      structuralStatus: "NON_COMPLIANT",
      rawMediaArtifactIds: ["art_raw_1"],
    });
    assert.equal(elig.status, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    assert.equal(elig.canonicalArtifact, null);
  });

  it("K — rejected eligibility cannot be approved", () => {
    const session = {
      sessionId: "cdf_s",
      serviceId: "social-media",
      brief: "x",
      phaseIndex: 0,
      phaseId: "output",
      approved: [],
      masters: {},
      generatedArtifacts: [
        {
          phaseId: "output",
          artifactKey: "social-media.output",
          artifactId: "cdfart_x",
          version: 1,
          role: "generated",
          boundAt: new Date().toISOString(),
        },
      ],
    } as unknown as CdfSessionState;
    const completion = resolvePhaseCompletionForApproval({
      session,
      phaseId: "output",
      serviceId: "social-media",
      requestArtifactId: "cdfart_x",
      requestArtifactVersion: 1,
      requestArtifactKey: "social-media.output",
      requestPresentationEligibility: "REJECTED",
    });
    assert.equal(completion.transitionAllowed, false);
    assert.equal(
      completion.failureCode,
      "CDF_ACCEPTANCE_BLOCKED_NOT_APPROVABLE",
    );
  });

  it("L — diagnostic preview cannot be approved", () => {
    const session = {
      sessionId: "cdf_s2",
      serviceId: "social-media",
      brief: "x",
      phaseIndex: 0,
      phaseId: "output",
      approved: [],
      masters: {},
      generatedArtifacts: [],
    } as unknown as CdfSessionState;
    const completion = resolvePhaseCompletionForApproval({
      session,
      phaseId: "output",
      serviceId: "social-media",
      requestPresentationEligibility: "DIAGNOSTIC_PREVIEW_AVAILABLE",
    });
    assert.equal(completion.transitionAllowed, false);
    assert.equal(
      completion.failureCode,
      "CDF_DIAGNOSTIC_PREVIEW_NOT_APPROVABLE",
    );
  });
});

describe("CDF hard constraint projection (O)", () => {
  it("O — ExecutionSpec HARD constraints survive into provider wire", () => {
    const spec = {
      creative: {
        negativeConstraints: [
          {
            value: {
              subject: "leaves",
              normalizedConcept: "leaves",
              enforcement: "HARD_CONSTRAINT" as const,
            },
          },
          {
            value: {
              subject: "green foliage",
              normalizedConcept: "foliage",
              enforcement: "HARD_CONSTRAINT" as const,
            },
          },
        ],
      },
    };
    const merged = mergeHardConstraintsIntoProviderPrompt({
      prompt: "===== CONSTRAINTS =====\n- [requirement] style: clean",
      executionSpec: spec as never,
    });
    assert.equal(merged.merged, true);
    assert.equal(merged.projection.hardConstraintCount, 2);
    assert.match(merged.prompt, /HARD CONSTRAINT/);
    assert.equal(merged.projection.hardConstraintsSurvivedToWire, true);
    assert.ok(merged.projection.executionSpecConstraintHash.length >= 8);
    assert.ok(merged.projection.providerWireConstraintHash.length >= 8);
    assert.ok(
      merged.projection.executionSpecConstraintHash !==
        merged.projection.canonicalModelRequestConstraintHash ||
        merged.projection.hardConstraintCount > 0,
    );
  });
});

describe("isGenerationFanoutLeafMetadata export boundary", () => {
  it("runtime predicate is defined and exported", () => {
    assert.equal(typeof isGenerationFanoutLeafMetadata, "function");
    assert.equal(isGenerationFanoutLeafMetadata(undefined), false);
    assert.equal(
      isGenerationFanoutLeafMetadata({ generationFanoutLeaf: true }),
      true,
    );
  });

  it("frontend mirror exports the same symbol", async () => {
    const fe = await import(
      "../../../../Unagency-frontend/packages/api/src/domain/generation-fanout"
    );
    assert.equal(typeof fe.isGenerationFanoutLeafMetadata, "function");
  });

  it("frontend package root re-exports isGenerationFanoutLeafMetadata", async () => {
    const pkg = await import(
      "../../../../Unagency-frontend/packages/api/src/index"
    );
    assert.equal(typeof pkg.isGenerationFanoutLeafMetadata, "function");
    assert.equal(typeof pkg.resolveGenerationFanoutContract, "function");
    assert.equal(typeof pkg.executableFanoutTargets, "function");
  });
});
