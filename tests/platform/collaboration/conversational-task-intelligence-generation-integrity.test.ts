/**
 * P4.9.7 — Generation integrity: authoritative logo + requested format fidelity.
 * Deterministic tests only — no paid provider calls.
 */

import {
  resolveConversationalTurn,
  resolveExecutionSpecification,
  resolveAuthoritativeLogo,
  resolveLogoFollowUpFromMessage,
  enrichExecutionSpecWithAuthoritativeLogo,
  stampAuthoritativeLogoMetadata,
  evaluateDeliverableCompliance,
  stampExecutionSpecMetadata,
  readExecutionSpecSnapshot,
  inferPresentDeliverableFormats,
  inferPresentDeliverableFormatsFromExecution,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { extractSemanticSignals } from "../../../src/platform/collaboration/conversational-task-intelligence/semantic-signals";
import {
  buildContinuationCreateRequest,
  pickRetryableCreateMetadata,
} from "../../../src/platform/api/services/execution-retry-handoff";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import type { ExecutionResource } from "../../../src/platform/api/contracts";

const VAULT_LOGO_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const VAULT_LOGO_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ATTACHED_LOGO = "cccccccccccccccccccccccc";

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

function parentExecution(): ExecutionResource {
  return {
    executionId: "exec_parent",
    organizationId: "org1",
    brandId: "brand1",
    channelId: "service_abc",
    conversationId: "conv1",
    status: "failed",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

describe("P4.9.7 generation integrity — authoritative logo", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("1. one Vault logo → USE_EXISTING + exact asset ID", () => {
    const resolution = resolveAuthoritativeLogo({
      vaultCandidates: [
        { assetId: VAULT_LOGO_A, source: "VAULT", name: "Primary Logo" },
      ],
    });
    expect(resolution.mode).toBe("USE_EXISTING");
    expect(resolution.assetId).toBe(VAULT_LOGO_A);
    expect(resolution.authoritative).toBe(true);
  });

  it("2. one attached logo → USE_EXISTING + attachment asset ID", () => {
    const resolution = resolveAuthoritativeLogo({
      attachmentLogoAssetIds: [ATTACHED_LOGO],
    });
    expect(resolution.mode).toBe("USE_EXISTING");
    expect(resolution.assetId).toBe(ATTACHED_LOGO);
    expect(resolution.source).toBe("ATTACHMENT");
  });

  it("3. same logo in Vault and attachment → deduplicated to one candidate", () => {
    const resolution = resolveAuthoritativeLogo({
      vaultCandidates: [{ assetId: VAULT_LOGO_A, source: "VAULT", name: "Logo" }],
      attachmentLogoAssetIds: [VAULT_LOGO_A],
    });
    expect(resolution.mode).toBe("USE_EXISTING");
    expect(resolution.assetId).toBe(VAULT_LOGO_A);
    expect(resolution.candidates).toBeUndefined();
  });

  it("4. two different Vault logos → NEEDS_SELECTION / clarification", () => {
    const turn = resolveTurn("Create a merchandise mockup using our brand logo.", {
      logoDiscovery: {
        vaultCandidates: [
          { assetId: VAULT_LOGO_A, source: "VAULT", name: "Logo A", folder: "logos" },
          { assetId: VAULT_LOGO_B, source: "VAULT", name: "Logo B", folder: "logos" },
        ],
      },
    });
    expect(turn.executionSpec?.referenceAssets?.logo?.value.mode).toBe("NEEDS_SELECTION");
    expect(turn.requiresExecution).toBe(false);
    expect(turn.clarification?.kind).toBe("logo_selection");
    expect(turn.clarification?.question).toMatch(/I found multiple logos.*Which one should I use/i);
    expect(turn.clarification?.logoCandidates?.length).toBe(2);
  });

  it("5. Vault logo + different attached logo → clarification", () => {
    const turn = resolveTurn("Design packaging with our logo.", {
      logoDiscovery: {
        vaultCandidates: [{ assetId: VAULT_LOGO_A, source: "VAULT", name: "Vault Logo" }],
        attachmentLogoAssetIds: [ATTACHED_LOGO],
      },
    });
    expect(turn.executionSpec?.referenceAssets?.logo?.value.mode).toBe("NEEDS_SELECTION");
    expect(turn.requiresExecution).toBe(false);
  });

  it("6. multiple attached logos → clarification", () => {
    const turn = resolveTurn("Use our logo on this design.", {
      logoDiscovery: {
        attachmentLogoAssetIds: [ATTACHED_LOGO, "dddddddddddddddddddddddd"],
      },
    });
    expect(turn.executionSpec?.referenceAssets?.logo?.value.mode).toBe("NEEDS_SELECTION");
    expect(turn.requiresExecution).toBe(false);
  });

  it("7. no logo → GENERATE_IF_ABSENT", () => {
    const resolution = resolveAuthoritativeLogo({});
    expect(resolution.mode).toBe("GENERATE_IF_ABSENT");
    expect(resolution.authoritative).toBe(false);

    const turn = resolveTurn("Create a new logo for our startup.");
    expect(turn.executionSpec?.referenceAssets?.logo?.value.mode).toBe(
      "GENERATE_IF_ABSENT",
    );
    expect(turn.requiresExecution).toBe(true);
  });

  it("8. authoritative logo without attachment → compliance detects missing asset", () => {
    const spec = enrichExecutionSpecWithAuthoritativeLogo(
      resolveExecutionSpecification({
        message: "Use our logo",
        signals: extractSemanticSignals("Use our logo"),
        action: "CREATE",
        requirements: [],
        service: "branding",
        subtype: "logo-design",
      }),
      {
        mode: "USE_EXISTING",
        assetId: VAULT_LOGO_A,
        source: "VAULT",
        authoritative: true,
      },
    );
    const report = evaluateDeliverableCompliance({
      spec,
      attachedBrandAssetIds: [],
    });
    expect(
      report.results.find((r) => r.checkId === "authoritative_logo.attached")?.status,
    ).toBe("FAIL");
  });

  it("9. selected logo survives job serialization", () => {
    const metadata = stampAuthoritativeLogoMetadata(
      { service: "branding", subtype: "logo-design" },
      {
        mode: "USE_EXISTING",
        assetId: VAULT_LOGO_A,
        source: "VAULT",
        authoritative: true,
      },
    );
    expect(metadata.brandLogoAssetId).toBe(VAULT_LOGO_A);
    expect(metadata.assetIds).toContain(VAULT_LOGO_A);
    expect(metadata.authoritativeLogo).toMatchObject({
      mode: "USE_EXISTING",
      assetId: VAULT_LOGO_A,
    });
  });

  it("10. selected logo survives retry", () => {
    const metadata = stampAuthoritativeLogoMetadata(
      {
        service: "branding",
        subtype: "logo-design",
        brandLogoAssetId: VAULT_LOGO_A,
        assetIds: [VAULT_LOGO_A],
        vaultLogoChoice: VAULT_LOGO_A,
      },
      {
        mode: "USE_EXISTING",
        assetId: VAULT_LOGO_A,
        source: "VAULT",
        authoritative: true,
      },
    );
    const inherited = pickRetryableCreateMetadata(metadata);
    expect(inherited.brandLogoAssetId).toBe(VAULT_LOGO_A);
    expect(inherited.assetIds).toContain(VAULT_LOGO_A);
    expect(inherited.vaultLogoChoice).toBe(VAULT_LOGO_A);

    const continuation = buildContinuationCreateRequest({
      parentExecution: parentExecution(),
      parentCreateMetadata: metadata,
      organizationId: "org1",
      reason: "retry",
    });
    expect(continuation.metadata?.brandLogoAssetId).toBe(VAULT_LOGO_A);
  });

  it("11. selected logo survives metadata round-trip via execution spec snapshot", () => {
    const turn = resolveTurn("Create a logo mockup using our brand logo.", {
      logoDiscovery: {
        vaultCandidates: [{ assetId: VAULT_LOGO_A, source: "VAULT", name: "Logo" }],
      },
    });
    const metadata = stampExecutionSpecMetadata(
      {
        brandLogoAssetId: VAULT_LOGO_A,
        assetIds: [VAULT_LOGO_A],
      },
      {
        executionId: "exec1",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T00:00:00.000Z",
        createId: (p) => `${p}_test`,
      },
    );
    const snapshot = readExecutionSpecSnapshot(metadata);
    expect(snapshot?.spec.referenceAssets?.logo?.value.assetId).toBe(VAULT_LOGO_A);
  });

  it("12. compliance PASS when authoritative logo attached", () => {
    const spec = enrichExecutionSpecWithAuthoritativeLogo(
      resolveExecutionSpecification({
        message: "Use vault logo",
        signals: extractSemanticSignals("Use vault logo"),
        action: "CREATE",
        requirements: [],
        service: "branding",
        subtype: "logo-design",
      }),
      {
        mode: "USE_EXISTING",
        assetId: VAULT_LOGO_A,
        source: "VAULT",
        authoritative: true,
      },
    );
    const report = evaluateDeliverableCompliance({
      spec,
      attachedBrandAssetIds: [VAULT_LOGO_A],
    });
    expect(
      report.results.find((r) => r.checkId === "authoritative_logo.attached")?.status,
    ).toBe("PASS");
  });
});

describe("P4.9.7 generation integrity — requested format fidelity", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("13. prompt explicitly requests PDF", () => {
    const turn = resolveTurn(
      "Create one final brand name. Output: PDF.",
      { state: brandingState({ subtype: "brand-naming-taglines" }) },
    );
    expect(turn.executionSpec?.deliverables.some((d) => d.format === "PDF")).toBe(true);
    expect(
      turn.executionSpec?.deliverables.find((d) => d.format === "PDF")?.provenance.explicit,
    ).toBe(true);
  });

  it("14. prompt explicitly requests PPTX", () => {
    const turn = resolveTurn("Create a presentation deck. Give me PPTX.", {
      state: brandingState({ service: "print", subtype: "presentations" }),
    });
    expect(turn.executionSpec?.deliverables.some((d) => d.format === "PPTX")).toBe(true);
  });

  it("15. prompt explicitly requests PDF + PPTX", () => {
    const turn = resolveTurn("Create a pitch deck. Output: PDF and PPTX.", {
      state: brandingState({ service: "print", subtype: "presentations" }),
    });
    const formats = turn.executionSpec?.deliverables.map((d) => d.format) ?? [];
    expect(formats).toContain("PDF");
    expect(formats).toContain("PPTX");
  });

  it("16. prompt requests PNG + PDF", () => {
    const turn = resolveTurn("Export as PNG + PDF.", {
      state: brandingState({ service: "social", subtype: "posts" }),
    });
    const formats = turn.executionSpec?.deliverables.map((d) => d.format) ?? [];
    expect(formats).toContain("PNG");
    expect(formats).toContain("PDF");
  });

  it("17. explicit requested format wins over service defaults", () => {
    const turn = resolveTurn("Create taglines. Output: PDF only.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const explicit = turn.executionSpec?.deliverables.filter((d) => d.provenance.explicit) ?? [];
    expect(explicit.some((d) => d.format === "PDF")).toBe(true);
    expect(explicit.some((d) => d.format === "EDITABLE_TEXT")).toBe(false);
  });

  it("18. unsupported requested format → UNSUPPORTED_DELIVERABLE", () => {
    const turn = resolveTurn("Create a social post. Output: MP4.", {
      state: brandingState({ service: "social", subtype: "posts" }),
    });
    expect(turn.executionSpec?.resolutionState).toBe("UNSUPPORTED_DELIVERABLE");
    expect(turn.executionSpec?.unsupportedDeliverables).toContain("MP4");
    expect(turn.requiresExecution).toBe(false);
  });

  it("19. requested format survives job serialization", () => {
    const turn = resolveTurn("Create taglines. Output: PDF.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const metadata = stampExecutionSpecMetadata(
      { service: "branding", subtype: "brand-naming-taglines" },
      {
        executionId: "exec_fmt",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T00:00:00.000Z",
        createId: (p) => `${p}_test`,
      },
    );
    expect(metadata.executionSpecDeliverables).toContain("PDF");
  });

  it("20. requested format survives retry", () => {
    const turn = resolveTurn("Create taglines. Output: PDF and PPTX.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const metadata = stampExecutionSpecMetadata(
      { service: "branding", subtype: "brand-naming-taglines" },
      {
        executionId: "exec_fmt2",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T00:00:00.000Z",
        createId: (p) => `${p}_test`,
      },
    );
    const inherited = pickRetryableCreateMetadata(metadata);
    expect(inherited.executionSpecDeliverables).toEqual(
      expect.arrayContaining(["PDF", "PPTX"]),
    );
  });

  it("21. compliance detects missing requested artifact", () => {
    const turn = resolveTurn("Create taglines. Output: PDF.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const report = evaluateDeliverableCompliance({
      spec: turn.executionSpec,
      presentFormats: [],
    });
    expect(report.overallStatus).toBe("DELIVERABLE_COMPLIANCE_FAILURE");
    expect(report.results.some((r) => r.checkId === "deliverable.PDF" && r.status === "FAIL")).toBe(
      true,
    );
  });

  it("22. actual artifact format mismatch is rejected", () => {
    const turn = resolveTurn("Create taglines. Output: PDF.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const report = evaluateDeliverableCompliance({
      spec: turn.executionSpec,
      presentFormats: ["PPTX"],
    });
    expect(report.results.find((r) => r.checkId === "deliverable.PDF")?.status).toBe("FAIL");
  });
});

describe("P4.9.7 generation integrity — conversational follow-ups", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("23. 'Use the second logo' resolves pending logo ambiguity", () => {
    const prior = resolveAuthoritativeLogo({
      vaultCandidates: [
        { assetId: VAULT_LOGO_A, source: "VAULT", name: "Logo A" },
        { assetId: VAULT_LOGO_B, source: "VAULT", name: "Logo B" },
      ],
    });
    const followUp = resolveLogoFollowUpFromMessage({
      message: "Use the second logo.",
      prior,
    });
    expect(followUp?.mode).toBe("USE_EXISTING");
    expect(followUp?.assetId).toBe(VAULT_LOGO_B);
  });

  it("24. 'Use the attached logo' resolves attachment", () => {
    const prior = resolveAuthoritativeLogo({
      vaultCandidates: [{ assetId: VAULT_LOGO_A, source: "VAULT", name: "Vault" }],
      attachmentLogoAssetIds: [ATTACHED_LOGO],
    });
    const followUp = resolveLogoFollowUpFromMessage({
      message: "Use the logo I attached.",
      prior: { ...prior, mode: "NEEDS_SELECTION", candidates: prior.candidates },
    });
    expect(followUp?.assetId).toBe(ATTACHED_LOGO);
    expect(followUp?.source).toBe("ATTACHMENT");
  });

  it("25. 'Actually use PDF and PPTX' modifies existing task requirements", () => {
    const first = resolveTurn("Create a pitch deck.", {
      state: brandingState({ service: "print", subtype: "presentations" }),
    });
    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Actually use PDF and PPTX.",
      messages: [],
      state: {
        ...brandingState({ service: "print", subtype: "presentations" }),
        taskIntelligence: first.updatedTaskState,
      },
      nowIso: () => "2026-09-03T00:00:01.000Z",
    });
    const formats = second.executionSpec?.deliverables.map((d) => d.format) ?? [];
    expect(formats).toContain("PDF");
    expect(formats).toContain("PPTX");
  });

  it("26. 'Actually just PDF' replaces previous format requirement", () => {
    const first = resolveTurn("Create taglines. Output: PDF and PPTX.", {
      state: brandingState({ subtype: "brand-naming-taglines" }),
    });
    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Actually just PDF.",
      messages: [],
      state: {
        ...brandingState({ subtype: "brand-naming-taglines" }),
        taskIntelligence: first.updatedTaskState,
      },
      nowIso: () => "2026-09-03T00:00:01.000Z",
    });
    const explicit =
      second.executionSpec?.deliverables.filter((d) => d.provenance.explicit) ?? [];
    expect(explicit.some((d) => d.format === "PDF")).toBe(true);
  });

  it("27. 'Generate a new logo' overrides existing-logo requirement", () => {
    const first = resolveTurn("Use our existing logo on this mockup.", {
      logoDiscovery: {
        vaultCandidates: [{ assetId: VAULT_LOGO_A, source: "VAULT", name: "Logo" }],
      },
    });
    expect(first.executionSpec?.referenceAssets?.logo?.value.mode).toBe("USE_EXISTING");

    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Generate a new logo instead.",
      messages: [],
      state: {
        ...brandingState(),
        taskIntelligence: first.updatedTaskState,
      },
      nowIso: () => "2026-09-03T00:00:01.000Z",
    });
    expect(second.executionSpec?.referenceAssets?.logo?.value.mode).toBe(
      "GENERATE_IF_ABSENT",
    );
  });
});

describe("P4.9.7 generation integrity — present format inference", () => {
  it("infers formats from download labels and preview text", () => {
    expect(
      inferPresentDeliverableFormats({
        downloadFormatLabels: ["pdf", "pptx"],
        hasPreviewText: true,
      }),
    ).toEqual(expect.arrayContaining(["PDF", "PPTX", "EDITABLE_TEXT"]));
  });

  it("infers from structured execution output", () => {
    expect(
      inferPresentDeliverableFormatsFromExecution({
        structuredData: { downloadFormats: ["pdf"] },
        previewText: "TerraLoop tagline",
      }),
    ).toEqual(expect.arrayContaining(["PDF", "EDITABLE_TEXT"]));
  });
});

describe("P4.9.7 generation integrity — routing guard", () => {
  it("adaptive routing remains OFF", () => {
    const config = loadAdaptiveRoutingConfig();
    expect(config.adaptiveRoutingEnabled).toBe(false);
  });
});
