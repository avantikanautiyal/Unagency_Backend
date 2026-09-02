import {
  applyVaultLogoSelection,
  type VaultLogoCandidate,
} from "../../../src/services/brand-vault-logo-resolver";

describe("brand-vault-logo-resolver", () => {
  it("binds a selected vault logo into the continuity resolve result", () => {
    const resolved = applyVaultLogoSelection({
      resolve: {
        resolved: [],
        missingRequiredSlots: ["logo"],
        assets: [],
        facts: [],
        negatives: [],
        provenanceParts: [],
      },
      assetId: "vault_logo_2",
    });
    expect(resolved.missingRequiredSlots).not.toContain("logo");
    expect(resolved.assets[0]?.assetId).toBe("vault_logo_2");
    expect(resolved.provenanceParts).toContain("Brand vault logo");
  });

  it("sorts approved vault logos ahead of drafts", () => {
    const candidates: VaultLogoCandidate[] = [
      {
        assetId: "draft",
        name: "Draft logo",
        approvalStatus: "none",
        updatedAt: "2026-08-25T12:00:00.000Z",
      },
      {
        assetId: "approved",
        name: "Approved logo",
        approvalStatus: "approved",
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
    ];
    const sorted = [...candidates].sort((a, b) => {
      const approvedScore = (c: VaultLogoCandidate) =>
        c.approvalStatus === "approved" ? 1 : 0;
      const approvedDiff = approvedScore(b) - approvedScore(a);
      if (approvedDiff !== 0) return approvedDiff;
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bt - at;
    });
    expect(sorted[0]?.assetId).toBe("approved");
  });
});
