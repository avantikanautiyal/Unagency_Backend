/**
 * Regression: production Spec / Visual Field Guide must not project platform
 * house brand identity into client-brand image provider prompts.
 */

import {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY,
  PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY_FORMAT,
  buildProductionPromptBlock,
  promptContainsProductionSpecBlock,
  resolveProductionRule,
} from "../../../src/platform/config/format-production-spec";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request";
import type { CanonicalModelRequest } from "../../../src/platform/ai/canonical-model-request";

describe("production Spec — brand-agnostic provider projection", () => {
  it("does not instruct image models to render a platform house wordmark", () => {
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "feed-post",
      placementId: "feed.square",
    });
    expect(resolved?.rule.id).toBe("instagram.feed.square");
    const block = buildProductionPromptBlock({ rule: resolved!.rule });

    expect(block.text).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(block.text).toContain("[production_constraints]");
    expect(block.text).not.toMatch(/UNAGENCY wordmark/i);
    expect(block.text).not.toMatch(/UNAGENCY-only/i);
    expect(block.text).not.toMatch(/UNAGENCY service carousel/i);
    expect(block.text).not.toMatch(/approved UNAGENCY\s*\//i);
    expect(block.text).not.toMatch(/\[Format Production Spec\]/);
    expect(block.text).toMatch(/supplied brand wordmark/i);
    expect(block.text).toMatch(/approved client brand/i);
  });

  it("detects current and legacy Spec headers for idempotent inject", () => {
    expect(promptContainsProductionSpecBlock(PRODUCTION_PROMPT_BLOCK_HEADER)).toBe(
      true,
    );
    expect(
      promptContainsProductionSpecBlock(PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY),
    ).toBe(true);
    expect(
      promptContainsProductionSpecBlock(
        PRODUCTION_PROMPT_BLOCK_HEADER_LEGACY_FORMAT,
      ),
    ).toBe(true);
    expect(promptContainsProductionSpecBlock("no spec here")).toBe(false);
  });

  it("preserves selected direction + current instruction through CMR flatten without house-brand contamination", () => {
    const resolved = resolveProductionRule({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "feed-post",
      placementId: "feed.square",
    });
    const block = buildProductionPromptBlock({ rule: resolved!.rule });
    const instruction =
      "Hi, I want to create an instagram post about my brand. It is an introductory post.";
    const cmr = {
      messages: [
        {
          role: "developer",
          content: [
            {
              type: "structured",
              name: "production_spec",
              semanticRole: "production_spec",
              schema: resolved!.rule.id,
              version: "1.1.0",
              data: {
                productionRuleId: resolved!.rule.id,
                contentHash: block.contentHash,
                text: block.text,
                sections: block.sections,
              },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              semanticRole: "current_user_instruction",
              text: instruction,
            },
            {
              type: "structured",
              name: "selected_semantic_directions",
              semanticRole: "selected_semantic_direction",
              data: [
                {
                  phaseId: "routes",
                  choice: {
                    routeId: "route_01_sunny_introduction",
                    name: "Sunny Introduction",
                    creativeIdea: "Bright welcoming brand story for Sunflower.",
                    visualTreatment:
                      "Sunflower logo at center with blue, green, yellow, cream.",
                    headlineAngle: "Where Learning Blooms",
                    rationale: "Balances playful and professional.",
                  },
                },
              ],
            },
            {
              type: "structured",
              name: "brand_context",
              semanticRole: "brand_context",
              data: {
                brandName: "Sunflower",
                facts: [{ key: "brandName", value: "Sunflower" }],
              },
            },
          ],
        },
      ],
      context: {
        requirements: [],
        constraints: [],
        exclusions: [],
        selections: [],
        approvedDecisions: [],
      },
      outputContract: {
        name: "social-media.output",
        required: true,
        instructions: [],
        generationModality: "image",
      },
      metadata: {
        productionSpecPresent: true,
        outputRequirementsPresent: true,
      },
    } as unknown as CanonicalModelRequest;

    const prompt = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    expect(prompt).toContain("CURRENT USER INSTRUCTION");
    expect(prompt).toContain(instruction);
    expect(prompt).toContain("Sunny Introduction");
    expect(prompt).toContain("Sunflower");
    expect(prompt).toContain("PRODUCTION SPEC");
    expect(prompt).toContain("[production_constraints]");
    expect(prompt).not.toMatch(/Keep the supplied UNAGENCY wordmark/i);
    expect(prompt).not.toMatch(/UNAGENCY service carousel/i);
    expect(prompt).not.toMatch(/\[Format Production Spec\]/);
  });
});
