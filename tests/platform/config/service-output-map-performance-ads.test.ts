import { resolveServiceOutputSpec } from "../../../src/platform/config/service-output-map";

describe("performance-ads output spec", () => {
  it("stays image when brief mentions production-ready presentation", () => {
    const spec = resolveServiceOutputSpec({
      service: "ads",
      subtype: "performance-ads",
      prompt:
        "Honour brand craft with production-ready presentation for paid Meta ads",
    });
    expect(spec.kind).toBe("image");
  });

  it("stays image for typical performance ad briefs", () => {
    const spec = resolveServiceOutputSpec({
      service: "ads",
      subtype: "performance-ads",
      prompt: "Create scroll-stopping performance ads for blue summer sale",
    });
    expect(spec.kind).toBe("image");
  });
});
