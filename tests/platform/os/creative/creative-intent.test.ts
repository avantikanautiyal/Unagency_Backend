import {
  resolveCreativeIntentFromServicePrior,
  detectIntentGateFromBrief,
} from "../../../../src/platform/os/creative";

describe("creative intent service prior (no brief regex)", () => {
  it("maps social + canonical logo to reuse_canonical", () => {
    const intent = resolveCreativeIntentFromServicePrior({
      service: "social",
      subtype: "content-design",
      hasCanonicalLogo: true,
    });
    expect(intent.primaryDeliverable).toBe("social_post");
    expect(intent.logoRole).toBe("reuse_canonical");
    expect(intent.source).toBe("service_prior");
  });

  it("maps logo-design to create_new", () => {
    const intent = resolveCreativeIntentFromServicePrior({
      service: "branding",
      subtype: "logo-design",
    });
    expect(intent.primaryDeliverable).toBe("logo_mark");
    expect(intent.logoRole).toBe("create_new");
  });

  it("does not treat approved-logo social brief as new_mark without logoRole", () => {
    const r = detectIntentGateFromBrief(
      "use the approved logo in our social media post",
      { service: "social", subtype: "content-design" }
    );
    expect(r.intentTags).not.toContain("new_mark");
    expect(r.intentTags).toContain("unspecified");
  });

  it("honors reuse logoRole for approved-logo social brief", () => {
    const r = detectIntentGateFromBrief(
      "use the approved logo in our social media post",
      {
        service: "social",
        subtype: "content-design",
        logoRole: "reuse_canonical",
      }
    );
    expect(r.intentTags).toContain("reuse_logo");
    expect(r.requiredSlots).toContain("logo");
  });
});
