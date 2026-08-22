/**
 * K1 — Prompt fact extraction unit tests (no Mongo).
 */

import {
  extractPromptFacts,
  isolateUserBriefForFacts,
} from "../../../src/services/knowledge-prompt-fact-learner";

describe("K1 — prompt fact extraction", () => {
  it("isolates user brief from OS megaprompt wrappers", () => {
    const raw = [
      "[Product selection] service=presentations",
      "[Selected brand] Brand name: Shell",
      "[User prompt]",
      "Pitch deck for Acme Labs aimed at Gen Z founders. Price: ₹999/mo.",
      "[Structured Brief — authoritative]",
      "intent=document",
    ].join("\n");
    const brief = isolateUserBriefForFacts(raw);
    expect(brief).toMatch(/Acme Labs/);
    expect(brief).not.toMatch(/Structured Brief/);
    expect(brief).not.toMatch(/Product selection/);
  });

  it("extracts labelled product, audience, and price facts", () => {
    const facts = extractPromptFacts(
      "Create a pitch deck. Brand name: Meridian Health. Audience: busy professionals. Price: $49/mo. USP: AI-powered meal plans."
    );
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey.brand_name).toMatch(/Meridian Health/i);
    expect(byKey.audience).toMatch(/busy professionals/i);
    expect(byKey.price).toMatch(/49/);
    expect(byKey.usp).toMatch(/meal plans/i);
    expect(facts.every((f) => f.confidence >= 0.7)).toBe(true);
  });

  it("extracts brand from 'for BrandName' phrasing", () => {
    const facts = extractPromptFacts(
      "Design a terracotta and cream pitch deck for Nova Robotics targeting startups in deep tech."
    );
    expect(facts.some((f) => f.key === "brand_name" && /Nova Robotics/i.test(f.value))).toBe(
      true
    );
    expect(facts.some((f) => f.key === "audience")).toBe(true);
  });

  it("returns empty for thin creative fluff without business facts", () => {
    const facts = extractPromptFacts("Make something cool and modern please.");
    expect(facts).toEqual([]);
  });

  it("skips long instruction-like values mistaken as product names", () => {
    const facts = extractPromptFacts(
      "Product name: create a beautiful modern pitch deck with lots of slides and animations"
    );
    // Too instruction-like / long creative fluff — extractor should reject.
    expect(facts.filter((f) => f.key === "product_name")).toHaveLength(0);
  });
});
