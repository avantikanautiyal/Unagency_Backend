/**
 * Phase 13B — Application acceptance harness helpers.
 *
 * Advances real CDF sessions through deterministic config gates to the first
 * LLM phase, then exercises Context Orchestrator / conversational turns.
 * ControllableDispatcher only — no vendor APIs.
 */

import { applyCdfTransition } from "../../cdf/transition-service";
import { resolveCdfServiceConfig } from "../../cdf/service-configs";
import type { CdfSessionState } from "../../cdf/types";
import { detectCanonicalSectionsFromModelRequest } from "../../cdf/generation-context";
import { resolveCdfCanonicalService } from "../../cdf/canonical";
import { orchestrateCanonicalGenerationContext } from "../context-orchestrator";
import { prepareCanonicalModelRuntime } from "../model-runtime";
import {
  inspectConversationalGenerationContext,
  type ConversationalContextInspection,
} from "./inspect";
import { runConversationalGenerationTurn } from "./harness";
import {
  classifyCmrSections,
  inventoryCdfApplicationServices,
  isLlmGenerationModality,
  type CmrSectionVerdict,
} from "./acceptance-matrix";

export type AdvancedSession = {
  readonly session: CdfSessionState;
  readonly serviceId: string;
  readonly phaseId: string;
  readonly isLlmPhase: boolean;
  readonly steps: readonly string[];
};

function briefForService(serviceId: string): string {
  const briefs: Record<string, string> = {
    presentation: "Create a presentation about AI adoption for executives.",
    packaging: "Premium mango drink pack for modern Indian grocery.",
    "social-media": "Launch Instagram creative for summer sale.",
    emailers: "Welcome email series for SaaS trial users.",
    "web-tech": "Marketing site sitemap for a fintech startup.",
    "brand-strategy": "Brand platform for a sustainable apparel line.",
    "ad-campaigns": "Campaign strategy for a new EV launch.",
    logo: "Wordmark logo system for a climate tech brand.",
    "print-ooh": "OOH campaign for metro transit panels.",
    videos: "30-second product explainer video script.",
    "store-display": "POS display for premium chocolate.",
    merchandise: "Merchandise artwork for conference tote bags.",
    illustration: "Editorial illustration for annual report cover.",
    production: "Adapt master photography for channel outputs.",
    "event-branding": "Event identity for a design summit.",
  };
  return briefs[serviceId] ?? `CDF acceptance brief for ${serviceId}.`;
}

/**
 * Start + brief, then select_route through deterministic config/routes gates
 * until the first LLM generation phase (or stop if blocked).
 */
export function advanceToFirstLlmPhase(input: {
  readonly serviceId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly maxSteps?: number;
}): AdvancedSession {
  const steps: string[] = [];
  const started = applyCdfTransition({
    action: "start",
    serviceId: input.serviceId,
    productMode: "ai",
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!started.ok) {
    throw new Error(`start ${input.serviceId}: ${started.error.message}`);
  }
  steps.push("start");

  let session = started.value.session;
  const briefed = applyCdfTransition({
    action: "submit_brief",
    sessionId: session.sessionId,
    brief: briefForService(input.serviceId),
    expectedVersion: session.sessionVersion,
  });
  if (!briefed.ok) {
    throw new Error(`brief ${input.serviceId}: ${briefed.error.message}`);
  }
  session = briefed.value.session;
  steps.push("submit_brief");

  const canonical = resolveCdfCanonicalService(input.serviceId);
  const cfg = resolveCdfServiceConfig(input.serviceId);
  const maxSteps = input.maxSteps ?? 8;

  for (let i = 0; i < maxSteps; i++) {
    const phaseId = session.phaseId;
    if (!phaseId) break;
    const phaseDef = canonical?.phases.find((p) => p.phaseId === phaseId);
    if (
      phaseDef &&
      isLlmGenerationModality(String(phaseDef.generationModality))
    ) {
      return {
        session,
        serviceId: input.serviceId,
        phaseId,
        isLlmPhase: true,
        steps,
      };
    }

    const phaseRoutes = cfg?.phases.find((p) => p.id === phaseId)?.routes ?? [];
    let routeIndex = 0;
    if (input.serviceId === "presentation" && phaseId === "source") {
      const scratch = phaseRoutes.findIndex((r) =>
        /start from scratch/i.test(r.title ?? r.label ?? ""),
      );
      if (scratch >= 0) routeIndex = scratch;
    }

    const selected = applyCdfTransition({
      action: "select_route",
      sessionId: session.sessionId,
      routeIndex,
      routeTitle: phaseRoutes[routeIndex]?.title ?? `Route ${routeIndex + 1}`,
      ...(phaseDef?.staticRoutes?.[routeIndex]?.input
        ? { routeInput: "Acceptance harness input" }
        : {}),
      expectedVersion: session.sessionVersion,
    });
    if (!selected.ok) {
      return {
        session,
        serviceId: input.serviceId,
        phaseId,
        isLlmPhase: false,
        steps: [...steps, `select_route_failed:${selected.error.message}`],
      };
    }
    session = selected.value.session;
    steps.push(`select_route:${phaseId}->${session.phaseId}`);
  }

  const finalPhase = session.phaseId ?? "unknown";
  const phaseDef = canonical?.phases.find((p) => p.phaseId === finalPhase);
  return {
    session,
    serviceId: input.serviceId,
    phaseId: finalPhase,
    isLlmPhase: Boolean(
      phaseDef && isLlmGenerationModality(String(phaseDef.generationModality)),
    ),
    steps,
  };
}

export type FirstGenerationProbeResult = {
  readonly serviceId: string;
  readonly phaseId: string;
  readonly advanced: AdvancedSession;
  readonly orchestrationOk: boolean;
  readonly skipped: boolean;
  readonly instruction: string;
  readonly sections: Record<string, boolean>;
  readonly sectionVerdicts: readonly CmrSectionVerdict[];
  readonly inspection: ConversationalContextInspection;
  readonly providerInvoked: boolean;
  readonly upstreamVersions: readonly string[];
  readonly failureCode?: string;
};

/** First LLM generation probe for a service (flag ON expected by caller). */
export async function probeFirstGeneration(input: {
  readonly serviceId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly conversationId: string;
  readonly instruction?: string;
  readonly runProvider?: boolean;
}): Promise<FirstGenerationProbeResult> {
  const advanced = advanceToFirstLlmPhase(input);
  const instruction =
    input.instruction ??
    `Generate ${advanced.phaseId} for ${input.serviceId} acceptance.`;

  if (!advanced.isLlmPhase) {
    const orch = orchestrateCanonicalGenerationContext({
      prompt: "LEGACY",
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: advanced.session.sessionId,
        cdfPhaseId: advanced.phaseId,
        cdfServiceId: input.serviceId,
        conversationId: input.conversationId,
      },
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    const inspection = inspectConversationalGenerationContext({
      orchestration: orch,
    });
    return {
      serviceId: input.serviceId,
      phaseId: advanced.phaseId,
      advanced,
      orchestrationOk: false,
      skipped: Boolean(orch.ok && orch.skipped),
      instruction,
      sections: {},
      sectionVerdicts: [],
      inspection,
      providerInvoked: false,
      upstreamVersions: [],
      failureCode: orch.ok
        ? orch.skipped
          ? "NOT_ON_LLM_PHASE"
          : undefined
        : orch.code,
    };
  }

  if (input.runProvider === false) {
    const orch = orchestrateCanonicalGenerationContext({
      prompt: `Generate ${advanced.phaseId}`,
      conversationalInstruction: instruction,
      metadata: {
        cdfSessionId: advanced.session.sessionId,
        cdfPhaseId: advanced.phaseId,
        cdfServiceId: input.serviceId,
        conversationId: input.conversationId,
      },
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    const inspection = inspectConversationalGenerationContext({
      orchestration: orch,
    });
    const sections =
      orch.ok && !orch.skipped
        ? detectCanonicalSectionsFromModelRequest(orch.modelRequest)
        : {};
    return {
      serviceId: input.serviceId,
      phaseId: advanced.phaseId,
      advanced,
      orchestrationOk: Boolean(orch.ok && !orch.skipped),
      skipped: Boolean(orch.ok && orch.skipped),
      instruction,
      sections: sections as Record<string, boolean>,
      sectionVerdicts: classifyCmrSections({
        sections: sections as Record<string, boolean>,
        expectUpstream: false,
      }),
      inspection,
      providerInvoked: false,
      upstreamVersions:
        orch.ok && !orch.skipped
          ? orch.request.upstreamArtifacts.map(
              (u) => `${u.artifactId}@${u.version}`,
            )
          : [],
      failureCode: orch.ok ? undefined : orch.code,
    };
  }

  const turn = await runConversationalGenerationTurn({
    currentUserInstruction: instruction,
    prompt: `Generate ${advanced.phaseId}`,
    metadata: {
      cdfSessionId: advanced.session.sessionId,
      cdfPhaseId: advanced.phaseId,
      cdfServiceId: input.serviceId,
      conversationId: input.conversationId,
      apiExecutionId: `exec_p13b_${input.serviceId}_${advanced.phaseId}`,
    },
    organizationId: input.organizationId,
    projectId: input.projectId,
    skipProviderOnApplyFailure: true,
  });
  const sections =
    turn.apply.ok && !turn.apply.skipped
      ? detectCanonicalSectionsFromModelRequest(turn.apply.modelRequest)
      : {};
  const upstream =
    turn.apply.ok && !turn.apply.skipped
      ? turn.apply.request.upstreamArtifacts.map(
          (u) => `${u.artifactId}@${u.version}`,
        )
      : [];
  return {
    serviceId: input.serviceId,
    phaseId: advanced.phaseId,
    advanced,
    orchestrationOk: turn.orchestrationOk,
    skipped: Boolean(turn.apply.ok && turn.apply.skipped),
    instruction,
    sections: sections as Record<string, boolean>,
    sectionVerdicts: classifyCmrSections({
      sections: sections as Record<string, boolean>,
      expectUpstream: false,
      expectRequirements: true,
    }),
    inspection: turn.inspection,
    providerInvoked: turn.providerInvoked,
    upstreamVersions: upstream,
    failureCode: turn.apply.ok
      ? undefined
      : (turn.apply as { code?: string }).code,
  };
}

/** Assert provider representation derives from CMR without logging full prompts. */
export function assertProviderBoundaryFromCmr(input: {
  readonly modelRequest: Parameters<
    typeof prepareCanonicalModelRuntime
  >[0]["modelRequest"];
  readonly metadata: Record<string, unknown>;
  readonly instruction: string;
  readonly upstreamArtifactId?: string;
}): void {
  const prepared = prepareCanonicalModelRuntime({
    modelRequest: input.modelRequest,
    metadata: input.metadata,
    providerId: "provider.openai",
    modelId: "gpt-4o",
  });
  if (!prepared.ok) throw new Error(prepared.message);
  if (!prepared.prompt.includes(input.instruction)) {
    throw new Error("provider representation missing current instruction");
  }
  if (
    input.upstreamArtifactId &&
    !prepared.prompt.includes(input.upstreamArtifactId)
  ) {
    throw new Error("provider representation missing upstream artifactId");
  }
}

export function listInventoryForTests() {
  return inventoryCdfApplicationServices();
}
