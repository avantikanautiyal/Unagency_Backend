/**
 * Phase 1 — Production Spec instruct path reaches providers + shares ruleId with gate.
 */

import {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  appendProductionPromptBlockToText,
  applyProductionSpecInstructToMetadata,
  buildProductionGateFromExecutionContext,
  ensureProviderPromptHasProductionSpec,
  evaluateProductionReleaseGate,
  promptContainsProductionSpecBlock,
  readProductionSpecBinding,
  resolveProductionInstructBundle,
} from "../../../src/platform/config/format-production-spec";
import { appendOutputRequirementsToPrompt } from "../../../src/platform/direct/append-output-requirements";
import {
  extractSemanticSignals,
  resolveExecutionSpecification,
  stampExecutionSpecMetadata,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { orderEmailProviderPrompt } from "../../../src/platform/os/delivery/email-generation";
import { orderWebsiteProviderPrompt } from "../../../src/platform/os/delivery/website-generation";
import { orderPresentationProviderPrompt } from "../../../src/platform/os/delivery/presentation-generation";
import { BEST_EFFORT_VISUAL_PRODUCTION_ELIGIBLE } from "../../../src/platform/os/delivery/best-effort-visual-image";

describe("Phase 1 — production instruct into execution instruction", () => {
  it("embeds Spec prompt block in executionInstruction for social format", () => {
    const spec = resolveExecutionSpecification({
      message: "Create an Instagram feed post for the summer sale",
      signals: extractSemanticSignals(
        "Create an Instagram feed post for the summer sale",
      ),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "feed-post",
    });

    expect(promptContainsProductionSpecBlock(spec.executionInstruction)).toBe(
      true,
    );
    expect(spec.executionInstruction).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(spec.executionInstruction).toMatch(/Canvas:/i);
    expect(spec.technical.width?.value).toBeDefined();
    expect(spec.technical.height?.value).toBeDefined();
  });

  it("embeds Spec for emailer service default", () => {
    const message = "Design a launch emailer for the product.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "email",
      subtype: "emailers",
    });
    expect(promptContainsProductionSpecBlock(spec.executionInstruction)).toBe(
      true,
    );
    expect(spec.technical.width?.value).toBe(600);
    expect(spec.executionInstruction).toMatch(/600/i);
  });

  it("embeds Spec for website landing page", () => {
    const message = "Build a landing page for UNAGENCY.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "website",
      subtype: "landing-page",
    });
    expect(promptContainsProductionSpecBlock(spec.executionInstruction)).toBe(
      true,
    );
    expect(spec.executionInstruction).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
  });

  it("embeds Spec for short video / reels", () => {
    const message = "Make a 15 second Instagram Reel promo.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      platform: "instagram",
      format: "reels",
    });
    expect(promptContainsProductionSpecBlock(spec.executionInstruction)).toBe(
      true,
    );
    expect(spec.technical.width?.value).toBe(1080);
    expect(spec.technical.height?.value).toBe(1920);
  });

  it("is idempotent when appending the block twice", () => {
    const bundle = resolveProductionInstructBundle({
      platform: "instagram",
      formatId: "reels",
    });
    expect(bundle).toBeDefined();
    const once = appendProductionPromptBlockToText(
      "Make a reel",
      bundle!.promptBlock.text,
    );
    const twice = appendProductionPromptBlockToText(
      once,
      bundle!.promptBlock.text,
    );
    expect(twice).toBe(once);
    expect(twice.split(PRODUCTION_PROMPT_BLOCK_HEADER).length - 1).toBe(1);
  });
});

describe("Phase 1 — stamp binding + instruct/enforce same ruleId", () => {
  it("stamps productionSpecBinding whose ruleId matches the release gate", () => {
    const spec = resolveExecutionSpecification({
      message: "Facebook page cover video",
      signals: extractSemanticSignals("Facebook page cover video"),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      platform: "facebook",
      format: "page-cover-video",
    });

    const meta = stampExecutionSpecMetadata(
      { platform: "facebook", format: "page-cover-video", service: "social" },
      {
        executionId: "exec_phase1",
        spec,
        nowIso: () => "2026-09-07T00:00:00.000Z",
        createId: (p) => `${p}_1`,
      },
    );

    const binding = readProductionSpecBinding(meta);
    expect(binding?.productionRuleId).toBe("facebook.page-cover-video");
    expect(binding?.promptBlockHash).toBeTruthy();
    expect(meta.productionPromptBlockText).toEqual(
      expect.stringContaining(PRODUCTION_PROMPT_BLOCK_HEADER),
    );
    expect(
      promptContainsProductionSpecBlock(
        String(meta.conversationalEffectiveInstruction ?? ""),
      ),
    ).toBe(true);

    const gateInput = buildProductionGateFromExecutionContext(meta);
    expect(gateInput?.placementId ?? gateInput?.formatId).toBeTruthy();
    const gate = evaluateProductionReleaseGate(gateInput!);
    expect(gate.rule?.id).toBe(binding!.productionRuleId);
    expect(gate.allowed).toBe(false);
  });

  it("seeds aspectRatio and canvas wire params from Spec when missing", () => {
    const applied = applyProductionSpecInstructToMetadata({
      platform: "instagram",
      format: "reels",
      service: "social",
    });
    expect(applied.metadata.aspectRatio).toMatch(/^\d+:\d+$/);
    expect(applied.metadata.productionCanvasWidth).toBe(1080);
    expect(applied.metadata.productionCanvasHeight).toBe(1920);
    expect(applied.metadata.productionCanvasUnit).toBe("px");
    expect(applied.metadata.width).toBe(1080);
    expect(applied.metadata.height).toBe(1920);
    expect(applied.bundle?.binding.productionRuleId).toContain("instagram");
    expect(Array.isArray(applied.metadata.productionExportFormats)).toBe(true);
  });
});

describe("Phase 1 — provider-facing prompt injection", () => {
  it("injects Spec block into image passthrough prompts", () => {
    const out = appendOutputRequirementsToPrompt({
      prompt: "Summer sale hero for Reels",
      metadata: {
        capabilityId: "image.generate",
        platform: "instagram",
        format: "reels",
        service: "social",
      },
    });
    expect(out).toContain("Summer sale hero for Reels");
    expect(out).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(out).toMatch(/Authority:/i);
  });

  it("injects Spec into website early-return path", () => {
    const out = appendOutputRequirementsToPrompt({
      prompt: "Landing page for launch",
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputKind: "website",
      },
    });
    expect(out).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(out).toContain("Landing page for launch");
  });

  it("injects Spec into video.generate passthrough", () => {
    const out = appendOutputRequirementsToPrompt({
      prompt: "15s vertical promo",
      metadata: {
        capabilityId: "video.generate",
        service: "video",
        subtype: "promo",
        platform: "instagram",
        format: "reels",
      },
    });
    expect(out).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(out).toMatch(/1080/i);
  });

  it("ensureProviderPromptHasProductionSpec returns injected=true once", () => {
    const first = ensureProviderPromptHasProductionSpec({
      prompt: "LinkedIn landscape ad",
      metadata: {
        platform: "linkedin",
        format: "linkedin.ad.single-image.landscape",
        service: "social",
      },
    });
    expect(first.injected).toBe(true);
    expect(first.productionRuleId).toBe("linkedin.ad.single-image.landscape");

    const second = ensureProviderPromptHasProductionSpec({
      prompt: first.prompt,
      metadata: first.metadata,
    });
    expect(second.injected).toBe(false);
    expect(second.prompt).toBe(first.prompt);
  });
});

describe("Phase 1 — modality compilers preserve Spec", () => {
  it("re-injects Spec after email / website / presentation ordering", () => {
    const meta = {
      service: "email",
      subtype: "emailers",
    };
    const body = ensureProviderPromptHasProductionSpec({
      prompt: "Newsletter for Q3 launch",
      metadata: meta,
    }).prompt;

    const emailOrdered = orderEmailProviderPrompt({
      body,
      userBrief: "Newsletter for Q3 launch",
      service: "email",
      subtype: "emailers",
    });
    const emailFinal = ensureProviderPromptHasProductionSpec({
      prompt: emailOrdered,
      metadata: meta,
    }).prompt;
    expect(promptContainsProductionSpecBlock(emailFinal)).toBe(true);
    expect(emailFinal.split(PRODUCTION_PROMPT_BLOCK_HEADER).length - 1).toBe(1);

    const webMeta = { service: "website", subtype: "landing-page" };
    const webBody = ensureProviderPromptHasProductionSpec({
      prompt: "UNAGENCY landing page",
      metadata: webMeta,
    }).prompt;
    const webOrdered = orderWebsiteProviderPrompt({
      body: webBody,
      userBrief: "UNAGENCY landing page",
    });
    const webFinal = ensureProviderPromptHasProductionSpec({
      prompt: webOrdered,
      metadata: webMeta,
    }).prompt;
    expect(promptContainsProductionSpecBlock(webFinal)).toBe(true);

    const deckMeta = { service: "presentations", subtype: "corporate" };
    const deckBody = ensureProviderPromptHasProductionSpec({
      prompt: "Pitch deck",
      metadata: deckMeta,
    }).prompt;
    const deckOrdered = orderPresentationProviderPrompt({
      body: deckBody,
      userBrief: "Pitch deck",
    });
    const deckFinal = ensureProviderPromptHasProductionSpec({
      prompt: deckOrdered,
      metadata: deckMeta,
    }).prompt;
    expect(promptContainsProductionSpecBlock(deckFinal)).toBe(true);
  });
});

describe("Phase 1 — best-effort soft path", () => {
  it("marks best-effort visuals as not production-release eligible", () => {
    expect(BEST_EFFORT_VISUAL_PRODUCTION_ELIGIBLE).toBe(false);
  });
});
