import { CredentialMasker } from "../../../../../src/platform/intelligence/providers/identity/masking/credential-masker";

describe("CredentialMasker", () => {
  const masker = new CredentialMasker(4);

  it("partial masking reveals only the tail", () => {
    const masked = masker.maskPartial("sk-1234567890");
    expect(masked.endsWith("7890")).toBe(true);
    expect(masked).not.toContain("123456");
    expect(masked).not.toBe("sk-1234567890");
  });

  it("fully masks short secrets", () => {
    expect(masker.maskPartial("ab")).toBe("**");
  });

  it("full masking never reveals the secret", () => {
    const masked = masker.maskFull("super-secret");
    expect(masked).not.toContain("super");
    expect(/^\*+$/.test(masked)).toBe(true);
  });

  it("audit masking only reveals the length", () => {
    expect(masker.maskForAudit("abcdef")).toBe("<masked:6>");
    expect(masker.maskForAudit("")).toBe("<empty>");
  });

  it("safe logging never contains the raw value", () => {
    expect(masker.safe("token-value")).not.toContain("token-value");
  });
});
