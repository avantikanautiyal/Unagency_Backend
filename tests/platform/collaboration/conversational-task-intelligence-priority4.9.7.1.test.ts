/**
 * P4.9.7.1 — Logo clarification must expose actual authoritative logo candidates.
 * Deterministic tests only — no paid provider calls.
 */

import {
  resolveConversationalTurn,
  stampAuthoritativeLogoMetadata,
  stampExecutionSpecMetadata,
  readExecutionSpecSnapshot,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";

const VAULT_LOGO_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const VAULT_LOGO_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ATTACHED_LOGO = "cccccccccccccccccccccccc";
const ATTACHED_LOGO_2 = "dddddddddddddddddddddddd";

const ORIGINAL_PROMPT = "Create a merchandise mockup using our brand logo.";

function brandingState(
  overrides: Partial<ServiceAiConversationState> = {},
): ServiceAiConversationState {
  return {
    service: "branding",
    subtype: "logo-design",
    brandId: "brand1",
    productPath: "branding/logo-design",
    ...overrides,
  };
}

function userMsg(
  text: string,
  overrides: Partial<ServiceAiMessageRecord> = {},
): ServiceAiMessageRecord {
  const dedupeKey = overrides.dedupeKey ?? `user-${text}`;
  return {
    id: overrides.id ?? `u-${dedupeKey}`,
    role: "user",
    text,
    createdAt: overrides.createdAt ?? "2026-09-03T00:00:00.000Z",
    dedupeKey,
    ...overrides,
  };
}

function assistantRoutes(executionId: string): ServiceAiMessageRecord {
  return {
    id: `ai-${executionId}`,
    role: "assistant",
    text: "Here are your routes",
    createdAt: "2026-09-03T00:01:00.000Z",
    dedupeKey: `routes-${executionId}`,
    executionId,
    routes: [{ id: "route_1", title: "Option 1" }],
  };
}

function resolveTurn(
  latestUserMessage: string,
  input: {
    messages?: ServiceAiMessageRecord[];
    state?: ServiceAiConversationState;
    logoDiscovery?: {
      vaultCandidates?: Array<{
        assetId: string;
        source: "VAULT" | "ATTACHMENT";
        name?: string;
        folder?: string;
      }>;
      attachmentLogoAssetIds?: string[];
      vaultLogoChoice?: string;
    };
  } = {},
) {
  return resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage,
    messages: input.messages ?? [],
    state: input.state ?? brandingState(),
    nowIso: () => "2026-09-03T00:00:00.000Z",
    logoDiscovery: input.logoDiscovery,
  });
}

function multiLogoDiscovery() {
  return {
    vaultCandidates: [
      { assetId: VAULT_LOGO_A, source: "VAULT" as const, name: "Primary Logo", folder: "logos" },
      { assetId: VAULT_LOGO_B, source: "VAULT" as const, name: "White Logo", folder: "logos" },
    ],
  };
}

describe("P4.9.7.1 — logo clarification presentation + selection", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("1. multiple Vault logos → clarification contains all actual candidates", () => {
    const turn = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    expect(turn.clarification?.kind).toBe("logo_selection");
    expect(turn.clarification?.question).toMatch(
      /I found multiple logos.*Which one should I use/i,
    );
    expect(turn.clarification?.logoCandidates).toEqual([
      expect.objectContaining({
        selectionId: `vault_logo:${VAULT_LOGO_A}`,
        assetId: VAULT_LOGO_A,
        source: "VAULT",
        name: "Primary Logo",
        folder: "logos",
      }),
      expect.objectContaining({
        selectionId: `vault_logo:${VAULT_LOGO_B}`,
        assetId: VAULT_LOGO_B,
        source: "VAULT",
        name: "White Logo",
        folder: "logos",
      }),
    ]);
    expect(turn.clarification?.question).not.toMatch(/deliverable or version/i);
  });

  it("2. Vault + attachment with different logos → clarification contains both", () => {
    const turn = resolveTurn("Design packaging with our logo.", {
      logoDiscovery: {
        vaultCandidates: [
          { assetId: VAULT_LOGO_A, source: "VAULT", name: "Vault Logo", folder: "logos" },
        ],
        attachmentLogoAssetIds: [ATTACHED_LOGO],
      },
    });
    expect(turn.clarification?.kind).toBe("logo_selection");
    const assetIds = turn.clarification?.logoCandidates?.map((c) => c.assetId);
    expect(assetIds).toEqual(expect.arrayContaining([VAULT_LOGO_A, ATTACHED_LOGO]));
    expect(turn.clarification?.logoCandidates?.find((c) => c.assetId === ATTACHED_LOGO)?.source).toBe(
      "ATTACHMENT",
    );
  });

  it("3. multiple attachments → clarification contains all candidates", () => {
    const turn = resolveTurn("Use our logo on this design.", {
      logoDiscovery: {
        attachmentLogoAssetIds: [ATTACHED_LOGO, ATTACHED_LOGO_2],
      },
    });
    expect(turn.clarification?.kind).toBe("logo_selection");
    expect(turn.clarification?.logoCandidates?.map((c) => c.assetId)).toEqual([
      ATTACHED_LOGO,
      ATTACHED_LOGO_2,
    ]);
  });

  it("4. candidate metadata is preserved through the API execution context", () => {
    const turn = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [userMsg(ORIGINAL_PROMPT)],
      state: brandingState(),
      latestUserMessage: ORIGINAL_PROMPT,
      turn,
    });
    expect(ctx.clarificationRequired).toBe(true);
    expect(ctx.requiresExecution).toBe(false);
    expect(ctx.clarification?.kind).toBe("logo_selection");
    expect(ctx.clarification?.logoCandidates?.length).toBe(2);
    expect(ctx.clarification?.logoCandidates?.[0]?.assetId).toBe(VAULT_LOGO_A);
  });

  it("5. selecting candidate 2 → selected assetId = candidate 2 assetId", () => {
    const first = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const second = resolveTurn("Use the second one.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
      logoDiscovery: { vaultLogoChoice: VAULT_LOGO_B },
    });
    expect(second.executionSpec?.referenceAssets?.logo?.value.mode).toBe("USE_EXISTING");
    expect(second.executionSpec?.referenceAssets?.logo?.value.assetId).toBe(VAULT_LOGO_B);
    expect(second.requiresExecution).toBe(true);
    expect(second.clarification).toBeUndefined();
  });

  it("6. selecting candidate 2 → source/provenance preserved", () => {
    const first = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const second = resolveTurn("Use the second one.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
      logoDiscovery: { vaultLogoChoice: VAULT_LOGO_B },
    });
    expect(second.executionSpec?.referenceAssets?.logo?.value.source).toBe("VAULT");
    expect(second.executionSpec?.referenceAssets?.logo?.value.authoritative).toBe(true);
  });

  it('7. "Use the second one." → resolves candidate 2', () => {
    const first = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const second = resolveTurn("Use the second one.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
    });
    expect(second.executionSpec?.referenceAssets?.logo?.value.assetId).toBe(VAULT_LOGO_B);
  });

  it('8. "Use the attached logo." → resolves attachment when unambiguous', () => {
    const first = resolveTurn("Design packaging with our logo.", {
      logoDiscovery: {
        vaultCandidates: [
          { assetId: VAULT_LOGO_A, source: "VAULT", name: "Vault Logo" },
        ],
        attachmentLogoAssetIds: [ATTACHED_LOGO],
      },
    });
    const second = resolveTurn("Use the attached logo.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
    });
    expect(second.executionSpec?.referenceAssets?.logo?.value.assetId).toBe(ATTACHED_LOGO);
    expect(second.executionSpec?.referenceAssets?.logo?.value.source).toBe("ATTACHMENT");
  });

  it("9. ambiguous natural-language selection → asks again; never guesses", () => {
    const first = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const second = resolveTurn("Use the logo.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
    });
    expect(second.clarification?.kind).toBe("logo_selection");
    expect(second.requiresExecution).toBe(false);
    expect(second.executionSpec?.referenceAssets?.logo?.value.mode).toBe("NEEDS_SELECTION");
  });

  it("10. provider gate: requiresExecution false while clarification pending", () => {
    const turn = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    expect(turn.requiresExecution).toBe(false);
    expect(Boolean(turn.clarification)).toBe(true);
  });

  it("11. no job metadata while clarification pending (logoChoiceRequired stamped)", () => {
    const turn = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const metadata = stampAuthoritativeLogoMetadata(
      { service: "branding", subtype: "logo-design" },
      turn.executionSpec!.referenceAssets!.logo!.value,
    );
    expect(metadata.logoChoiceRequired).toBe(true);
    expect(Array.isArray(metadata.logoChoiceCandidates)).toBe(true);
    expect((metadata.logoChoiceCandidates as unknown[]).length).toBe(2);
    expect(metadata.assetIds).toBeUndefined();
  });

  it("12. pending logo candidates survive persistence/reload", () => {
    const turn = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const persisted = brandingState({ taskIntelligence: turn.updatedTaskState });
    const thread = persisted.taskIntelligence!.threads.find(
      (t) => t.threadId === turn.activeThreadId,
    );
    expect(thread?.pendingLogoClarification?.candidates?.length).toBe(2);
    expect(thread?.pendingLogoClarification?.resumePrompt).toBe(ORIGINAL_PROMPT);

    const reloaded = resolveTurn("hello", {
      state: persisted,
      logoDiscovery: multiLogoDiscovery(),
    });
    expect(reloaded.clarification?.kind).toBe("logo_selection");
    expect(reloaded.clarification?.logoCandidates?.length).toBe(2);
  });

  it("13. selected logo survives retry via execution spec snapshot", () => {
    const first = resolveTurn(ORIGINAL_PROMPT, { logoDiscovery: multiLogoDiscovery() });
    const selected = resolveTurn("Use the second one.", {
      state: brandingState({ taskIntelligence: first.updatedTaskState }),
      logoDiscovery: { vaultLogoChoice: VAULT_LOGO_B },
    });
    const metadata = stampExecutionSpecMetadata(
      { brandLogoAssetId: VAULT_LOGO_B, assetIds: [VAULT_LOGO_B] },
      {
        executionId: "exec1",
        spec: selected.executionSpec!,
        nowIso: () => "2026-09-03T00:00:00.000Z",
        createId: (p) => `${p}_test`,
      },
    );
    const snapshot = readExecutionSpecSnapshot(metadata);
    expect(snapshot?.spec.referenceAssets?.logo?.value.assetId).toBe(VAULT_LOGO_B);
    expect(snapshot?.spec.referenceAssets?.logo?.value.mode).toBe("USE_EXISTING");
  });

  it("14. generic clarification for non-logo ambiguous reference remains unchanged", () => {
    const turn = resolveTurn("Change it", {
      messages: [
        userMsg("Brief 1", { executionId: "exec_a" }),
        assistantRoutes("exec_a"),
        userMsg("Brief 2", { executionId: "exec_b" }),
        assistantRoutes("exec_b"),
      ],
      state: brandingState({ activeExecutionId: undefined, activeArtifactId: undefined }),
    });
    expect(turn.clarification?.kind).not.toBe("logo_selection");
    expect(turn.clarification?.question).toMatch(/deliverable or version/i);
    expect(turn.clarification?.logoCandidates).toBeUndefined();
  });

  it("15. substantive BloomSip brief prefers logo selection over generic deictic ASK", () => {
    const brief =
      "Brand: BloomSip. Create a vertical conversion ad with the chilled can in the center, peach and basil in motion around it. CTA: Shop Now.";
    const turn = resolveTurn(brief, {
      messages: [
        userMsg("Brief 1", { executionId: "exec_a" }),
        assistantRoutes("exec_a"),
        userMsg("Brief 2", { executionId: "exec_b" }),
        assistantRoutes("exec_b"),
      ],
      state: brandingState({ activeExecutionId: undefined, activeArtifactId: undefined }),
      logoDiscovery: {
        vaultCandidates: [
          { assetId: VAULT_LOGO_A, source: "VAULT", name: "Primary Logo" },
          { assetId: VAULT_LOGO_B, source: "VAULT", name: "White Logo" },
        ],
      },
    });
    expect(turn.clarification?.kind).toBe("logo_selection");
    expect(turn.clarification?.question).toMatch(/I found multiple logos/i);
    expect(turn.clarification?.question).not.toMatch(/deliverable or version/i);
    expect(turn.requiresExecution).toBe(false);
  });

  it("16. CONVERSATIONAL_RESPONSE + substantive brief still prefers logo selection", () => {
    const brief =
      "Brand: BloomSip. Deliverable: Meta Story conversion ad. Create a vertical conversion ad with peach and basil in motion around it. CTA: Shop Now.";
    const first = resolveTurn(brief, {
      messages: [
        userMsg("Brief 1", { executionId: "exec_a" }),
        assistantRoutes("exec_a"),
        userMsg("Brief 2", { executionId: "exec_b" }),
        assistantRoutes("exec_b"),
      ],
      state: brandingState({
        activeExecutionId: "exec_a",
        activeArtifactId: "art_a",
      }),
      logoDiscovery: {
        vaultCandidates: [
          { assetId: VAULT_LOGO_A, source: "VAULT", name: "Primary Logo" },
          { assetId: VAULT_LOGO_B, source: "VAULT", name: "White Logo" },
        ],
      },
    });
    expect(first.clarification?.kind).toBe("logo_selection");
    expect(first.clarification?.question).not.toMatch(/deliverable or version/i);
  });
});
