/**
 * Create-execution OS context assembly — Brief, prompt brand learning,
 * Brand+Knowledge (parallel), Execution plan. Mutates CreatePipelineState.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError, AuthorizationError } from "../../intelligence/shared/errors";
import {
  logOsExecutionEvent,
  briefToMetadata,
  composeBriefAwarePrompt,
  BriefIntelligenceError,
  brandContextToMetadata,
  composeBrandAwarePrompt,
  BrandIntelligenceError,
  knowledgeContextToMetadata,
  composeKnowledgeAwarePrompt,
  KnowledgeIntelligenceError,
  executionPlanToMetadata,
  ExecutionIntelligenceError,
  logBrandKnowledgeContextTable,
  type StructuredBrief,
  type BrandContext,
  type KnowledgeContext,
  type ExecutionPlan,
} from "../../os";
import {
  applyPromptSignalsToBrandContext,
  hasSignificantSignals,
  learnFromPrompt,
  type PromptSignals,
} from "../../business/brand-brain/learning/prompt-signal-learner";
import type { ExecutionCreateHost } from "./execution-create-host";
import {
  type CreatePipelineState,
  type PhaseOutcome,
} from "./execution-create-state";
import {
  applyThinOsPathMetadata,
  shouldEnableExecutionPlan,
} from "./execution-thin-path";

export async function runOsContextAssembly(
  host: ExecutionCreateHost,
  state: CreatePipelineState
): Promise<Result<PhaseOutcome<CreatePipelineState>>> {
  let req = state.req;
  const principal = state.principal;
  let capabilityIdRaw = state.capabilityIdRaw;
  const trustedOrganizationId = state.trustedOrganizationId;
  let workingMetadata = applyThinOsPathMetadata(state.workingMetadata);
  let providerPrompt = state.providerPrompt;
  const executionId = state.executionId;
  const correlationId = state.correlationId;

  // Persist thin-path flags onto the request early so dispatch/integration see them.
  req = { ...req, metadata: workingMetadata };

  // Phase 1 — Brief Intelligence (canonical OS ingress before Integration / async).
  let structuredBrief: StructuredBrief | undefined;
  // Only skipBriefIntelligence opts out of Brief. skipBrandKnowledge is brand/RAG only.
  const skipBrief = workingMetadata?.skipBriefIntelligence === true;
  if (skipBrief) {
    logOsExecutionEvent("brief.skipped", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: "skipped",
    });
  } else {
    try {
      const cached = host.briefByExecutionId.get(executionId);
      structuredBrief =
        cached ??
        host.briefIntelligence.createBrief({
          tenant: {
            organizationId: trustedOrganizationId,
            userId: principal.userId,
            requestId: correlationId,
            executionId,
            workspaceId: req.workspaceId,
            correlationId,
          },
          rawPrompt: req.prompt,
          clientCapabilityId: req.capabilityId,
          metadata: workingMetadata,
          availableContext: {
            brandId:
              typeof workingMetadata?.brandId === "string"
                ? workingMetadata.brandId
                : undefined,
            styleInstructions:
              typeof workingMetadata?.styleInstructions === "string"
                ? workingMetadata.styleInstructions
                : undefined,
            productService:
              typeof workingMetadata?.service === "string"
                ? workingMetadata.service
                : undefined,
            productCategory:
              typeof workingMetadata?.category === "string"
                ? workingMetadata.category
                : undefined,
            productPath:
              typeof workingMetadata?.productPath === "string"
                ? workingMetadata.productPath
                : undefined,
            deliverableLabel:
              typeof workingMetadata?.deliverableLabel === "string"
                ? workingMetadata.deliverableLabel
                : undefined,
            platform:
              typeof workingMetadata?.platform === "string"
                ? workingMetadata.platform
                : undefined,
            format:
              typeof workingMetadata?.format === "string"
                ? workingMetadata.format
                : undefined,
          },
          nowIso: host.deps.nowIso,
          createId: host.deps.createId,
        });
      host.briefByExecutionId.set(executionId, structuredBrief);

      logOsExecutionEvent("brief.generated", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        capabilityId: structuredBrief.requiredCapabilities[0]?.capabilityId,
        status: structuredBrief.status,
        lifecycle: "CONTEXT_ASSEMBLY",
      });

      if (
        structuredBrief.status === "INVALID" ||
        structuredBrief.status === "UNSUPPORTED"
      ) {
        logOsExecutionEvent("brief.rejected", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: structuredBrief.status,
        });
        return failure(
          new ValidationError(
            `BRIEF_${structuredBrief.status}: Brief Intelligence could not produce an executable brief`
          )
        );
      }

      const hasClientCapability = Boolean(req.capabilityId?.trim());
      const requiredMissing = structuredBrief.missingInformation.some(
        (m) => m.severity === "required"
      );
      if (
        structuredBrief.status === "NEEDS_INFORMATION" &&
        requiredMissing &&
        !hasClientCapability
      ) {
        logOsExecutionEvent("brief.needs_information", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: structuredBrief.status,
        });
        return failure(
          new ValidationError(
            `BRIEF_NEEDS_INFORMATION: ${structuredBrief.missingInformation
              .filter((m) => m.severity === "required")
              .map((m) => m.key)
              .join(", ")}`
          )
        );
      }

      const briefMeta = briefToMetadata(structuredBrief);
      workingMetadata = {
        ...(workingMetadata ?? {}),
        ...briefMeta,
        capabilityId:
          typeof briefMeta.briefPrimaryCapability === "string"
            ? briefMeta.briefPrimaryCapability
            : req.capabilityId,
      };
      providerPrompt = composeBriefAwarePrompt(
        req.prompt,
        structuredBrief,
        providerPrompt
      );
      workingMetadata = {
        ...workingMetadata,
        enrichedPrompt: providerPrompt,
        briefAware: true,
      };
      req = {
        ...req,
        metadata: workingMetadata,
        capabilityId:
          req.capabilityId?.trim() ||
          (typeof briefMeta.briefPrimaryCapability === "string"
            ? briefMeta.briefPrimaryCapability
            : req.capabilityId),
      };

      logOsExecutionEvent("brief.validated", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        capabilityId: req.capabilityId,
        status: structuredBrief.status,
      });
    } catch (err) {
      if (err instanceof BriefIntelligenceError) {
        logOsExecutionEvent("brief.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          errorCode: err.code,
          status: "failed",
        });
        return failure(new ValidationError(`${err.code}: ${err.message}`));
      }
      logOsExecutionEvent("brief.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: "BRIEF_GENERATION_FAILED",
        status: "failed",
      });
      return failure(
        new ValidationError(
          `BRIEF_GENERATION_FAILED: ${
            err instanceof Error ? err.message : "unknown"
          }`
        )
      );
    }
  }

  // Prompt brand learning — always before Brand Intelligence so Mongo SoT +
  // this run's Brand Context pick up colours / voice stated in the brief.
  // Thin path (enhance / route_visual): skip — those prompts are not brand briefs.
  let promptLearnedSignals: PromptSignals | undefined;
  const thinOsPath = workingMetadata?.thinOsPath === true;
  {
    const learnBrandId =
      typeof workingMetadata?.brandId === "string"
        ? workingMetadata.brandId
        : typeof req.metadata?.brandId === "string"
          ? req.metadata.brandId
          : undefined;
    if (
      !thinOsPath &&
      req.prompt?.trim() &&
      (host.brandBrainEngine || learnBrandId)
    ) {
      try {
        const learned = await learnFromPrompt(
          {
            organizationId: trustedOrganizationId,
            prompt: req.prompt,
            ...(learnBrandId ? { brandId: learnBrandId } : {}),
          },
          {
            ...(host.brandBrainEngine
              ? { brandBrainEngine: host.brandBrainEngine }
              : {}),
          },
        );
        if (hasSignificantSignals(learned.signals)) {
          promptLearnedSignals = learned.signals;
          workingMetadata = {
            ...(workingMetadata ?? {}),
            ...(learned.brandId && !workingMetadata?.brandId
              ? { brandId: learned.brandId }
              : {}),
            ...(learned.signals.colors.length
              ? { learnedBrandColors: learned.signals.colors.slice(0, 8) }
              : {}),
            ...(learned.signals.toneAdjectives.length ||
            learned.signals.voiceNotes.length
              ? {
                  learnedBrandTone: [
                    ...learned.signals.toneAdjectives,
                    ...learned.signals.voiceNotes,
                  ].slice(0, 6),
                }
              : {}),
            promptBrandLearning: {
              learned: learned.learned,
              productBrandUpdated: learned.productBrandUpdated,
            },
          };
        }
      } catch (err) {
        logOsExecutionEvent("brand.prompt_learning.failed", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "failed",
          errorCode: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // K1 — fire-and-forget prompt → knowledge facts (never blocks create).
    if (
      !thinOsPath &&
      req.prompt?.trim() &&
      workingMetadata?.skipBrandKnowledge !== true &&
      workingMetadata?.skipKnowledgeIntelligence !== true
    ) {
      try {
        const { schedulePromptFactLearning } = await import(
          "../../../services/knowledge-prompt-fact-learner"
        );
        schedulePromptFactLearning({
          organizationId: trustedOrganizationId,
          brandId: learnBrandId,
          executionId,
          prompt: req.prompt,
          productAction:
            typeof workingMetadata?.productAction === "string"
              ? workingMetadata.productAction
              : undefined,
          capabilityId: req.capabilityId,
        });
      } catch {
        // best-effort
      }
    }
  }

  // Phase 2+3 — Brand Intelligence + Knowledge Intelligence (parallel fetch, sequential apply).
  // Both DB reads fire concurrently; knowledge uses brand tone only as an optional hint so
  // we can safely start both at the same time and apply results in order afterward.
  let structuredBrandContext: BrandContext | undefined;
  let structuredKnowledgeContext: KnowledgeContext | undefined;

  const skipBrandIntelligence =
    workingMetadata?.skipBrandIntelligence === true ||
    workingMetadata?.skipBrandKnowledge === true;
  let skipKnowledge =
    workingMetadata?.skipKnowledgeIntelligence === true ||
    workingMetadata?.skipBrandKnowledge === true;

  // Performance: skip Knowledge Intelligence entirely when the org has no chunks.
  if (!skipKnowledge) {
    try {
      const { organizationHasKnowledgeChunks } = await import(
        "../../../services/knowledge-document-index-service"
      );
      const hasChunks = await organizationHasKnowledgeChunks(
        trustedOrganizationId
      );
      if (!hasChunks) {
        skipKnowledge = true;
        logOsExecutionEvent("knowledge.context.skipped", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "skipped",
          errorCode: "no_chunks",
        });
      }
    } catch {
      // If the count check fails, fall through to normal Knowledge fetch.
    }
  }

  const brandIdMeta =
    typeof workingMetadata?.brandId === "string"
      ? workingMetadata.brandId
      : typeof req.metadata?.brandId === "string"
        ? req.metadata.brandId
        : undefined;

  const cachedBrand = host.brandByExecutionId.get(executionId);
  const cachedKnowledge = host.knowledgeByExecutionId.get(executionId);

  const parallelStart = host.deps.clockMs();
  const promptBeforeBrandKnowledge = providerPrompt;

  logOsExecutionEvent("brand.context.requested", {
    requestId: correlationId,
    executionId,
    organizationId: trustedOrganizationId,
    capabilityId: req.capabilityId,
    status: skipBrandIntelligence ? "skipped" : "requested",
  });
  logOsExecutionEvent("knowledge.context.requested", {
    requestId: correlationId,
    executionId,
    organizationId: trustedOrganizationId,
    capabilityId: req.capabilityId,
    status: skipKnowledge ? "skipped" : "requested",
  });

  // Fire both fetches concurrently — results are null on skip/cache hit.
  const [brandResult, knowledgeResult] = await Promise.allSettled([
    skipBrandIntelligence || cachedBrand
      ? Promise.resolve(cachedBrand ?? null)
      : host.brandIntelligence.getContext({
          organizationId: trustedOrganizationId,
          brandId: brandIdMeta,
          executionId,
          requestId: correlationId,
          userId: principal.userId,
          capabilityId: req.capabilityId,
          briefIntent: structuredBrief?.intent.kind,
          nowIso: host.deps.nowIso,
          createId: host.deps.createId,
        }),
    skipKnowledge || cachedKnowledge
      ? Promise.resolve(cachedKnowledge ?? null)
      : host.knowledgeIntelligence.getContext({
          organizationId: trustedOrganizationId,
          executionId,
          requestId: correlationId,
          brandId: brandIdMeta,
          rawPrompt: req.prompt,
          briefIntent: structuredBrief?.intent.kind,
          briefObjective: structuredBrief?.objective,
          deliverableTypes: structuredBrief?.deliverables.map((d) => d.type),
          capabilityId: req.capabilityId,
          // brandTone not available yet (parallel) — knowledge engine uses it only as a hint
          brandTone: undefined,
          nowIso: host.deps.nowIso,
          createId: host.deps.createId,
        }),
  ]);

  logOsExecutionEvent("brand.knowledge.parallel.completed", {
    requestId: correlationId,
    executionId,
    organizationId: trustedOrganizationId,
    durationMs: host.deps.clockMs() - parallelStart,
    status: `brand:${brandResult.status} knowledge:${knowledgeResult.status}`,
  });

  // Apply brand result.
  let promptAfterBrand = promptBeforeBrandKnowledge;
  if (skipBrandIntelligence) {
    logOsExecutionEvent("brand.context.skipped", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: "skipped",
    });
  } else if (brandResult.status === "fulfilled" && brandResult.value !== null) {
    structuredBrandContext = brandResult.value;
    if (promptLearnedSignals) {
      structuredBrandContext = applyPromptSignalsToBrandContext(
        structuredBrandContext,
        promptLearnedSignals,
      );
    }
    host.brandByExecutionId.set(executionId, structuredBrandContext);

    if (
      structuredBrandContext.status === "MISSING" ||
      structuredBrandContext.status === "EMPTY"
    ) {
      logOsExecutionEvent("brand.context.missing", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: structuredBrandContext.status,
        durationMs: host.deps.clockMs() - parallelStart,
      });
    } else if (structuredBrandContext.status === "INVALID") {
      logOsExecutionEvent("brand.context.invalid", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "invalid",
        durationMs: host.deps.clockMs() - parallelStart,
      });
    } else {
      logOsExecutionEvent("brand.context.resolved", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        capabilityId: req.capabilityId,
        status: structuredBrandContext.status,
        durationMs: host.deps.clockMs() - parallelStart,
      });
    }

    const brandMeta = brandContextToMetadata(structuredBrandContext);
    const brandHasSignal =
      structuredBrandContext.status !== "MISSING" &&
      structuredBrandContext.status !== "EMPTY" &&
      structuredBrandContext.status !== "INVALID";
    workingMetadata = {
      ...(workingMetadata ?? {}),
      ...brandMeta,
      brandAware: brandHasSignal,
    };
    // Signal-or-silence: composeBrandAwarePrompt no-ops on EMPTY/MISSING.
    providerPrompt = composeBrandAwarePrompt(providerPrompt, structuredBrandContext);
    promptAfterBrand = providerPrompt;
    workingMetadata = { ...workingMetadata, enrichedPrompt: providerPrompt };
    req = { ...req, metadata: workingMetadata };

    logOsExecutionEvent("brand.context.applied", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId: req.capabilityId,
      status: structuredBrandContext.status,
      durationMs: host.deps.clockMs() - parallelStart,
    });
  } else if (brandResult.status === "rejected") {
    const err = brandResult.reason;
    if (err instanceof BrandIntelligenceError) {
      logOsExecutionEvent("brand.context.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: err.code,
        status: "failed",
      });
      if (
        err.code === "BRAND_TENANT_VIOLATION" ||
        err.code === "BRAND_SPOOF_REJECTED"
      ) {
        return failure(new AuthorizationError(err.message));
      }
    } else {
      logOsExecutionEvent("brand.context.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: "BRAND_CONTEXT_FAILED",
        status: "failed",
      });
    }
  }

  // If Brand Intelligence was skipped/failed but the brief stated colours/voice,
  // still pin those signals onto the provider prompt for this run.
  if (promptLearnedSignals && !structuredBrandContext) {
    const learnedBits = [
      promptLearnedSignals.colors.length
        ? `Colors: ${promptLearnedSignals.colors.slice(0, 8).join(", ")}`
        : "",
      [...promptLearnedSignals.toneAdjectives, ...promptLearnedSignals.voiceNotes]
        .length
        ? `Tone: ${[
            ...promptLearnedSignals.toneAdjectives,
            ...promptLearnedSignals.voiceNotes,
          ]
            .slice(0, 6)
            .join(", ")}`
        : "",
    ].filter(Boolean);
    if (learnedBits.length) {
      const block = `[Learned from this brief]\n${learnedBits.join("\n")}`;
      providerPrompt = `${block}\n${providerPrompt}`.trim();
      promptAfterBrand = providerPrompt;
      workingMetadata = {
        ...(workingMetadata ?? {}),
        enrichedPrompt: providerPrompt,
        brandAware: true,
      };
      req = { ...req, metadata: workingMetadata };
    }
  }

  // Apply knowledge result.
  if (skipKnowledge) {
    logOsExecutionEvent("knowledge.context.skipped", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: "skipped",
    });
  } else if (knowledgeResult.status === "fulfilled" && knowledgeResult.value !== null) {
    structuredKnowledgeContext = knowledgeResult.value;
    host.knowledgeByExecutionId.set(executionId, structuredKnowledgeContext);

    logOsExecutionEvent("knowledge.retrieval.completed", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: structuredKnowledgeContext.status,
      durationMs: host.deps.clockMs() - parallelStart,
    });

    if (
      structuredKnowledgeContext.status === "EMPTY" ||
      structuredKnowledgeContext.status === "MISSING"
    ) {
      logOsExecutionEvent("knowledge.context.empty", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: structuredKnowledgeContext.status,
        durationMs: host.deps.clockMs() - parallelStart,
      });
    } else if (structuredKnowledgeContext.status === "CONFLICTED") {
      logOsExecutionEvent("knowledge.context.conflicted", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: "conflicted",
        durationMs: host.deps.clockMs() - parallelStart,
      });
    } else if (structuredKnowledgeContext.status === "FAILED") {
      logOsExecutionEvent("knowledge.context.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: structuredKnowledgeContext.failureReason,
        status: "failed",
        durationMs: host.deps.clockMs() - parallelStart,
      });
    } else {
      logOsExecutionEvent("knowledge.context.built", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: structuredKnowledgeContext.status,
        durationMs: host.deps.clockMs() - parallelStart,
      });
    }

    const knowledgeMeta = knowledgeContextToMetadata(structuredKnowledgeContext);
    const knowledgeHasSignal =
      structuredKnowledgeContext.status !== "EMPTY" &&
      structuredKnowledgeContext.status !== "MISSING" &&
      structuredKnowledgeContext.status !== "FAILED" &&
      (structuredKnowledgeContext.facts.length > 0 ||
        structuredKnowledgeContext.retrievedChunks.length > 0);
    workingMetadata = {
      ...(workingMetadata ?? {}),
      ...knowledgeMeta,
      knowledgeAware: knowledgeHasSignal,
    };
    // Signal-or-silence: composeKnowledgeAwarePrompt no-ops when there are no hits.
    providerPrompt = composeKnowledgeAwarePrompt(
      providerPrompt,
      structuredKnowledgeContext
    );
    workingMetadata = { ...workingMetadata, enrichedPrompt: providerPrompt };
    req = { ...req, metadata: workingMetadata };

    logOsExecutionEvent("knowledge.context.applied", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      capabilityId: req.capabilityId,
      status: structuredKnowledgeContext.status,
      durationMs: host.deps.clockMs() - parallelStart,
    });
  } else if (knowledgeResult.status === "rejected") {
    const err = knowledgeResult.reason;
    if (err instanceof KnowledgeIntelligenceError) {
      logOsExecutionEvent("knowledge.context.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: err.code,
        status: "failed",
      });
      if (err.code === "KNOWLEDGE_TENANT_VIOLATION") {
        return failure(new AuthorizationError(err.message));
      }
    } else {
      logOsExecutionEvent("knowledge.context.failed", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        errorCode: "KNOWLEDGE_CONTEXT_FAILED",
        status: "failed",
      });
    }
  }

  logBrandKnowledgeContextTable({
    requestId: correlationId,
    executionId,
    organizationId: trustedOrganizationId,
    capabilityId: req.capabilityId,
    brandId: brandIdMeta,
    promptBeforeContext: promptBeforeBrandKnowledge,
    promptAfterBrand,
    promptAfterKnowledge: providerPrompt,
    brandContext: structuredBrandContext,
    knowledgeContext: structuredKnowledgeContext,
    brandSkipped: skipBrandIntelligence,
    knowledgeSkipped: skipKnowledge,
  });

  // Multi-deliverable brief → opt-in ExecutionPlan for Task Graph (Phase 5).
  // Ordinary single creatives stay plan-free (thin path).
  {
    const deliverableCount = structuredBrief?.deliverables?.filter(
      (d) => d.required !== false
    ).length;
    if (
      shouldEnableExecutionPlan({
        metadata: workingMetadata,
        deliverableCount,
      })
    ) {
      workingMetadata = {
        ...(workingMetadata ?? {}),
        enableExecutionPlan: true,
        taskGraphRecommended: true,
        ...(typeof deliverableCount === "number" && deliverableCount >= 2
          ? { multiDeliverable: true }
          : {}),
      };
      // Clear skip-plan flags set earlier for product creatives.
      delete workingMetadata.skipExecutionIntelligence;
      delete workingMetadata.skipPlanning;
      req = { ...req, metadata: workingMetadata };
    }
  }

  // Phase 4 — Execution Intelligence (canonical ExecutionPlan; does NOT execute tasks).
  let structuredExecutionPlan: ExecutionPlan | undefined;
  const skipPlan =
    workingMetadata?.skipExecutionIntelligence === true ||
    workingMetadata?.skipPlanning === true;
  if (skipPlan) {
    logOsExecutionEvent("execution.plan.skipped", {
      requestId: correlationId,
      executionId,
      organizationId: trustedOrganizationId,
      status: "skipped",
    });
  } else if (structuredBrief) {
    const planStarted = host.deps.clockMs();
    try {
      logOsExecutionEvent("execution.plan.requested", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        capabilityId: req.capabilityId,
        status: "requested",
      });

      const cachedPlan = host.planByExecutionId.get(executionId);
      if (cachedPlan && workingMetadata?.forceReplan !== true) {
        structuredExecutionPlan = cachedPlan;
      } else if (
        workingMetadata?.forceReplan === true &&
        typeof workingMetadata?.replanReason === "string"
      ) {
        structuredExecutionPlan = host.executionIntelligence.replan({
          organizationId: trustedOrganizationId,
          executionId,
          requestId: correlationId,
          brief: structuredBrief,
          brandContext: structuredBrandContext,
          knowledgeContext: structuredKnowledgeContext,
          forceReplan: true,
          replanReason: workingMetadata.replanReason,
          existingPlanVersion: cachedPlan?.planVersion ?? 0,
          nowIso: host.deps.nowIso,
          createId: host.deps.createId,
        });
        logOsExecutionEvent("execution.plan.replanned", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: structuredExecutionPlan.status,
          planId: structuredExecutionPlan.id,
          planVersion: structuredExecutionPlan.planVersion,
          durationMs: host.deps.clockMs() - planStarted,
        });
      } else {
        structuredExecutionPlan = host.executionIntelligence.createPlan({
          organizationId: trustedOrganizationId,
          executionId,
          requestId: correlationId,
          brief: structuredBrief,
          brandContext: structuredBrandContext,
          knowledgeContext: structuredKnowledgeContext,
          nowIso: host.deps.nowIso,
          createId: host.deps.createId,
        });
      }

      host.planByExecutionId.set(executionId, structuredExecutionPlan);

      logOsExecutionEvent("execution.plan.generated", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: structuredExecutionPlan.status,
        planId: structuredExecutionPlan.id,
        planVersion: structuredExecutionPlan.planVersion,
        taskCount: structuredExecutionPlan.tasks.length,
        dependencyCount: structuredExecutionPlan.dependencies.length,
        durationMs: host.deps.clockMs() - planStarted,
      });

      if (structuredExecutionPlan.status === "BLOCKED") {
        logOsExecutionEvent("execution.plan.blocked", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "blocked",
          planId: structuredExecutionPlan.id,
          planVersion: structuredExecutionPlan.planVersion,
          durationMs: host.deps.clockMs() - planStarted,
        });
      } else if (structuredExecutionPlan.status === "INVALID") {
        logOsExecutionEvent("execution.plan.invalid", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: "invalid",
          planId: structuredExecutionPlan.id,
          errorCode: structuredExecutionPlan.failureReason,
          durationMs: host.deps.clockMs() - planStarted,
        });
      } else {
        logOsExecutionEvent("execution.plan.validated", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          status: structuredExecutionPlan.status,
          planId: structuredExecutionPlan.id,
          planVersion: structuredExecutionPlan.planVersion,
          taskCount: structuredExecutionPlan.tasks.length,
          dependencyCount: structuredExecutionPlan.dependencies.length,
          durationMs: host.deps.clockMs() - planStarted,
        });
      }

      const planMeta = executionPlanToMetadata(structuredExecutionPlan);
      workingMetadata = {
        ...(workingMetadata ?? {}),
        ...planMeta,
      };
      req = {
        ...req,
        metadata: workingMetadata,
      };

      logOsExecutionEvent("execution.plan.persisted", {
        requestId: correlationId,
        executionId,
        organizationId: trustedOrganizationId,
        status: structuredExecutionPlan.status,
        planId: structuredExecutionPlan.id,
        planVersion: structuredExecutionPlan.planVersion,
        plannerVersion: structuredExecutionPlan.plannerVersion,
        durationMs: host.deps.clockMs() - planStarted,
      });
    } catch (err) {
      if (err instanceof ExecutionIntelligenceError) {
        logOsExecutionEvent("execution.plan.invalid", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          errorCode: err.code,
          status: "failed",
        });
        if (err.code === "PLAN_TENANT_VIOLATION") {
          return failure(new AuthorizationError(err.message));
        }
        // Soft-fail planning: continue single-execution path (Phase 4 coexistence).
        structuredExecutionPlan = undefined;
      } else {
        logOsExecutionEvent("execution.plan.invalid", {
          requestId: correlationId,
          executionId,
          organizationId: trustedOrganizationId,
          errorCode: "PLAN_FAILED",
          status: "failed",
        });
      }
    }
  }

  // Refresh after Brief may have filled capabilityId for NL-only clients.
  capabilityIdRaw = String(req.capabilityId ?? capabilityIdRaw ?? "");

  // After OS assembly, never let PromptCompiler restack the enriched prompt.
  if (
    workingMetadata?.briefAware === true ||
    workingMetadata?.brandAware === true ||
    workingMetadata?.knowledgeAware === true ||
    workingMetadata?.thinOsPath === true ||
    typeof workingMetadata?.enrichedPrompt === "string"
  ) {
    workingMetadata = {
      ...(workingMetadata ?? {}),
      skipPromptCompiler: true,
      enrichedPrompt: providerPrompt,
    };
    req = { ...req, metadata: workingMetadata };
  }

  // Presentation Phase 2 — pin MUST USE facts into metadata for generation gates.
  if (
    workingMetadata?.service === "presentations" ||
    workingMetadata?.outputKind === "presentation"
  ) {
    try {
      const { extractPresentationMustUseFacts } = await import(
        "../../os/delivery/presentation-generation"
      );
      const brandName =
        typeof workingMetadata?.brandName === "string"
          ? workingMetadata.brandName
          : undefined;
      const mustUse = extractPresentationMustUseFacts({
        userBrief: req.prompt ?? "",
        brandName,
        metadata: workingMetadata,
      });
      if (mustUse.length) {
        workingMetadata = {
          ...(workingMetadata ?? {}),
          presentationMustUseFacts: mustUse,
        };
        req = { ...req, metadata: workingMetadata };
      }
    } catch {
      /* non-fatal */
    }
  }

  return success({
    kind: "continue",
    state: {
      ...state,
      req,
      capabilityIdRaw,
      workingMetadata,
      providerPrompt,
      structuredBrief,
      structuredBrandContext,
      structuredKnowledgeContext,
      structuredExecutionPlan,
      promptLearnedSignals,
    },
  });
}
