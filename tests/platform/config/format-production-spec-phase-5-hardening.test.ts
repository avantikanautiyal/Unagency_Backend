/**
 * Phase 5 — Hardening: rollout, telemetry, pre-gen R/H hold, instruct↔gate ruleId parity.
 */

import {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  applyProductionSpecInstructToMetadata,
  ensureProviderPromptHasProductionSpec,
  evaluateProductionPregenHold,
  evaluateProductionReleaseGate,
  isProductionSpecCanaryService,
  productionSpecShouldEnforce,
  productionSpecShouldInject,
  promptContainsProductionSpecBlock,
  readConfirmedOverrideFromMetadata,
  readProductionSpecBinding,
  resolveProductionSpecPromptInject,
  resolveProductionSpecRollout,
} from "../../../src/platform/config/format-production-spec";
import { DeliveryAuthorizationService } from "../../../src/platform/os/delivery/authorization/delivery-authorization";
import type { IArtifactVersionStore } from "../../../src/platform/os/delivery/artifact/artifact-version-store";

describe("format-production-spec phase 5 hardening", () => {
  const prevSpec = process.env.PRODUCTION_SPEC;
  const prevInject = process.env.PRODUCTION_SPEC_PROMPT_INJECT;

  afterEach(() => {
    if (prevSpec === undefined) delete process.env.PRODUCTION_SPEC;
    else process.env.PRODUCTION_SPEC = prevSpec;
    if (prevInject === undefined) delete process.env.PRODUCTION_SPEC_PROMPT_INJECT;
    else process.env.PRODUCTION_SPEC_PROMPT_INJECT = prevInject;
  });

  describe("rollout", () => {
    it("defaults to on", () => {
      delete process.env.PRODUCTION_SPEC;
      expect(resolveProductionSpecRollout({})).toBe("on");
    });

    it("parses PRODUCTION_SPEC env", () => {
      expect(resolveProductionSpecRollout({ PRODUCTION_SPEC: "shadow" })).toBe(
        "shadow",
      );
      expect(resolveProductionSpecRollout({ PRODUCTION_SPEC: "canary" })).toBe(
        "canary",
      );
      expect(resolveProductionSpecRollout({ PRODUCTION_SPEC: "off" })).toBe(
        "off",
      );
    });

    it("canary enforces only social / website / email", () => {
      const env = { PRODUCTION_SPEC: "canary" };
      expect(
        productionSpecShouldEnforce({ service: "social", env: env as NodeJS.ProcessEnv }),
      ).toBe(true);
      expect(
        productionSpecShouldEnforce({ service: "website", env: env as NodeJS.ProcessEnv }),
      ).toBe(true);
      expect(
        productionSpecShouldEnforce({ service: "email", env: env as NodeJS.ProcessEnv }),
      ).toBe(true);
      expect(
        productionSpecShouldEnforce({ service: "print", env: env as NodeJS.ProcessEnv }),
      ).toBe(false);
      expect(isProductionSpecCanaryService("social")).toBe(true);
    });

    it("shadow injects but does not enforce", () => {
      const env = { PRODUCTION_SPEC: "shadow" } as NodeJS.ProcessEnv;
      expect(productionSpecShouldInject({ service: "social", env })).toBe(true);
      expect(productionSpecShouldEnforce({ service: "social", env })).toBe(false);
    });

    it("PRODUCTION_SPEC_PROMPT_INJECT=off skips inject", () => {
      expect(
        resolveProductionSpecPromptInject({
          PRODUCTION_SPEC: "on",
          PRODUCTION_SPEC_PROMPT_INJECT: "off",
        }),
      ).toBe("off");
      expect(
        productionSpecShouldInject({
          env: {
            PRODUCTION_SPEC: "on",
            PRODUCTION_SPEC_PROMPT_INJECT: "off",
          } as NodeJS.ProcessEnv,
        }),
      ).toBe(false);
    });
  });

  describe("instruct skipped when inject off", () => {
    it("does not stamp Spec block when PRODUCTION_SPEC=off", () => {
      process.env.PRODUCTION_SPEC = "off";
      const { metadata, skippedByRollout } = applyProductionSpecInstructToMetadata({
        service: "social",
        subtype: "content-design",
        platform: "instagram",
        format: "feed-post",
      });
      expect(skippedByRollout).toBe(true);
      expect(metadata.productionPromptBlockText).toBeUndefined();
      expect(readProductionSpecBinding(metadata)).toBeUndefined();
    });
  });

  describe("pre-gen R/H hold", () => {
    it("blocks Snapchat brand-takeover (R) without override when enforce on", () => {
      process.env.PRODUCTION_SPEC = "on";
      const hold = evaluateProductionPregenHold({
        platform: "snapchat",
        formatId: "brand-takeover-ad",
      });
      expect(hold.blocked).toBe(true);
      expect(hold.rule?.status).toBe("R");
      expect(hold.reason).toMatch(/PREGEN_HOLD/);
    });

    it("allows R with confirmedOverride", () => {
      process.env.PRODUCTION_SPEC = "on";
      const hold = evaluateProductionPregenHold({
        platform: "snapchat",
        formatId: "brand-takeover-ad",
        confirmedOverride: true,
      });
      expect(hold.blocked).toBe(false);
    });

    it("does not block under shadow (observe only)", () => {
      process.env.PRODUCTION_SPEC = "shadow";
      const hold = evaluateProductionPregenHold({
        platform: "snapchat",
        formatId: "brand-takeover-ad",
      });
      expect(hold.blocked).toBe(false);
      expect(hold.reason).toMatch(/PREGEN_HOLD/);
    });

    it("reads confirmedOverride from metadata", () => {
      expect(readConfirmedOverrideFromMetadata({ confirmedOverride: true })).toBe(
        true,
      );
      expect(
        readConfirmedOverrideFromMetadata({ productionConfirmedOverride: "true" }),
      ).toBe(true);
      expect(readConfirmedOverrideFromMetadata({})).toBe(false);
      expect(
        readConfirmedOverrideFromMetadata({
          cdfPhaseId: "routes",
          cdfSessionId: "cdf_test",
        }),
      ).toBe(true);
    });
  });

  describe("instruct → gate same productionRuleId", () => {
    it("injects Spec then gate resolves the same ruleId", () => {
      process.env.PRODUCTION_SPEC = "on";
      const applied = ensureProviderPromptHasProductionSpec({
        prompt: "Create an Instagram feed post for summer",
        metadata: {
          service: "social",
          subtype: "content-design",
          platform: "instagram",
          format: "feed-post",
        },
      });
      expect(applied.injected).toBe(true);
      expect(promptContainsProductionSpecBlock(applied.prompt)).toBe(true);
      expect(applied.prompt).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);

      const binding = readProductionSpecBinding(applied.metadata);
      expect(binding?.productionRuleId).toBeTruthy();
      expect(applied.productionRuleId).toBe(binding?.productionRuleId);
      expect(applied.metadata.productionPromptBlockHash).toBe(
        binding?.promptBlockHash,
      );

      const gate = evaluateProductionReleaseGate({
        service: "social",
        subtype: "content-design",
        platform: "instagram",
        formatId: "feed-post",
        generatedWidth: 1080,
        generatedHeight: 1080,
      });
      expect(gate.rule?.id).toBe(binding?.productionRuleId);
      expect(gate.allowed).toBe(true);
      expect(gate.decision).toBe("PASS");
    });

    it("website and email canary services also share ruleId across instruct/gate", () => {
      process.env.PRODUCTION_SPEC = "canary";
      for (const meta of [
        { service: "website", subtype: "landing-page" },
        { service: "email", subtype: "emailers" },
      ] as const) {
        const applied = ensureProviderPromptHasProductionSpec({
          prompt: `Create ${meta.service}`,
          metadata: { ...meta },
        });
        expect(applied.injected).toBe(true);
        const binding = readProductionSpecBinding(applied.metadata);
        const gate = evaluateProductionReleaseGate({ ...meta });
        expect(gate.rule?.id).toBe(binding?.productionRuleId);
      }
    });
  });

  describe("delivery auth respects shadow rollout", () => {
    function store(): IArtifactVersionStore {
      return {
        async getVersion() {
          return {
            artifactId: "art1",
            version: 1,
            organizationId: "org1",
            executionId: "exec1",
            approvalState: "APPROVED",
            approvalReference: "apr1",
            planVersion: 1,
          } as never;
        },
        async putVersion() {
          return undefined as never;
        },
      };
    }

    it("allows delivery when gate would block but PRODUCTION_SPEC=shadow", async () => {
      process.env.PRODUCTION_SPEC = "shadow";
      const authz = new DeliveryAuthorizationService(store());
      const result = await authz.authorizeAsync({
        organizationId: "org1",
        artifactId: "art1",
        artifactVersion: 1,
        executionId: "exec1",
        planVersion: 1,
        destination: "export",
        productionGate: {
          platform: "snapchat",
          formatId: "brand-takeover-ad",
        },
        executionMetadata: {
          service: "social",
          platform: "snapchat",
          format: "brand-takeover-ad",
        },
      });
      expect(result.authorized).toBe(true);
    });
  });
});
