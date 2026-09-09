/**
 * Direct execution engine — prompt → matrix routing → provider runtime.
 */

import { failure, success, type Result } from "../core/result";
import { ValidationError } from "../core/errors";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../core/identifiers";
import type { IProviderRuntime } from "../providers/runtime/interfaces/provider-runtime";
import type { ProviderExecutionResult } from "../providers/runtime/contracts/provider-execution-response";
import type { ProviderExecutionRequest } from "../providers/runtime/contracts/provider-execution-request";
import { sampleRequest } from "../providers/runtime/testing";
import { resolveExecutableModelId } from "../providers/routing/performance/failover/executable-model-id";
import {
  executeToolAwareRequest,
  parseToolRequestMetadata,
  type ToolRuntimePlatform,
} from "../providers/tools/composition/tool-runtime-platform";
import {
  isProviderOutputTruncated,
  recoverWebProjectPlan,
  websiteContextFromMetadata,
  websiteIncompleteErrorMessage,
} from "../os/delivery/website-generation";
import { appendOutputRequirementsToPrompt } from "./append-output-requirements";
import {
  ensureProviderPromptHasProductionSpec,
  evaluateProductionPregenHold,
  readConfirmedOverrideFromMetadata,
  resolveProductionInstructInputFromMetadata,
} from "../config/format-production-spec";
import { readExecutionSpecFromMetadata } from "../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import { logRequirementConstraintTrace } from "../collaboration/conversational-task-intelligence/requirement-constraint-trace";
import {
  logForensicImageConstraintAudit,
} from "../collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import { extractReferenceImage } from "../providers/image/common/vendor-image-protocol";
import { resolvePayloadAspectRatio } from "../providers/image/common/image-aspect-ratio";
import {
  pickReferenceCapableCandidate,
  reorderImageCandidatesForReferenceEdit,
} from "../collaboration/conversational-task-intelligence/visual-modification-plan";
import {
  providerSupportsReferenceImage,
  providerSupportsReferenceImageEdit,
} from "../providers/image/configs/image-provider-capabilities";
import {
  stampDocumentCreateMetadata,
  isDocumentDirectCreate,
} from "./document-direct-metadata";
import {
  isPresentationDirectCreate,
  stampPresentationCreateMetadata,
} from "./presentation-direct-metadata";
import {
  isEmailDirectCreate,
  stampEmailCreateMetadata,
} from "./email-direct-metadata";
import { buildDirectProviderBag } from "./build-direct-provider-bag";
import {
  ensurePresentationExpandedForDeliverable,
} from "../providers/tools/structured/structured-output-execution";
import type { StructuredOutputRequest } from "../providers/tools/contracts/tool-contracts";
import { TEXT_USE_CASE_PREFERENCES } from "../providers/routing/matrix/matrix-use-case-routing";
import {
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../providers/common/resolve-execution-modality";
import { sanitizeExecutionFeatures } from "../providers/adapters/capabilities/feature-catalog";
import type {
  IDirectExecutionEngine,
  DirectExecutionReport,
  DirectExecutionRequest,
  IntegrationArtifactBag,
  IntegrationPostProcessingOptions,
  DirectExecutionStageKind,
  StageTraceRecord,
} from "./contracts";

const DIRECT_EXECUTION_VERSION = "direct.1";
const MAX_DIRECT_IMAGE_FAILOVERS = 2;

function mergeDirectStructuredFeatures(
  request: ProviderExecutionRequest,
  structured?: StructuredOutputRequest,
  hasTools = false
): string[] {
  const fromOptions = Array.isArray(
    (request.options as Record<string, unknown> | undefined)?.features
  )
    ? ([...(request.options as Record<string, unknown>).features as string[]])
    : [];
  const set = new Set(fromOptions);
  if (hasTools) {
    set.add("functions");
    set.add("tools");
  }
  if (structured) {
    set.add("json_mode");
    set.add("response_format");
  }
  return sanitizeExecutionFeatures([...set]);
}

function resolveStructuredOutputFromMetadata(
  metadata: Readonly<Record<string, unknown>>
): StructuredOutputRequest | undefined {
  const stamped = stampDirectCreateMetadata(metadata);
  const { structuredOutput } = parseToolRequestMetadata(stamped);
  return structuredOutput;
}

function presentationReExecute(
  runtime: IProviderRuntime,
  outerStructured: StructuredOutputRequest | undefined
) {
  return async (
    request: ProviderExecutionRequest
  ): Promise<Result<ProviderExecutionResult>> => {
    const rf = request.payload?.response_format as
      | {
          type?: string;
          json_schema?: {
            name?: string;
            schema?: Record<string, unknown>;
            strict?: boolean;
          };
        }
      | undefined;
    const expandStructured =
      rf?.type === "json_schema" &&
      rf.json_schema?.schema &&
      typeof rf.json_schema.schema === "object"
        ? {
            name: rf.json_schema.name,
            schema: rf.json_schema.schema,
            strict: rf.json_schema.strict ?? true,
          }
        : outerStructured;
    return runtime.execute({
      ...request,
      options: {
        ...(request.options ?? {}),
        features: mergeDirectStructuredFeatures(request, expandStructured),
      },
    });
  };
}
/** Default text/image direct-path budget. */
const DEFAULT_DIRECT_TIMEOUT_MS = 120_000;
/**
 * Web Tech builds a full HTML document via structured output — often exceeds 2 minutes.
 * Keep below mobile poll window (~5+ min) but long enough for luxury landing pages.
 */
const WEBSITE_DIRECT_TIMEOUT_MS = 300_000;
/** Pitch decks run concepts + full deck expansion — two structured LLM calls. */
const PRESENTATION_DIRECT_TIMEOUT_MS = 300_000;
/** Brochures / print documents — large briefs + multipage DocumentPlan JSON. */
const DOCUMENT_DIRECT_TIMEOUT_MS = 300_000;

function stampDirectCreateMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  return stampEmailCreateMetadata(
    stampDocumentCreateMetadata(stampPresentationCreateMetadata(metadata))
  );
}

function isWebsiteDirectRequest(
  metadata?: Readonly<Record<string, unknown>>
): boolean {
  const service =
    typeof metadata?.service === "string"
      ? metadata.service.trim().toLowerCase()
      : "";
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.trim().toLowerCase()
      : "";
  const structuredName =
    metadata?.structuredOutput &&
    typeof metadata.structuredOutput === "object" &&
    typeof (metadata.structuredOutput as { name?: unknown }).name === "string"
      ? String((metadata.structuredOutput as { name: string }).name)
          .trim()
          .toLowerCase()
      : "";
  return (
    service === "website" ||
    outputKind === "deferred_website" ||
    outputKind === "website" ||
    structuredName === "websitepage" ||
    structuredName === "webproject" ||
    structuredName === "websiteroutes"
  );
}

function resolveDirectTimeoutMs(
  metadata?: Readonly<Record<string, unknown>>
): number {
  if (isWebsiteDirectRequest(metadata)) return WEBSITE_DIRECT_TIMEOUT_MS;
  if (isPresentationDirectCreate(metadata)) return PRESENTATION_DIRECT_TIMEOUT_MS;
  if (isDocumentDirectCreate(metadata)) return DOCUMENT_DIRECT_TIMEOUT_MS;
  if (isEmailDirectCreate(metadata)) return DOCUMENT_DIRECT_TIMEOUT_MS;
  return DEFAULT_DIRECT_TIMEOUT_MS;
}

function isPresentationExpansionFailure(
  result: ProviderExecutionResult
): boolean {
  if (result.success !== false) return false;
  const code = String(result.error?.code ?? "");
  const msg = (result.error?.message ?? "").toLowerCase();
  return (
    code === "PRESENTATION_OFF_BRIEF" ||
    msg.includes("slide deck") ||
    msg.includes("slide decks") ||
    msg.includes("expansion") ||
    msg.includes("routes without") ||
    msg.includes("concepts could not")
  );
}

function parseImageFailoverChain(
  metadata?: Readonly<Record<string, unknown>>
): readonly { providerId: string; modelId: string }[] {
  const raw = metadata?.imageFailoverChain ?? metadata?.failoverChain;
  if (!Array.isArray(raw)) return [];
  const out: { providerId: string; modelId: string }[] = [];
  for (const step of raw) {
    if (!step || typeof step !== "object") continue;
    const providerId =
      typeof (step as { providerId?: unknown }).providerId === "string"
        ? (step as { providerId: string }).providerId.trim()
        : "";
    const modelId =
      typeof (step as { modelId?: unknown }).modelId === "string"
        ? (step as { modelId: string }).modelId.trim()
        : "";
    if (!providerId || !modelId) continue;
    out.push({ providerId, modelId });
    if (out.length >= MAX_DIRECT_IMAGE_FAILOVERS) break;
  }
  return out;
}

/** Website structured output — try other text providers if the primary fails / circuit-opens. */
function websiteTextFailoverChain(
  metadata?: Readonly<Record<string, unknown>>,
  primary?: { providerId: string; modelId: string }
): readonly { providerId: string; modelId: string }[] {
  if (!isWebsiteDirectRequest(metadata)) return [];

  const primaryKey = primary
    ? `${primary.providerId}::${primary.modelId}`
    : "";
  const primaryProvider = primary?.providerId ?? "";
  const out: { providerId: string; modelId: string }[] = [];
  const seenProviders = new Set<string>(
    primaryProvider ? [primaryProvider] : []
  );

  for (const pref of TEXT_USE_CASE_PREFERENCES.website) {
    const key = `${pref.providerId}::${pref.modelId}`;
    if (key === primaryKey) continue;
    // Prefer a different vendor first when the primary circuit may be open.
    if (seenProviders.has(pref.providerId)) continue;
    seenProviders.add(pref.providerId);
    out.push({ providerId: pref.providerId, modelId: pref.modelId });
    if (out.length >= 3) break;
  }
  // If we still have room, allow a second model on a new provider only.
  return out;
}

/** Pitch decks / presentations — failover to OpenAI etc. if Anthropic rejects features. */
function presentationTextFailoverChain(
  metadata?: Readonly<Record<string, unknown>>,
  primary?: { providerId: string; modelId: string }
): readonly { providerId: string; modelId: string }[] {
  if (!isPresentationDirectCreate(metadata)) return [];

  const primaryKey = primary
    ? `${primary.providerId}::${primary.modelId}`
    : "";
  const primaryProvider = primary?.providerId ?? "";
  const out: { providerId: string; modelId: string }[] = [];
  const seenProviders = new Set<string>(
    primaryProvider ? [primaryProvider] : []
  );

  // Structured pitch decks — OpenAI + Anthropic only (Mistral/Gemini reject strict json_schema).
  const allowed = new Set(["provider.openai", "provider.anthropic"]);
  for (const pref of TEXT_USE_CASE_PREFERENCES.strategy) {
    if (!allowed.has(pref.providerId)) continue;
    const key = `${pref.providerId}::${pref.modelId}`;
    if (key === primaryKey) continue;
    if (seenProviders.has(pref.providerId)) continue;
    seenProviders.add(pref.providerId);
    out.push({ providerId: pref.providerId, modelId: pref.modelId });
    if (out.length >= 2) break;
  }
  return out;
}

/** General text — failover across vendors when primary hits 429 / circuit / runtime errors. */
function generalTextFailoverChain(
  primary?: { providerId: string; modelId: string },
  useCase?: string
): readonly { providerId: string; modelId: string }[] {
  const primaryKey = primary
    ? `${primary.providerId}::${primary.modelId}`
    : "";
  const primaryProvider = primary?.providerId ?? "";
  const out: { providerId: string; modelId: string }[] = [];
  const seenProviders = new Set<string>(
    primaryProvider ? [primaryProvider] : []
  );

  const prefsKey =
    useCase && useCase in TEXT_USE_CASE_PREFERENCES
      ? (useCase as keyof typeof TEXT_USE_CASE_PREFERENCES)
      : "general";
  const prefs = TEXT_USE_CASE_PREFERENCES[prefsKey] ?? TEXT_USE_CASE_PREFERENCES.general;

  for (const pref of prefs) {
    const key = `${pref.providerId}::${pref.modelId}`;
    if (key === primaryKey) continue;
    if (seenProviders.has(pref.providerId)) continue;
    seenProviders.add(pref.providerId);
    out.push({ providerId: pref.providerId, modelId: pref.modelId });
    if (out.length >= 3) break;
  }
  return out;
}

function isRateLimitFailureMessage(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("http 429") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("429")
  );
}

function isCircuitOpenFailureMessage(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("circuit breaker") || m.includes("circuit_open");
}

/** Reject "success" text that is not a valid WebProject (or complete HTML wrap). */
function providerResultHasCompleteWebsite(
  result: ProviderExecutionResult,
  metadata?: Readonly<Record<string, unknown>>
): boolean {
  const output = (result.response?.output ?? {}) as Record<string, unknown>;
  if (isProviderOutputTruncated(output)) return false;
  const preferredStack = websiteContextFromMetadata(
    metadata,
    ""
  ).stack;
  const recoverOpts = { preferredStack };
  if (recoverWebProjectPlan(output.structured, recoverOpts)) return true;
  if (recoverWebProjectPlan(output.structuredOutput, recoverOpts)) return true;
  if (
    typeof output.content === "string" &&
    recoverWebProjectPlan(output.content, recoverOpts)
  ) {
    return true;
  }
  if (
    typeof output.text === "string" &&
    recoverWebProjectPlan(output.text, recoverOpts)
  ) {
    return true;
  }
  return false;
}

export interface DirectExecutionEngineDeps {
  readonly runtime: IProviderRuntime;
  readonly toolRuntime?: ToolRuntimePlatform;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

function toProviderExecutionRequest(
  request: DirectExecutionRequest,
  bag: IntegrationArtifactBag,
  routingOverride?: { providerId: string; modelId: string }
): ProviderExecutionRequest {
  const routing = bag.routing!;
  const task = bag.task!;
  const providerId = asProviderId(
    String(routingOverride?.providerId ?? routing.plan.primary.providerId ?? "provider.openai")
  );
  const promptText = task.request.rawPrompt;
  const apiExecutionId =
    typeof request.metadata?.apiExecutionId === "string"
      ? request.metadata.apiExecutionId
      : typeof request.metadata?.executionId === "string"
        ? request.metadata.executionId
        : request.requestId;
  const organizationId = String(
    request.organizationId ?? request.metadata?.organizationId ?? "org_default"
  );

  const meta = request.metadata ?? {};
  const timeoutMs = resolveDirectTimeoutMs(meta);
  const base = sampleRequest({
    requestId: `${request.requestId}_rt`,
    providerId: String(providerId),
    payload: {
      prompt: promptText,
      text: promptText,
      input: promptText,
    },
    timeoutPolicy: {
      executionTimeoutMs: timeoutMs,
      streamingTimeoutMs: timeoutMs,
      queueTimeoutMs: 30_000,
    },
    retryPolicy: {
      strategy: "exponential",
      maxAttempts: 1,
      baseDelayMs: 250,
    },
  });

  const assets = Array.isArray(meta.assets) ? meta.assets : undefined;
  const image =
    meta.image && typeof meta.image === "object" ? meta.image : undefined;
  const audio =
    meta.audio && typeof meta.audio === "object" ? meta.audio : undefined;
  const language = typeof meta.language === "string" ? meta.language : undefined;
  const aspectRatio = resolvePayloadAspectRatio({
    prompt: promptText,
    text: promptText,
    input: promptText,
    ...(typeof meta.aspectRatio === "string" ? { aspectRatio: meta.aspectRatio } : {}),
  });

  return {
    ...base,
    capabilityId: asCapabilityId(String(task.capabilityMap.primary ?? "text.generate")),
    providerId,
    modelId: resolveExecutableModelId(
      String(providerId),
      routingOverride?.modelId ??
        (routing.plan.primary.modelId
          ? String(routing.plan.primary.modelId)
          : base.modelId)
    ),
    payload: {
      ...base.payload,
      ...(assets ? { assets } : {}),
      ...(image ? { image } : {}),
      ...(audio ? { audio } : {}),
      ...(language ? { language } : {}),
      ...(meta.structuredOutput ? { structuredOutput: meta.structuredOutput } : {}),
      ...(typeof meta.productAction === "string"
        ? { productAction: meta.productAction }
        : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
    },
    metadata: meta,
    context: {
      ...base.context,
      providerId,
      organizationId: asOrganizationId(organizationId),
      workspaceId: request.workspaceId
        ? asWorkspaceId(String(request.workspaceId))
        : base.context.workspaceId,
      executionId: asExecutionId(apiExecutionId),
      correlationId: request.correlationId ?? request.requestId,
    },
  };
}

export class DirectExecutionEngine implements IDirectExecutionEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: DirectExecutionEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId =
      deps.createId ?? ((p: string) => `${p}_${Date.now()}`);
  }

  async run(
    request: DirectExecutionRequest
  ): Promise<Result<DirectExecutionReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }
    if (!request.rawPrompt?.trim()) {
      return failure(new ValidationError("rawPrompt is required"));
    }

    let stampedMetadata: Record<string, unknown> = {
      ...stampDirectCreateMetadata(request.metadata),
    };
    const executionSpec = readExecutionSpecFromMetadata(stampedMetadata);
    logRequirementConstraintTrace({
      phase: "EXECUTION_SPEC",
      executionId:
        typeof stampedMetadata?.executionId === "string"
          ? stampedMetadata.executionId
          : typeof stampedMetadata?.apiExecutionId === "string"
            ? stampedMetadata.apiExecutionId
            : request.requestId,
      productAction:
        typeof stampedMetadata?.productAction === "string"
          ? stampedMetadata.productAction
          : undefined,
      metadata: stampedMetadata,
      spec: executionSpec,
    });
    const productionInstruct = ensureProviderPromptHasProductionSpec({
      prompt: request.rawPrompt,
      metadata: stampedMetadata,
    });
    stampedMetadata = {
      ...stampedMetadata,
      ...productionInstruct.metadata,
    };

    // Phase 5 — do not spend provider budget on unconfirmed R/H placements.
    {
      const pregen = evaluateProductionPregenHold({
        ...resolveProductionInstructInputFromMetadata(stampedMetadata),
        confirmedOverride: readConfirmedOverrideFromMetadata(stampedMetadata),
        organizationId: String(
          request.organizationId ?? stampedMetadata.organizationId ?? "",
        ),
        executionId:
          typeof stampedMetadata.executionId === "string"
            ? stampedMetadata.executionId
            : request.requestId,
        requestId: request.requestId,
      });
      if (pregen.blocked) {
        return failure(
          new ValidationError(
            pregen.reason ??
              "Production Spec pre-gen hold: confirmedOverride required for R/H placement",
          ),
        );
      }
    }

    const promptWithOutputRequirements = appendOutputRequirementsToPrompt({
      prompt: productionInstruct.prompt,
      metadata: stampedMetadata,
    });
    logRequirementConstraintTrace({
      phase: "FINAL_PROVIDER_REQUEST",
      executionId:
        typeof stampedMetadata?.executionId === "string"
          ? stampedMetadata.executionId
          : request.requestId,
      productAction:
        typeof stampedMetadata?.productAction === "string"
          ? stampedMetadata.productAction
          : undefined,
      metadata: stampedMetadata,
      spec: executionSpec,
      prompt: promptWithOutputRequirements,
    });
    const providerRequest: DirectExecutionRequest = {
      ...request,
      rawPrompt: promptWithOutputRequirements,
      metadata: stampedMetadata,
    };

    const bag = buildDirectProviderBag(providerRequest) as IntegrationArtifactBag;
    const stages: StageTraceRecord[] = [];
    const completed: DirectExecutionStageKind[] = [];
    const correlationId = request.correlationId ?? request.requestId;
    const at = this.nowIso();

    stages.push({
      stage: "routing",
      status: "succeeded",
      startedAt: at,
      completedAt: at,
      durationMs: 0,
      message: "Direct matrix routing",
      artifactRefs: [],
    });
    completed.push("routing");

    // Planning-only: resolve provider/model bag, do not call the provider.
    // Callers that need a full generation must use mode "full" (default).
    if (request.mode === "planning_through_routing") {
      return success(this.report(request, bag, stages, completed, start, true));
    }

    const { toolNames, structuredOutput: parsedStructured } =
      parseToolRequestMetadata(stampedMetadata);
    const primaryCap = String(bag.task?.capabilityMap.primary ?? "");
    const isMediaGeneration =
      isImageGenerationCapability(primaryCap) ||
      isVideoGenerationCapability(primaryCap);
    const structuredOutput = isMediaGeneration
      ? undefined
      : parsedStructured ?? resolveStructuredOutputFromMetadata(stampedMetadata);
    const presentationCreate =
      !isMediaGeneration && isPresentationDirectCreate(stampedMetadata);
    const presentationDeliverableRequired =
      presentationCreate && stampedMetadata.deliverableRequired !== false;

    if (!structuredOutput && presentationDeliverableRequired) {
      console.warn(
        `📑 [Presentation] structured schema missing after stamp | requestId=${request.requestId}`
      );
    } else if (
      !structuredOutput &&
      (String(stampedMetadata?.outputKind ?? "").toLowerCase() === "presentation" ||
        String(
          (stampedMetadata?.structuredOutput as { name?: unknown } | undefined)
            ?.name ?? ""
        )
          .toLowerCase()
          .includes("presentation"))
    ) {
      console.warn(
        `📑 [Presentation] tool path skipped — structuredOutput.schema missing | requestId=${request.requestId}`
      );
    }

    if (presentationDeliverableRequired && !this.deps.toolRuntime) {
      return failure(
        new ValidationError(
          "Presentation export requires tool runtime (structured output + deck expansion)"
        )
      );
    }
    const organizationId = String(
      request.organizationId ?? request.metadata?.organizationId ?? "org_default"
    );
    const principalUserId =
      typeof request.metadata?.userId === "string" ? request.metadata.userId : undefined;
    const roles = Array.isArray(request.metadata?.roles)
      ? request.metadata.roles.filter((role): role is string => typeof role === "string")
      : undefined;

    const primary = bag.routing!.plan.primary;
    const failover = parseImageFailoverChain(request.metadata);
    const isImage = isImageGenerationCapability(primaryCap);
    const visualOperationKind = String(
      stampedMetadata?.visualOperationKind ?? ""
    ).toUpperCase();
    const referenceEditRequired =
      String(stampedMetadata?.capabilityId ?? "").toLowerCase() === "image.edit" ||
      visualOperationKind === "MODIFY" ||
      visualOperationKind === "REGENERATE";
    const primaryCandidate = {
      providerId: String(primary.providerId ?? "provider.openai"),
      modelId: String(primary.modelId ?? "gpt-4o"),
    };
    const websiteFailover = websiteTextFailoverChain(
      request.metadata,
      primaryCandidate
    );
    const presentationFailover = presentationTextFailoverChain(
      stampedMetadata,
      primaryCandidate
    );
    const textUseCase =
      typeof stampedMetadata?.textUseCase === "string"
        ? stampedMetadata.textUseCase.trim()
        : undefined;
    let textFailover = [...websiteFailover, ...presentationFailover];
    if (!isImage && textFailover.length === 0) {
      // Prefer matrix failoverChain from prepass; else vendor-diverse general chain.
      textFailover =
        failover.length > 0
          ? [...failover]
          : [...generalTextFailoverChain(primaryCandidate, textUseCase)];
    }
    const candidates: { providerId: string; modelId: string }[] = isImage
      ? [primaryCandidate, ...failover]
      : [primaryCandidate, ...textFailover];
    const seen = new Set<string>();
    let uniqueCandidates = candidates.filter((c) => {
      const key = `${c.providerId}::${c.modelId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (isImage && referenceEditRequired) {
      uniqueCandidates = [...reorderImageCandidatesForReferenceEdit(uniqueCandidates)];
      if (!pickReferenceCapableCandidate(uniqueCandidates)) {
        const targetArtifactId =
          typeof stampedMetadata?.targetArtifactId === "string"
            ? stampedMetadata.targetArtifactId
            : typeof stampedMetadata?.referenceArtifactId === "string"
              ? stampedMetadata.referenceArtifactId
              : "unknown";
        return failure(
          new ValidationError(
            `Reference-image modification for artifact '${targetArtifactId}' is not supported by any configured image provider.`,
            {
              reason: "UNSUPPORTED_OPERATION",
              targetArtifactId,
            },
          ),
        );
      }
    } else if (
      isImage &&
      (stampedMetadata?.referenceInputPresent === true ||
        (typeof stampedMetadata?.brandLogoAssetId === "string" &&
          stampedMetadata.brandLogoAssetId.trim()) ||
        (typeof stampedMetadata?.logoAssetId === "string" &&
          stampedMetadata.logoAssetId.trim()) ||
        (Array.isArray(stampedMetadata?.assetIds) &&
          stampedMetadata.assetIds.length > 0))
    ) {
      // Vault/attached logo on generate — never fall through to OpenAI/Recraft
      // (they drop the reference image and invent a new mark).
      const refCapable = uniqueCandidates.filter((c) =>
        providerSupportsReferenceImage(c.providerId)
      );
      if (refCapable.length > 0) {
        uniqueCandidates = refCapable;
      }
    }

    // Pitch decks + websites: prefer OpenAI (Codex / GPT-5.5) for structured code/JSON;
    // Anthropic remains in the failover chain for quality/design recovery.
    if (
      (presentationDeliverableRequired ||
        isWebsiteDirectRequest(request.metadata)) &&
      !isImage &&
      uniqueCandidates.length > 1
    ) {
      uniqueCandidates = [
        ...uniqueCandidates.filter((c) => c.providerId === "provider.openai"),
        ...uniqueCandidates.filter((c) => c.providerId !== "provider.openai"),
      ];
    }

    let result: Result<ProviderExecutionResult> | undefined;
    let execMs = 0;
    let lastFailureMessage = "Provider execution failed";
    const circuitOpenProviders = new Set<string>();

    for (const candidate of uniqueCandidates) {
      if (circuitOpenProviders.has(candidate.providerId)) {
        continue;
      }
      const execReq = toProviderExecutionRequest(providerRequest, bag, candidate);
      if (isMediaGeneration) {
        const assetIds = Array.isArray(stampedMetadata?.assetIds)
          ? stampedMetadata.assetIds.filter((id): id is string => typeof id === "string")
          : [];
        const refImage = extractReferenceImage(execReq.payload ?? {});
        logForensicImageConstraintAudit({
          executionId:
            typeof stampedMetadata?.executionId === "string"
              ? stampedMetadata.executionId
              : request.requestId,
          action:
            typeof stampedMetadata?.conversationalAction === "string"
              ? stampedMetadata.conversationalAction
              : undefined,
          targetExecutionId:
            typeof stampedMetadata?.refineFromExecutionId === "string"
              ? stampedMetadata.refineFromExecutionId
              : undefined,
          targetArtifactId:
            typeof stampedMetadata?.targetArtifactId === "string"
              ? stampedMetadata.targetArtifactId
              : typeof stampedMetadata?.referenceArtifactId === "string"
                ? stampedMetadata.referenceArtifactId
                : undefined,
          productAction:
            typeof stampedMetadata?.productAction === "string"
              ? stampedMetadata.productAction
              : undefined,
          stage: "provider_adapter",
          metadata: stampedMetadata,
          spec: executionSpec,
          prompt: String(execReq.payload?.prompt ?? execReq.payload?.text ?? ""),
          providerId: String(candidate.providerId),
          modelId: String(candidate.modelId),
          capabilityId: primaryCap,
          providerCapability: providerSupportsReferenceImageEdit(candidate.providerId)
            ? "REFERENCE_IMAGE_EDIT"
            : "TEXT_TO_IMAGE",
          generationPath: "DirectExecutionEngine→ProviderRuntime→VendorSyncImageDispatcher",
          referenceImageAttached: Boolean(refImage),
          referenceInputPresent: stampedMetadata?.referenceInputPresent === true,
          referenceInputType:
            typeof stampedMetadata?.referenceInputType === "string"
              ? stampedMetadata.referenceInputType
              : undefined,
          referenceAssetIds: assetIds.length ? assetIds : undefined,
          visualOperationKind:
            typeof stampedMetadata?.visualOperationKind === "string"
              ? stampedMetadata.visualOperationKind
              : undefined,
        });
        const logoBoundOnGenerate =
          !referenceEditRequired &&
          (stampedMetadata?.referenceInputPresent === true ||
            (typeof stampedMetadata?.brandLogoAssetId === "string" &&
              Boolean(stampedMetadata.brandLogoAssetId.trim())) ||
            (typeof stampedMetadata?.logoAssetId === "string" &&
              Boolean(stampedMetadata.logoAssetId.trim())) ||
            (Array.isArray(stampedMetadata?.assetIds) &&
              stampedMetadata.assetIds.length > 0));
        if (
          (referenceEditRequired &&
            !providerSupportsReferenceImageEdit(candidate.providerId)) ||
          (logoBoundOnGenerate &&
            !providerSupportsReferenceImage(candidate.providerId))
        ) {
          lastFailureMessage =
            "Provider does not support reference-image input for brand logo continuity";
          continue;
        }
      }
      if (
        candidate.providerId !== primaryCandidate.providerId &&
        (presentationDeliverableRequired ||
          isWebsiteDirectRequest(request.metadata) ||
          !isImage)
      ) {
        const kind = presentationDeliverableRequired
          ? "Presentation"
          : isWebsiteDirectRequest(request.metadata)
            ? "Website"
            : "Text";
        console.log(
          `📑 [${kind}] provider failover | requestId=${request.requestId} | provider=${candidate.providerId} | model=${candidate.modelId}`
        );
      }
      const execStart = this.clockMs();
      if (
        this.deps.toolRuntime &&
        (toolNames.length > 0 || structuredOutput !== undefined)
      ) {
        result = await executeToolAwareRequest({
          platform: this.deps.toolRuntime,
          providerRequest: execReq,
          organizationId,
          workspaceId: request.workspaceId ? String(request.workspaceId) : undefined,
          principalUserId,
          roles,
          toolNames,
          structuredOutput,
          allowSideEffectsWithoutApproval:
            request.metadata?.allowSideEffectsWithoutApproval === true,
        }).then((toolResult) =>
          toolResult.ok ? success(toolResult.value.providerResult) : toolResult
        );
      } else {
        result = await this.deps.runtime.execute(execReq);
      }
      execMs = Math.max(0, this.clockMs() - execStart);

      if (!result.ok) {
        lastFailureMessage = String(result.error.message);
        if (
          isCircuitOpenFailureMessage(lastFailureMessage) ||
          isRateLimitFailureMessage(lastFailureMessage)
        ) {
          circuitOpenProviders.add(candidate.providerId);
        }
        continue;
      }
      if (result.value.success === false) {
        lastFailureMessage =
          result.value.error?.message ?? "Provider execution failed";
        if (
          isCircuitOpenFailureMessage(lastFailureMessage) ||
          isRateLimitFailureMessage(lastFailureMessage)
        ) {
          circuitOpenProviders.add(candidate.providerId);
        }
        // Concepts may have succeeded — do not re-run the whole pipeline on Mistral etc.
        if (
          presentationDeliverableRequired &&
          isPresentationExpansionFailure(result.value)
        ) {
          lastFailureMessage =
            "Pitch deck slide expansion failed. Please try again — your concepts were generated but full slides could not be built.";
          break;
        }
        continue;
      }

      if (
        presentationDeliverableRequired &&
        structuredOutput &&
        result.value.success !== false
      ) {
        const expanded = await ensurePresentationExpandedForDeliverable({
          executed: result.value,
          structured: structuredOutput,
          providerRequest: execReq,
          nowIso: this.nowIso,
          reExecute: presentationReExecute(this.deps.runtime, structuredOutput),
        });
        if (!expanded.ok) {
          lastFailureMessage = expanded.error.message;
          continue;
        }
        if (expanded.value.success === false) {
          lastFailureMessage =
            expanded.value.error?.message ??
            "Presentation deck expansion failed";
          continue;
        }
        result = expanded;
      }

      // Website runs must produce a valid WebProject for the chosen stack.
      if (
        isWebsiteDirectRequest(request.metadata) &&
        !providerResultHasCompleteWebsite(result.value, request.metadata)
      ) {
        const stack = websiteContextFromMetadata(request.metadata, "").stack;
        lastFailureMessage = websiteIncompleteErrorMessage(stack);
        continue;
      }
      break;
    }

    if (isCircuitOpenFailureMessage(lastFailureMessage)) {
      lastFailureMessage =
        "AI providers are temporarily cooling down after recent failures. Wait about 30 seconds, then retry — we will try alternate models automatically.";
    }

    if (!result) {
      stages.push({
        stage: "provider_runtime",
        status: "failed",
        startedAt: this.nowIso(),
        completedAt: this.nowIso(),
        durationMs: execMs,
        message: "No provider candidates",
        artifactRefs: [],
      });
      return success(this.report(request, bag, stages, completed, start, false));
    }

    if (!result.ok) {
      stages.push({
        stage: "provider_runtime",
        status: "failed",
        startedAt: this.nowIso(),
        completedAt: this.nowIso(),
        durationMs: execMs,
        message: String(result.error.message),
        artifactRefs: [],
      });
      return success(this.report(request, bag, stages, completed, start, false));
    }

    const completedBag: IntegrationArtifactBag = {
      ...bag,
      runtime: result.value,
    };
    if (result.value.success === false) {
      stages.push({
        stage: "provider_runtime",
        status: "failed",
        startedAt: this.nowIso(),
        completedAt: this.nowIso(),
        durationMs: execMs,
        message: lastFailureMessage,
        artifactRefs: [],
      });
      return success(this.report(request, completedBag, stages, completed, start, false));
    }

    stages.push({
      stage: "provider_runtime",
      status: "succeeded",
      startedAt: this.nowIso(),
      completedAt: this.nowIso(),
      durationMs: execMs,
      message: "Direct provider execution completed",
      artifactRefs: [],
    });
    completed.push("provider_runtime");

    return success(this.report(request, completedBag, stages, completed, start, true));
  }

  async runPostProcessing(
    request: DirectExecutionRequest,
    bag: IntegrationArtifactBag,
    options?: IntegrationPostProcessingOptions
  ): Promise<Result<DirectExecutionReport>> {
    const stages = [...(options?.priorStages ?? [])];
    const completed = [...(options?.priorStagesCompleted ?? [])];
    return success(
      this.report(request, bag, stages, completed, this.clockMs(), bag.runtime?.success !== false)
    );
  }

  private report(
    request: DirectExecutionRequest,
    bag: IntegrationArtifactBag,
    stages: StageTraceRecord[],
    completed: DirectExecutionStageKind[],
    start: number,
    successFlag: boolean
  ): DirectExecutionReport {
    const correlationId = request.correlationId ?? request.requestId;
    const capturedAt = this.nowIso();
    return {
      resultId: this.createId("direct"),
      requestId: request.requestId,
      request,
      artifacts: bag,
      trace: {
        traceId: this.createId("trace"),
        correlationId,
        requestId: request.requestId,
        stages,
        bridges: [],
        completedStages: completed,
        capturedAt,
      },
      stagesCompleted: completed,
      success: successFlag,
      durationMs: Math.max(0, this.clockMs() - start),
      createdAt: capturedAt,
      version: DIRECT_EXECUTION_VERSION,
    };
  }
}

export function createDirectExecutionEngine(
  deps: DirectExecutionEngineDeps
): IDirectExecutionEngine {
  return new DirectExecutionEngine(deps);
}
