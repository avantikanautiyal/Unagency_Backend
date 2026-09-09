/**
 * Phase C/D — service defaults, QC checklist, Spec pixel masters.
 */

import {
  resolveProductionRule,
  resolveQcChecklistItems,
  resolveQcChecklistLabels,
  listServiceDefaultRules,
  UNIVERSAL_QC_CHECKLIST_LABELS,
} from "../../../src/platform/config/format-production-spec";
import {
  extractSemanticSignals,
  resolveExecutionSpecification,
} from "../../../src/platform/collaboration/conversational-task-intelligence";

describe("service default production rules", () => {
  it("lists non-social service defaults", () => {
    const services = new Set(listServiceDefaultRules().map((r) => r.service));
    expect(services.has("email")).toBe(true);
    expect(services.has("print")).toBe(true);
    expect(services.has("presentations")).toBe(true);
    expect(services.has("packaging")).toBe(true);
    expect(services.has("video")).toBe(true);
    expect(services.has("branding")).toBe(true);
    expect(services.has("website")).toBe(true);
  });

  it("resolves emailers to 600px house content width", () => {
    const resolved = resolveProductionRule({
      service: "email",
      subtype: "emailers",
    });
    expect(resolved?.matchedBy).toBe("serviceDefault");
    expect(resolved?.rule.canvas).toEqual({
      width: 600,
      height: 800,
      unit: "px",
    });
    expect(resolved?.rule.status).toBe("D");
  });

  it("resolves print brochures with bleed metadata", () => {
    const resolved = resolveProductionRule({
      service: "print",
      subtype: "brochures",
    });
    expect(resolved?.rule.canvas?.unit).toBe("mm");
    expect(resolved?.rule.print?.bleedMm).toBe(3);
    expect(resolved?.rule.print?.effectivePpi).toBe(300);
  });

  it("holds packaging boxes until vendor dieline confirmed", () => {
    const resolved = resolveProductionRule({
      service: "packaging",
      subtype: "boxes",
    });
    expect(resolved?.rule.status).toBe("R");
    expect(resolved?.rule.blocksReleaseIfUnconfirmed).toBe(true);
  });

  it("prefills execution technical from email service default", () => {
    const message = "Design a launch emailer.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "email",
      subtype: "emailers",
    });
    expect(spec.technical.width?.value).toBe(600);
    expect(spec.technical.height?.value).toBe(800);
    expect(spec.technical.resolution?.value).toBe("sRGB");
  });

  it("prefills presentation 16:9 from service default", () => {
    const message = "Build a corporate pitch deck.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "presentations",
      subtype: "corporate",
    });
    expect(spec.technical.width?.value).toBe(1920);
    expect(spec.technical.height?.value).toBe(1080);
  });
});

describe("QC checklist from Spec", () => {
  it("always includes universal hygiene labels", () => {
    const labels = resolveQcChecklistLabels();
    for (const u of UNIVERSAL_QC_CHECKLIST_LABELS) {
      expect(labels).toContain(u);
    }
  });

  it("adds email Spec how-to checks for emailers", () => {
    const items = resolveQcChecklistItems({
      service: "email",
      subtype: "emailers",
    });
    expect(items.some((i) => i.source === "production-spec")).toBe(true);
    expect(
      items.some((i) => /600 px|live text\/HTML|dark-mode/i.test(i.label)),
    ).toBe(true);
  });

  it("adds authority confirmation for R OOH", () => {
    const items = resolveQcChecklistItems({
      service: "print",
      subtype: "ooh-design",
    });
    expect(
      items.some((i) => /Status R:.*confirmed before approval/i.test(i.label)),
    ).toBe(true);
  });

  it("folds social service hygiene onto Instagram placement", () => {
    const items = resolveQcChecklistItems({
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      formatId: "reels",
    });
    expect(
      items.some((i) => /never approve an asset for “All”/i.test(i.label)),
    ).toBe(true);
    expect(
      items.some((i) => /1080×1920px/i.test(i.label) && i.id.includes("canvas")),
    ).toBe(true);
  });
});
