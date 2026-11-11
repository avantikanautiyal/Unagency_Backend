/**
 * Nov 11 2026 — the logo question was asked twice. The user's tap re-ran the
 * step with vaultLogoChoice set, but the resolver's "logo selection still
 * ambiguous" branch fired anyway because the step prompt contains the word
 * "use" ("Do NOT use a document title…"). Live evidence: the second question's
 * resume metadata already carried the picked vaultLogoChoice.
 */

import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import type { ServiceAiConversationState } from "../../../src/platform/collaboration/service-conversation-types";

const LOGO_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LOGO_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

const STEP_PROMPT =
  "Client brief:\nCreate a cartoon for my brand\n\nThis stage only: Design Routes\n" +
  "Return exactly 3 distinct design route options. Do NOT use a document title, " +
  "images, logos, slides.\n\nSelected direction (locked):\nI Don't Have One\n\n" +
  "Generate ONLY this stage deliverable.";

const discovery = (vaultLogoChoice?: string) => ({
  vaultCandidates: [
    { assetId: LOGO_A, source: "VAULT" as const, name: "Usage Guidelines" },
    { assetId: LOGO_B, source: "VAULT" as const, name: "Primary Logo" },
  ],
  attachmentLogoAssetIds: [],
  ...(vaultLogoChoice ? { vaultLogoChoice } : {}),
});

function turn(state: ServiceAiConversationState, vaultLogoChoice?: string) {
  return resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: STEP_PROMPT,
    messages: [],
    state,
    nowIso: () => "2026-11-11T00:00:00.000Z",
    logoDiscovery: discovery(vaultLogoChoice),
  });
}

describe("logo question is asked once per pick", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("a tapped logo resolves the step even when the step prompt says 'use'", () => {
    const base: ServiceAiConversationState = {
      service: "email-design",
      subtype: "emailers",
      brandId: "brand1",
      productPath: "email-design/emailers",
    };
    const first = turn(base);
    expect(first.clarification?.kind).toBe("logo_selection");

    const second = turn(
      { ...base, taskIntelligence: first.updatedTaskState },
      LOGO_B,
    );
    expect(second.clarification).toBeUndefined();
    expect(second.executionSpec?.referenceAssets?.logo?.value).toMatchObject({
      mode: "USE_EXISTING",
      assetId: LOGO_B,
    });
  });
});
