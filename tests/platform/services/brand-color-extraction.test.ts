import {
  briefSpecifiesColorPalette,
  extractBriefColors,
} from "../../../src/services/brand-color-extraction";
import { detectIntentGateFromBrief } from "../../../src/platform/os/creative/intent-gate";
import { applyInlineBriefColorSatisfaction } from "../../../src/services/brand-inline-color-satisfaction";

describe("brand-color-extraction", () => {
  it("extracts Hindi transliterated colours", () => {
    expect(
      extractBriefColors("Instagram post ke liye rang laal aur neela hon")
    ).toEqual(expect.arrayContaining(["red", "blue"]));
  });

  it("extracts Spanish colours", () => {
    expect(
      extractBriefColors("Post para Instagram con colores rojo y dorado")
    ).toEqual(expect.arrayContaining(["red", "gold"]));
  });

  it("extracts Devanagari colour words", () => {
    expect(extractBriefColors("ब्रांड रंग लाल और हरा")).toEqual(
      expect.arrayContaining(["red", "green"])
    );
  });

  it("extracts colour before palette keyword when list capture misses it", () => {
    expect(
      extractBriefColors("Use a bold red palette for the launch ads"),
    ).toEqual(expect.arrayContaining(["red"]));
  });

  it("detects brief-specified palette for continuity", () => {
    expect(
      briefSpecifiesColorPalette("Rang laal aur safed use karo brochure mein")
    ).toBe(true);
  });

  it("does not require approved colors slot when Hindi palette is in brief", () => {
    const r = detectIntentGateFromBrief(
      "Brochure banao. Brand rang kesari aur neela hon."
    );
    expect(r.requiredSlots).not.toContain("colors");
  });

  it("satisfies missing colors slot from inline brief colours", () => {
    const resolved = applyInlineBriefColorSatisfaction({
      brief: "Colores rojo y azul para el folleto",
      resolve: {
        resolved: [],
        missingRequiredSlots: ["colors"],
        assets: [],
        facts: [],
        negatives: [],
        provenanceParts: [],
      },
    });
    expect(resolved.missingRequiredSlots).not.toContain("colors");
    expect(resolved.facts.some((f) => f.key === "colors")).toBe(true);
  });
});
