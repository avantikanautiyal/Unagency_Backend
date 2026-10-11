/**
 * Conversation-scoped logo choice — asked once, reused for later turns.
 */

import {
  conversationLogoChoicePatch,
  isLogoChangeRequest,
  reusableConversationLogoChoice,
} from "../../../src/platform/collaboration/conversational-task-intelligence/conversation-logo-choice";
import { jobCreatesNewLogo } from "../../../src/platform/collaboration/conversational-task-intelligence/discover-authoritative-logo-inputs";
import { resolveAuthoritativeLogo } from "../../../src/platform/collaboration/conversational-task-intelligence/authoritative-logo-resolver";

const LOGO_A = "a".repeat(24);
const LOGO_B = "b".repeat(24);
const BRAND = "c".repeat(24);

const twoLogos = {
  vaultCandidates: [
    { assetId: LOGO_A, source: "VAULT" as const, name: "Primary Logo" },
    { assetId: LOGO_B, source: "VAULT" as const, name: "White Logo" },
  ],
  attachmentLogoAssetIds: [] as string[],
};

const state = (extra: Record<string, unknown> = {}) => ({
  service: "social",
  brandId: BRAND,
  ...extra,
});

describe("conversation logo choice", () => {
  it("reuses the remembered logo on later turns", () => {
    expect(
      reusableConversationLogoChoice({
        state: state({ logoChoice: { assetId: LOGO_B, brandId: BRAND } }),
        discovery: twoLogos,
        latestUserMessage: "Now make a story version",
      }),
    ).toBe(LOGO_B);
  });

  it("does not reuse it for another brand, a deleted logo, or a new attachment", () => {
    const remembered = { logoChoice: { assetId: LOGO_B, brandId: BRAND } };
    expect(
      reusableConversationLogoChoice({
        state: state({ ...remembered, brandId: "d".repeat(24) }),
        discovery: twoLogos,
        latestUserMessage: "Make a poster",
      }),
    ).toBeUndefined();
    expect(
      reusableConversationLogoChoice({
        state: state(remembered),
        discovery: { ...twoLogos, vaultCandidates: [twoLogos.vaultCandidates[0]!] },
        latestUserMessage: "Make a poster",
      }),
    ).toBeUndefined();
    expect(
      reusableConversationLogoChoice({
        state: state(remembered),
        discovery: { ...twoLogos, attachmentLogoAssetIds: ["e".repeat(24)] },
        latestUserMessage: "Make a poster with this logo",
      }),
    ).toBeUndefined();
  });

  it("asks again when the user wants a different logo, and forgets the old one", () => {
    const remembered = state({ logoChoice: { assetId: LOGO_B, brandId: BRAND } });
    expect(isLogoChangeRequest("Use a different logo")).toBe(true);
    expect(isLogoChangeRequest("Make the logo bigger")).toBe(false);
    expect(
      reusableConversationLogoChoice({
        state: remembered,
        discovery: twoLogos,
        latestUserMessage: "Change the logo",
      }),
    ).toBeUndefined();
    expect(
      conversationLogoChoicePatch({
        state: remembered,
        discovery: twoLogos,
        latestUserMessage: "Change the logo",
        resolvedLogo: { mode: "NEEDS_SELECTION", authoritative: true },
      }),
    ).toEqual({ logoChoice: undefined });
  });

  it("remembers a picked logo but not a brand's only logo", () => {
    expect(
      conversationLogoChoicePatch({
        state: state(),
        discovery: { vaultCandidates: [], attachmentLogoAssetIds: [] },
        latestUserMessage: "Make a poster",
        vaultLogoChoice: LOGO_A,
        resolvedLogo: { mode: "USE_EXISTING", assetId: LOGO_A, authoritative: true },
      }),
    ).toEqual({ logoChoice: { assetId: LOGO_A, brandId: BRAND } });
    expect(
      conversationLogoChoicePatch({
        state: state(),
        discovery: {
          vaultCandidates: [twoLogos.vaultCandidates[0]!],
          attachmentLogoAssetIds: [],
        },
        latestUserMessage: "Make a poster",
        resolvedLogo: { mode: "USE_EXISTING", assetId: LOGO_A, authoritative: true },
      }),
    ).toBeUndefined();
  });

  it("never asks on jobs that design a new logo", () => {
    expect(jobCreatesNewLogo({ service: "branding", subtype: "logo-design" })).toBe(true);
    expect(jobCreatesNewLogo({ brief: "Design a new logo for us" })).toBe(true);
    expect(jobCreatesNewLogo({ brief: "Put our logo on a mug", service: "merchandise" })).toBe(false);
  });

  it("an attached logo wins even when it is already filed in the vault", () => {
    const resolution = resolveAuthoritativeLogo({
      vaultCandidates: twoLogos.vaultCandidates,
      attachmentLogoAssetIds: [LOGO_B],
    });
    expect(resolution.mode).toBe("USE_EXISTING");
    expect(resolution.assetId).toBe(LOGO_B);
  });
});
