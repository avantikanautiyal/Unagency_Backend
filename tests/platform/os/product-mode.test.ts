import {
  parseProductMode,
  resolveProductMode,
  productModeBlocksAiExecution,
  productModeAutoApprovesTools,
  isProductMode,
} from "../../../src/platform/os/contracts/product-mode";

describe("product mode contract", () => {
  const prevDefault = process.env.ENTERPRISE_DEFAULT_PRODUCT_MODE;

  afterEach(() => {
    if (prevDefault === undefined) delete process.env.ENTERPRISE_DEFAULT_PRODUCT_MODE;
    else process.env.ENTERPRISE_DEFAULT_PRODUCT_MODE = prevDefault;
  });

  it("parses productMode and legacy creationMode", () => {
    expect(parseProductMode({ productMode: "ai" })).toBe("ai");
    expect(parseProductMode({ creationMode: "hybrid" })).toBe("hybrid");
    expect(parseProductMode({ productMode: "human" })).toBe("human");
    expect(parseProductMode({ productMode: "invalid" })).toBeUndefined();
  });

  it("blocks AI only in human mode", () => {
    expect(productModeBlocksAiExecution("human")).toBe(true);
    expect(productModeBlocksAiExecution("ai")).toBe(false);
    expect(productModeBlocksAiExecution("hybrid")).toBe(false);
    expect(productModeBlocksAiExecution(undefined)).toBe(false);
  });

  it("auto-approves tools in ai and hybrid modes", () => {
    expect(productModeAutoApprovesTools("ai")).toBe(true);
    expect(productModeAutoApprovesTools("hybrid")).toBe(true);
    expect(productModeAutoApprovesTools("human")).toBe(false);
    expect(productModeAutoApprovesTools(undefined)).toBe(false);
  });

  it("validates product mode literals", () => {
    expect(isProductMode("hybrid")).toBe(true);
    expect(isProductMode("studio")).toBe(false);
  });

  it("resolveProductMode defaults to ai when metadata omits mode", () => {
    expect(resolveProductMode(undefined)).toBe("ai");
    expect(resolveProductMode({})).toBe("ai");
    expect(resolveProductMode({ productMode: "hybrid" })).toBe("hybrid");
  });

  it("resolveProductMode respects ENTERPRISE_DEFAULT_PRODUCT_MODE", () => {
    process.env.ENTERPRISE_DEFAULT_PRODUCT_MODE = "hybrid";
    expect(resolveProductMode(undefined)).toBe("hybrid");
  });
});
