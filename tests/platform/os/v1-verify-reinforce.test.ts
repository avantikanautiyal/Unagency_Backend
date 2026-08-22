/**
 * V1 brand constraint verify + refine output-type routing.
 */

import { verifyAndReinforceBrandConstraints } from "../../../src/services/brand-constraint-verify";
import { inferOutputType } from "../../../src/platform/os/refinement/questions/question-bank";
import { createDefaultQuestionBank } from "../../../src/platform/os/refinement/questions/question-bank";

describe("inferOutputType product services", () => {
  it("maps presentations → presentation", () => {
    expect(inferOutputType({ productService: "presentations" })).toBe(
      "presentation"
    );
  });

  it("maps branding → logo", () => {
    expect(inferOutputType({ productService: "branding" })).toBe("logo");
  });

  it("presentation root exists in question bank", () => {
    const bank = createDefaultQuestionBank();
    const root = bank.rootFor("presentation");
    expect(root.questionId).toBe("q_presentation_root");
    expect(root.outputType).toBe("presentation");
  });
});

describe("verifyAndReinforceBrandConstraints", () => {
  it("skips thin enhance actions", async () => {
    const r = await verifyAndReinforceBrandConstraints({
      organizationId: "000000000000000000000001",
      productAction: "enhance_prompt",
      lockedColors: ["#112233"],
      outputText: "something without palette",
    });
    expect(r.checked).toBe(false);
    expect(r.passed).toBe(true);
  });

  it("fails when output hex ignores locked palette", async () => {
    const r = await verifyAndReinforceBrandConstraints({
      organizationId: "000000000000000000000001",
      lockedColors: ["#112233"],
      outputText:
        "Deck theme uses #ff00aa and #00ffaa throughout the hero and CTA slides with dense copy.",
      productAction: "create_design",
    });
    expect(r.checked).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.fixDirective).toMatch(/#112233/);
  });

  it("passes when locked palette hex appears in output", async () => {
    const r = await verifyAndReinforceBrandConstraints({
      organizationId: "000000000000000000000001",
      lockedColors: ["#112233"],
      outputText:
        "Use brand color #112233 for headlines and keep supporting tones muted across the deck.",
      productAction: "create_design",
    });
    expect(r.checked).toBe(true);
    expect(r.passed).toBe(true);
  });
});
