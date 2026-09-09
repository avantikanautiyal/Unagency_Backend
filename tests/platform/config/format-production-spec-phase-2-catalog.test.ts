/**
 * Phase 2 — Catalog completeness: all 15 services + structured hygiene.
 */

import {
  SERVICE_OUTPUT_MAP,
} from "../../../src/platform/config/service-output-map";
import {
  ALL_PRODUCTION_RULES,
  PRODUCTION_PROMPT_BLOCK_HEADER,
  buildProductionPromptBlock,
  listServiceDefaultRules,
  promptContainsProductionSpecBlock,
  resolveProductionInstructBundle,
  resolveProductionRule,
} from "../../../src/platform/config/format-production-spec";
import {
  extractSemanticSignals,
  resolveExecutionSpecification,
} from "../../../src/platform/collaboration/conversational-task-intelligence";

const REQUIRED_SERVICES = [
  "social",
  "website",
  "branding",
  "packaging",
  "print",
  "video",
  "presentations",
  "email",
  "pos",
  "merchandise",
  "illustration",
  "photography",
  "strategy",
  "ads",
  "event",
] as const;

function mapKeys(): string[] {
  return Object.keys(SERVICE_OUTPUT_MAP).filter((k) => !k.endsWith("/*"));
}

describe("Phase 2 — service catalog coverage", () => {
  it("includes house defaults for all 15 Hygiene Reference services", () => {
    const services = new Set(listServiceDefaultRules().map((r) => r.service));
    for (const svc of REQUIRED_SERVICES) {
      expect(services.has(svc)).toBe(true);
    }
  });

  it("attaches structured hygieneChecks to every service-default rule", () => {
    for (const rule of listServiceDefaultRules()) {
      expect(rule.hygieneChecks?.length ?? 0).toBeGreaterThan(0);
      expect(rule.beforeCreateChecks?.length ?? 0).toBeGreaterThan(0);
      expect(rule.howToCreate?.length ?? 0).toBeGreaterThan(0);
      const gates = rule.hygieneChecks!.filter((c) => c.weight === "gate");
      expect(gates.length).toBeGreaterThan(0);
    }
  });

  it("resolves every concrete SERVICE_OUTPUT_MAP path to a Spec rule", () => {
    const missing: string[] = [];
    for (const key of mapKeys()) {
      const [service, subtype] = key.split("/");
      const resolved = resolveProductionRule({ service, subtype });
      if (!resolved) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it("builds a non-empty Production Spec prompt block for every map path", () => {
    const empty: string[] = [];
    for (const key of mapKeys()) {
      const [service, subtype] = key.split("/");
      const bundle = resolveProductionInstructBundle({ service, subtype });
      if (
        !bundle ||
        !promptContainsProductionSpecBlock(bundle.promptBlock.text) ||
        bundle.promptBlock.hardConstraintLines.length === 0
      ) {
        empty.push(key);
      }
    }
    expect(empty).toEqual([]);
  });

  it("aliases normalize visual-production and brand-strategy services", () => {
    expect(
      resolveProductionRule({
        service: "visual-production",
        subtype: "product",
      })?.rule.service,
    ).toBe("photography");
    expect(
      resolveProductionRule({
        service: "brand-strategy",
        subtype: "brand-strategy",
      })?.rule.service,
    ).toBe("strategy");
    expect(
      resolveProductionRule({ service: "web", subtype: "landing-page" })?.rule
        .service,
    ).toBe("website");
  });

  it("falls back to service/other when subtype is unknown", () => {
    const resolved = resolveProductionRule({
      service: "merchandise",
      subtype: "totally-unknown-widget",
    });
    expect(resolved?.rule.id).toBe("merchandise.other.default");
  });
});

describe("Phase 2 — representative instruct paths", () => {
  it("POS sampling booths resolve with structured hygiene + canvas", () => {
    const resolved = resolveProductionRule({
      service: "pos",
      subtype: "sampling-booths",
    });
    expect(resolved?.rule.canvas).toEqual({
      width: 1200,
      height: 900,
      unit: "px",
    });
    expect(resolved?.rule.hygieneChecks?.some((c) => c.id === "fit")).toBe(
      true,
    );
    const block = buildProductionPromptBlock({ rule: resolved!.rule });
    expect(block.text).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
    expect(block.sections.some((s) => s.id === "hard_gates")).toBe(true);
  });

  it("ads performance embeds Spec in executionInstruction", () => {
    const message = "Create performance ad variants for the spring sale.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "ads",
      subtype: "performance-ads",
    });
    expect(promptContainsProductionSpecBlock(spec.executionInstruction)).toBe(
      true,
    );
    expect(spec.executionInstruction).toMatch(/message-match|landing page/i);
  });

  it("strategy and event paths inject Spec", () => {
    for (const input of [
      { service: "strategy", subtype: "brand-strategy" },
      { service: "event", subtype: "event-identity" },
      { service: "illustration", subtype: "infographics" },
      { service: "photography", subtype: "product" },
    ] as const) {
      const bundle = resolveProductionInstructBundle(input);
      expect(bundle?.promptBlock.text).toContain(PRODUCTION_PROMPT_BLOCK_HEADER);
      expect(bundle?.binding.productionRuleId).toContain(input.service);
    }
  });

  it("keeps packaging boxes on Review (R) with dieline hygiene", () => {
    const resolved = resolveProductionRule({
      service: "packaging",
      subtype: "boxes",
    });
    expect(resolved?.rule.status).toBe("R");
    expect(resolved?.rule.blocksReleaseIfUnconfirmed).toBe(true);
    expect(
      resolved?.rule.hygieneChecks?.some((c) => c.id === "dieline"),
    ).toBe(true);
  });

  it("ALL_PRODUCTION_RULES includes both platforms and expanded service defaults", () => {
    expect(ALL_PRODUCTION_RULES.length).toBeGreaterThan(100);
    expect(listServiceDefaultRules().length).toBeGreaterThanOrEqual(90);
  });
});
