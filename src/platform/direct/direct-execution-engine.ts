/**
 * Direct execution engine — prompt → matrix routing → provider runtime.
 */

import { failure, success, type Result } from "../core/result";
import { ValidationError } from "../core/errors";
import { applyProviderPinPolicy } from "../providers/routing/provider-pin-policy";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../core/identifiers";
import type { IProviderRuntime } from "../providers/runtime/interfaces/provider-runtime";
import type {
  ProviderAttemptHistoryEntry,
  ProviderExecutionResult,
} from "../providers/runtime/contracts/provider-execution-response";
import type { ProviderExecutionRequest } from "../providers/runtime/contracts/provider-execution-request";
import { sampleRequest } from "../providers/runtime/testing";
import {
  resolveExecutableModelId,
  resolveExecutedModelIdentity,
} from "../providers/routing/performance/failover/executable-model-id";
import { classifyExecutionFailure } from "../providers/routing/performance/failover/failure-classification";
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
import { emitCanonicalProviderBoundaryTrace } from "../cdf/generation-context/trace";
import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  resolveCanonicalModelRequestFromCarrier,
  type CanonicalModelRequest,
} from "../ai/canonical-model-request";
import {
  prepareCanonicalModelRuntime,
  buildProviderRepresentationPlan,
  summarizeRepresentationPlan,
} from "../ai/model-runtime";
import {
  applyProductionSpecInstructToMetadata,
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
  resolveSelectedImageOperationCapability,
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
import {
  assertCanonicalStructuredSchemaBeforeProvider,
  stampCanonicalStructuredOutputMetadata,
} from "../cdf/structured-output-contract";
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
/** Text/structured failover budget — vendor-diverse, not image-leaf capped. */
const MAX_DIRECT_TEXT_FAILOVERS = 4;

const WEBSITE_STRUCTURED_CONTRACT_NAMES = new Set([
  "websitepage",
  "webproject",
  "websiteroutes",
  "cdfwebsitesitemap",
  "cdfwebsitepagestructure",
]);

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
  // Legacy product stamps first (may omit early CDF phases), then contract-derived
  // canonical structured stamp so phase artifact schemas always win when required.
  return stampCanonicalStructuredOutputMetadata(
    stampEmailCreateMetadata(
      stampDocumentCreateMetadata(stampPresentationCreateMetadata(metadata))
    )
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
  // CDF website phases seal outputKind=text but remain website failover work
  // (CdfWebsiteSitemap / CdfWebsitePageStructure / CdfWebsiteWireframe / legacy Website*).
  if (WEBSITE_STRUCTURED_CONTRACT_NAMES.has(structuredName)) return true;
  if (service === "website") return true;
  // CDF-sealed / authoritative non-website kinds are not website code-gen.
  if (
    outputKind === "text" ||
    outputKind === "document" ||
    outputKind === "email" ||
    outputKind === "presentation" ||
    outputKind === "image" ||
    outputKind === "video"
  ) {
    return false;
  }
  return outputKind === "deferred_website" || outputKind === "website";
}

/**
 * Full WebProject / HTML completeness is only required for final website
 * code-gen — not for CDF intermediate contracts (sitemap / page structure).
 */
function requiresCompleteWebsiteDeliverable(
  metadata?: Readonly<Record<string, unknown>>
): boolean {
  const structuredName =
    metadata?.structuredOutput &&
    typeof metadata.structuredOutput === "object" &&
    typeof (metadata.structuredOutput as { name?: unknown }).name === "string"
      ? String((metadata.structuredOutput as { name: string }).name)
          .trim()
          .toLowerCase()
      : "";
  // CDF contracts (page structure, UI directions, routes, approval docs) are
  // planning output validated by their schema, never a WebProject codebase.
  if (structuredName.startsWith("cdf")) {
    return false;
  }
  return isWebsiteDirectRequest(metadata);
}

/**
 * Read toolOrchestration.blockProviderFailover from a provider result.
 * Structured-contract validation failures are never terminal for the declared
 * failover chain unless a real side-effect already ran.
 */
function providerResultBlocksFailover(
  result: ProviderExecutionResult
): boolean {
  const output = result.response?.output as Record<string, unknown> | undefined;
  const orch = output?.toolOrchestration as Record<string, unknown> | undefined;
  if (orch?.blockProviderFailover !== true) return false;
  const code = String(result.error?.code ?? "");
  if (
    code === "STRUCTURED_OUTPUT_INVALID" ||
    code === "STRUCTURED_OUTPUT_TRUNCATED"
  ) {
    return orch.sideEffectExecuted === true;
  }
  if (
    result.success === false &&
    (output?.structuredOutputValid === false ||
      orch.structuredOutputValid === false)
  ) {
    return orch.sideEffectExecuted === true;
  }
  return true;
}

/**
 * True when the provider result already satisfies a requested structured-output
 * contract (normalized + validated). Failover MUST stop when this is true.
 * Fail-closed: arrays, failed attempts, and STRUCTURED_OUTPUT_INVALID never
 * count as satisfied — even if a stale valid flag is present.
 */
export function providerResultSatisfiesStructuredContract(
  result: ProviderExecutionResult,
  structured?: StructuredOutputRequest
): boolean {
  if (!structured) return false;
  if (result.success === false) return false;
  const code = String(result.error?.code ?? "");
  if (
    code === "STRUCTURED_OUTPUT_INVALID" ||
    code === "STRUCTURED_OUTPUT_TRUNCATED"
  ) {
    return false;
  }
  const output = result.response?.output as Record<string, unknown> | undefined;
  if (!output) return false;
  const payload = output.structured;
  // Object schemas (e.g. CdfCreativeDirections) must not treat arrays as valid.
  if (
    payload == null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }
  if (output.structuredOutputValid === true) return true;
  const orch = output.toolOrchestration as Record<string, unknown> | undefined;
  return orch?.structuredOutputValid === true;
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

/**
 * Text/structured failover from prepass metadata.
 * Prefer vendor diversity so two Anthropic models cannot exhaust the budget
 * before Gemini/DeepSeek are reached (CdfWebsiteSitemap regression).
 */
function parseTextFailoverChain(
  metadata?: Readonly<Record<string, unknown>>,
  primary?: { providerId: string; modelId: string }
): readonly { providerId: string; modelId: string }[] {
  const raw = metadata?.failoverChain;
  if (!Array.isArray(raw)) return [];
  const out: { providerId: string; modelId: string }[] = [];
  const seenProviders = new Set<string>(
    primary?.providerId ? [primary.providerId] : []
  );
  const seenKeys = new Set<string>(
    primary ? [`${primary.providerId}::${primary.modelId}`] : []
  );
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
    const key = `${providerId}::${modelId}`;
    if (seenKeys.has(key)) continue;
    if (seenProviders.has(providerId)) continue;
    seenKeys.add(key);
    seenProviders.add(providerId);
    out.push({ providerId, modelId });
    if (out.length >= MAX_DIRECT_TEXT_FAILOVERS) break;
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
    m.includes("rate_limit")
  );
}

/** True when the attempt is credit/billing exhaustion (typed quota). */
function isQuotaExhaustionFailure(input: {
  readonly failureCategory?: string;
  readonly providerErrorCode?: string;
  readonly message?: string;
}): boolean {
  if (input.failureCategory === "quota") return true;
  const code = (input.providerErrorCode ?? "").toLowerCase();
  if (
    code === "credit_balance_exhausted" ||
    code.includes("credit_balance") ||
    code.includes("insufficient_quota") ||
    code.includes("billing_not_active")
  ) {
    return true;
  }
  const m = (input.message ?? "").toLowerCase();
  return (
    m.includes("credit_balance_exhausted") ||
    m.includes("credit balance") ||
    m.includes("exhausted your credit") ||
    m.includes("insufficient_quota") ||
    m.includes("insufficient balance") ||
    m.includes("out of credit")
  );
}

const STRUCTURED_CONTRACT_USER_MESSAGE =
  "Structured generation could not satisfy the required output contract. Please retry.";

function isStructuredContractFailure(input: {
  readonly failureCategory?: string;
  readonly errorCode?: string;
  readonly message?: string;
}): boolean {
  const cat = (input.failureCategory ?? "").toLowerCase();
  if (
    cat === "structured_output_invalid" ||
    cat === "contract_validation_failure"
  ) {
    return true;
  }
  const code = (input.errorCode ?? "").toUpperCase();
  if (
    code === "STRUCTURED_OUTPUT_INVALID" ||
    code === "STRUCTURED_OUTPUT_TRUNCATED" ||
    code.includes("STRUCTURED_OUTPUT")
  ) {
    return true;
  }
  const m = (input.message ?? "").toLowerCase();
  return (
    m.includes("structured_output_invalid") ||
    m.includes("structured output") ||
    m.includes("json schema") ||
    m.includes("expected type object") ||
    m.includes("missing required")
  );
}

function isCircuitOpenFailureMessage(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("circuit breaker") ||
    m.includes("circuit_open") ||
    // Exact pipeline message — avoid matching rewritten UX "cooling down" copy
    // that is applied only after the candidate loop completes.
    m === "circuit breaker is open"
  );
}

/**
 * User-facing circuit-open copy.
 * Claims automatic alternate-model retry ONLY when this execution's candidate
 * list actually includes failover steps AND at least one candidate remained
 * eligible. Fanout leaves may declare intra-leaf same-provider model fallbacks
 * — never sibling-leaf providers.
 */
export function userFacingCircuitOpenMessage(input: {
  readonly candidateCount: number;
  readonly eligibleRemaining?: number;
}): string {
  if (
    input.candidateCount > 1 &&
    (input.eligibleRemaining === undefined || input.eligibleRemaining > 0)
  ) {
    return "AI providers are temporarily cooling down after recent failures. Wait about 30 seconds, then retry — we will try alternate models automatically.";
  }
  if (input.candidateCount > 1 && input.eligibleRemaining === 0) {
    return "All eligible AI providers are temporarily unavailable. Please retry shortly.";
  }
  return "The selected provider is temporarily cooling down after recent failures. Wait about 30 seconds, then retry.";
}

export const ALL_PROVIDERS_COOLING_DOWN_CODE = "ALL_PROVIDERS_COOLING_DOWN";

export function allProvidersCoolingDownMessage(): string {
  return "All eligible AI providers are temporarily unavailable. Please retry shortly.";
}

export function userFacingProviderFailureMessage(input: {
  readonly category: string;
  readonly candidateCount: number;
  readonly eligibleRemaining?: number;
  readonly originalMessage?: string;
}): string {
  switch (input.category) {
    case "quota":
      return "Provider quota or credits are exhausted. Check billing for this provider, then retry.";
    case "rate_limit":
      return "Provider rate limit reached. Wait briefly, then retry.";
    case "authentication":
      return "Provider authentication failed. Check API credentials, then retry.";
    case "unavailable":
      return "Provider service is temporarily unavailable. Retry shortly.";
    case "timeout":
      return "Provider request timed out. Retry shortly.";
    case "structured_output_invalid":
    case "contract_validation_failure":
      return STRUCTURED_CONTRACT_USER_MESSAGE;
    case "circuit_open":
      return userFacingCircuitOpenMessage({
        candidateCount: input.candidateCount,
        eligibleRemaining: input.eligibleRemaining,
      });
    default: {
      if (
        isStructuredContractFailure({
          failureCategory: input.category,
          message: input.originalMessage,
        })
      ) {
        return STRUCTURED_CONTRACT_USER_MESSAGE;
      }
      const original = input.originalMessage?.trim();
      if (
        original &&
        !isCircuitOpenFailureMessage(original) &&
        original.toLowerCase() !== "provider execution failed"
      ) {
        return original;
      }
      return "The selected provider could not generate this creative.";
    }
  }
}

/**
 * Stamp the Direct candidate/failover loop winner onto ProviderExecutionResult.
 * Same identity semantics as FailoverOrchestrator.wrapOutcome:
 * final* always comes from the winning candidate — never from routed primary.
 */
export function stampDirectWinnerIdentity(input: {
  readonly result: ProviderExecutionResult;
  readonly attemptHistory: readonly ProviderAttemptHistoryEntry[];
  readonly winner: { readonly providerId: string; readonly modelId: string };
}): ProviderExecutionResult {
  const failoverCount = input.attemptHistory.filter(
    (a) => a.primaryOrFailover === "failover",
  ).length;
  const primary = input.attemptHistory.find((a) => a.primaryOrFailover === "primary");
  const fallbackDiagnostics =
    failoverCount > 0 && primary
      ? {
          primaryProvider: primary.providerId,
          primaryModel: primary.modelId,
          primaryFailure: primary.success
            ? undefined
            : primary.failureCategory !== "none"
              ? primary.failureCategory
              : primary.errorMessage,
          fallbackProvider: input.winner.providerId,
          fallbackModel: input.winner.modelId,
          fallbackReason: primary.success
            ? "provider_failover"
            : primary.failureCategory || "provider_failover",
          fallbackEligible: true,
          fallbackCircuitState: input.attemptHistory.find(
            (a) =>
              a.providerId === input.winner.providerId &&
              a.modelId === input.winner.modelId,
          )?.circuitStateBefore,
        }
      : undefined;
  if (fallbackDiagnostics) {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "provider.failover",
        event: "fallback_diagnostics",
        ...fallbackDiagnostics,
        requestId: input.result.requestId,
      }),
    );
  }
  return {
    ...input.result,
    attemptHistory: input.attemptHistory,
    finalProviderId: input.winner.providerId,
    finalModelId: input.winner.modelId,
    failoverCount,
    ...(fallbackDiagnostics ? { fallbackDiagnostics } : {}),
  };
}

function classifyDirectAttemptFailure(
  message: string | undefined,
  errorCode?: string,
): string {
  // Reuse the canonical failover taxonomy — do not invent a second one.
  return classifyExecutionFailure({
    message,
    error: errorCode
      ? { code: errorCode, message: message ?? "" }
      : message
        ? { code: "PROVIDER_ERROR", message }
        : undefined,
  });
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
  const cmr =
    request.canonicalModelRequest ??
    resolveCanonicalModelRequestFromCarrier(meta as Record<string, unknown>);
  const basePayload: Record<string, unknown> = {
    prompt: promptText,
    text: promptText,
    input: promptText,
  };
  if (cmr) {
    // Structured request travels with the payload; string fields already
    // projected by Model Runtime (Phase 11) earlier in DirectEngine.run.
    basePayload.canonicalModelRequest = cmr;
    basePayload.canonicalModelRequestApplied = true;
    if (meta.flattenedByProvider === true) {
      basePayload.flattenedByProvider = true;
    }
    if (meta.modelRuntimeApplied === true) {
      basePayload.modelRuntimeApplied = true;
      basePayload.modelRuntimeSource = meta.modelRuntimeSource;
      basePayload.modelRuntimeRepresentationStrategy =
        meta.modelRuntimeRepresentationStrategy;
    }
  }
  const base = sampleRequest({
    requestId: `${request.requestId}_rt`,
    providerId: String(providerId),
    payload: basePayload,
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

    let stampedMetadata: Record<string, unknown> = {
      ...stampDirectCreateMetadata(request.metadata),
    };

    // Phase 11 — provider-neutral Model Runtime boundary (representation only).
    const cmr: CanonicalModelRequest | undefined =
      request.canonicalModelRequest ??
      resolveCanonicalModelRequestFromCarrier(stampedMetadata);
    let workingPrompt = request.rawPrompt ?? "";
    const skipPostCmrAppends = Boolean(cmr);

    if (cmr) {
      const prepared = prepareCanonicalModelRuntime({
        modelRequest: cmr,
        metadata: stampedMetadata,
        executionId:
          typeof stampedMetadata.apiExecutionId === "string"
            ? stampedMetadata.apiExecutionId
            : typeof stampedMetadata.executionId === "string"
              ? stampedMetadata.executionId
              : request.requestId,
        correlationId:
          typeof stampedMetadata.correlationId === "string"
            ? stampedMetadata.correlationId
            : request.correlationId,
        providerId:
          typeof stampedMetadata.providerId === "string"
            ? stampedMetadata.providerId
            : typeof stampedMetadata.preferredProviderId === "string"
              ? stampedMetadata.preferredProviderId
              : undefined,
        modelId:
          typeof stampedMetadata.modelId === "string"
            ? stampedMetadata.modelId
            : typeof stampedMetadata.preferredModelId === "string"
              ? stampedMetadata.preferredModelId
              : undefined,
      });
      if (!prepared.ok) {
        return failure(
          new ValidationError(prepared.message, {
            reason: prepared.code,
            capabilityAssessmentApplied: true,
            requiredUnrepresentableCount:
              prepared.plan.requiredUnrepresentableCount,
            capabilityStatuses: prepared.plan.capabilityStatuses,
          }),
        );
      }
      workingPrompt = prepared.prompt;
      stampedMetadata = {
        ...stampedMetadata,
        ...prepared.metadataStamps,
      };
    } else if (
      workingPrompt.trim() === CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER
    ) {
      return failure(
        new ValidationError(
          "canonicalModelRequest metadata required when using canonical prompt placeholder",
        ),
      );
    }

    if (!workingPrompt?.trim()) {
      return failure(new ValidationError("rawPrompt is required"));
    }

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

    let finalProviderPrompt = workingPrompt;
    if (skipPostCmrAppends) {
      // Phase 5 — CMR already contains Production Spec + output requirements.
      // Stamp Spec binding metadata only; still project ExecutionSpec HARD
      // constraints onto the wire (CMR Requirement Engine plane ≠ CTI Spec).
      const metaOnly = applyProductionSpecInstructToMetadata(stampedMetadata, {
        force: true,
      });
      stampedMetadata = { ...stampedMetadata, ...metaOnly.metadata };
      const {
        mergeHardConstraintsIntoProviderPrompt,
      } = await import("../cdf/generation-context/provider-requirement-projection");
      const merged = mergeHardConstraintsIntoProviderPrompt({
        prompt: workingPrompt,
        metadata: stampedMetadata,
        executionSpec,
      });
      finalProviderPrompt = merged.prompt;
      if (merged.projection.hardConstraintCount > 0) {
        stampedMetadata = {
          ...stampedMetadata,
          executionSpecConstraintHash:
            merged.projection.executionSpecConstraintHash,
          canonicalModelRequestConstraintHash:
            merged.projection.canonicalModelRequestConstraintHash,
          providerWireConstraintHash:
            merged.projection.providerWireConstraintHash,
          hardConstraintsSurvivedToWire:
            merged.projection.hardConstraintsSurvivedToWire,
          ...(merged.projection.representationFailure
            ? {
                providerRequirementRepresentationFailure:
                  merged.projection.representationFailure,
              }
            : {}),
        };
      }
    } else {
      const productionInstruct = ensureProviderPromptHasProductionSpec({
        prompt: workingPrompt,
        metadata: stampedMetadata,
      });
      stampedMetadata = {
        ...stampedMetadata,
        ...productionInstruct.metadata,
      };

      // Phase 5 (legacy) — do not spend provider budget on unconfirmed R/H placements.
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

      finalProviderPrompt = appendOutputRequirementsToPrompt({
        prompt: productionInstruct.prompt,
        metadata: stampedMetadata,
      });
    }

    // Pregen hold still applies on canonical path (metadata / binding only).
    if (skipPostCmrAppends) {
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
      prompt: finalProviderPrompt,
    });
    let providerRequest: DirectExecutionRequest = {
      ...request,
      rawPrompt: finalProviderPrompt,
      ...(cmr ? { canonicalModelRequest: cmr } : {}),
      metadata: stampedMetadata,
    };

    const bag = buildDirectProviderBag(providerRequest) as IntegrationArtifactBag;

    // Phase 12 — after existing provider selection, re-assess CMR representation
    // for the selected provider (no second selector; fail if required unrepresentable).
    if (cmr) {
      const selectedProviderId = String(
        bag.routing?.plan?.primary?.providerId ?? "",
      );
      const selectedModelId = bag.routing?.plan?.primary?.modelId
        ? String(bag.routing.plan.primary.modelId)
        : undefined;
      if (selectedProviderId) {
        const selectedPlan = buildProviderRepresentationPlan({
          modelRequest: cmr,
          providerId: selectedProviderId,
          modelId: selectedModelId,
        });
        stampedMetadata = {
          ...stampedMetadata,
          ...summarizeRepresentationPlan(selectedPlan),
          modelRuntimeSelectedProviderId: selectedProviderId,
          ...(selectedModelId
            ? { modelRuntimeSelectedModelId: selectedModelId }
            : {}),
        };
        providerRequest = {
          ...providerRequest,
          metadata: stampedMetadata,
        };
        if (selectedPlan.requiredUnrepresentableCount > 0) {
          return failure(
            new ValidationError(
              `Required CMR context cannot be represented for selected provider ${selectedProviderId}`,
              {
                reason: "REQUIRED_BUT_UNREPRESENTABLE",
                capabilityAssessmentApplied: true,
                providerId: selectedProviderId,
                requiredUnrepresentableCount:
                  selectedPlan.requiredUnrepresentableCount,
                capabilityStatuses: selectedPlan.capabilityStatuses,
              },
            ),
          );
        }
      }
    }

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

    // Framework invariant: canonical + structured → schema before provider, or fail closed.
    const structuredSchemaGate =
      assertCanonicalStructuredSchemaBeforeProvider(stampedMetadata);
    if (!structuredSchemaGate.ok) {
      return failure(structuredSchemaGate.error);
    }

    if (!structuredOutput && presentationDeliverableRequired) {
      return failure(
        new ValidationError(
          `Presentation deliverable requires structured output schema before provider | requestId=${request.requestId}`,
          {
            reason: "PRESENTATION_STRUCTURED_SCHEMA_REQUIRED",
            requestId: request.requestId,
          },
        ),
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
    const imageFailover = parseImageFailoverChain(request.metadata);
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
      // Prefer vendor-diverse text failover from prepass; never reuse the
      // image-leaf 2-slot parser (it starved Gemini behind two Anthropic models).
      // If metadata.failoverChain is explicitly present (even empty), honor it —
      // do not silently expand to the general matrix (breaks single-candidate tests).
      const rawFailover = request.metadata?.failoverChain;
      if (Array.isArray(rawFailover)) {
        textFailover = [
          ...parseTextFailoverChain(request.metadata, primaryCandidate),
        ];
      } else {
        textFailover = [
          ...generalTextFailoverChain(primaryCandidate, textUseCase),
        ];
      }
    }
    const candidates: { providerId: string; modelId: string }[] = isImage
      ? [primaryCandidate, ...imageFailover]
      : [primaryCandidate, ...textFailover];
    const seen = new Set<string>();
    let uniqueCandidates = candidates.filter((c) => {
      const key = `${c.providerId}::${c.modelId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // One authoritative model identity: candidates carry the model that will
    // actually be dispatched (executable remap), so attempt history, winner,
    // fallback diagnostics and actualModel all agree with the wire request.
    {
      const executedSeen = new Set<string>();
      uniqueCandidates = uniqueCandidates
        .map((c) => ({
          ...c,
          modelId: resolveExecutedModelIdentity(c.providerId, c.modelId),
        }))
        .filter((c) => {
          const key = `${c.providerId}::${c.modelId}`;
          if (executedSeen.has(key)) return false;
          executedSeen.add(key);
          return true;
        });
    }

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

    // Routing contract: a required provider pin never substitutes another
    // provider (same-provider model alternates remain eligible).
    const pinApplied = applyProviderPinPolicy(uniqueCandidates, stampedMetadata);
    if (pinApplied.pinnedProviderId) {
      uniqueCandidates = [...pinApplied.candidates];
      if (pinApplied.removed.length > 0) {
        // eslint-disable-next-line no-console
        console.info(
          JSON.stringify({
            scope: "provider.routing",
            event: "provider_pin_required",
            pinnedProviderId: pinApplied.pinnedProviderId,
            excludedCandidates: pinApplied.removed.map(
              (c) => `${c.providerId}/${c.modelId}`,
            ),
            requestId: request.requestId,
          }),
        );
      }
      if (uniqueCandidates.length === 0) {
        return failure(
          new ValidationError(
            `Required provider pin '${pinApplied.pinnedProviderId}' has no eligible candidate — no provider substitution is permitted`,
            {
              reason: "provider_pin_unavailable",
              pinnedProviderId: pinApplied.pinnedProviderId,
            },
          ),
        );
      }
    }

    let result: Result<ProviderExecutionResult> | undefined;
    let authoritativeContractValid: Result<ProviderExecutionResult> | undefined;
    let winnerCandidate: { providerId: string; modelId: string } | undefined;
    const attemptHistory: ProviderAttemptHistoryEntry[] = [];
    let execMs = 0;
    let lastFailureMessage = "Provider execution failed";
    // Provider-wide circuit breaker (cooling) vs per-model rate-limit skip
    // vs provider-wide credit/quota skip for the rest of this execution.
    const circuitOpenProviders = new Set<string>();
    const rateLimitedCandidateKeys = new Set<string>();
    const quotaExhaustedProviders = new Set<string>();

    for (let candidateIndex = 0; candidateIndex < uniqueCandidates.length; candidateIndex++) {
      const candidate = uniqueCandidates[candidateIndex]!;
      const candidateKey = `${candidate.providerId}::${candidate.modelId}`;
      const runtimeCircuitOpen = !this.deps.runtime.canDispatchToProvider(
        candidate.providerId,
      );
      if (
        circuitOpenProviders.has(candidate.providerId) ||
        runtimeCircuitOpen ||
        rateLimitedCandidateKeys.has(candidateKey) ||
        quotaExhaustedProviders.has(candidate.providerId)
      ) {
        if (runtimeCircuitOpen) {
          circuitOpenProviders.add(candidate.providerId);
        }
        const now = this.nowIso();
        const skipReason = quotaExhaustedProviders.has(candidate.providerId)
          ? "quota_exhausted_provider"
          : rateLimitedCandidateKeys.has(candidateKey)
            ? "rate_limited_candidate"
            : "circuit_open";
        // eslint-disable-next-line no-console
        console.info(
          JSON.stringify({
            scope: "provider.failover",
            event: "skip_ineligible_candidate",
            reason: skipReason,
            providerId: candidate.providerId,
            modelId: candidate.modelId,
            capability: primaryCap,
            circuitStateBefore: runtimeCircuitOpen ? "open" : "closed_or_local",
            requestId: request.requestId,
            executionId:
              typeof stampedMetadata?.apiExecutionId === "string"
                ? stampedMetadata.apiExecutionId
                : typeof stampedMetadata?.executionId === "string"
                  ? stampedMetadata.executionId
                  : request.requestId,
            correlationId,
          }),
        );
        attemptHistory.push({
          attemptId: `direct_attempt_${candidateIndex}_skipped`,
          positionInRoute: candidateIndex,
          primaryOrFailover: candidateIndex === 0 ? "primary" : "failover",
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          success: false,
          failureCategory:
            skipReason === "quota_exhausted_provider"
              ? "quota"
              : skipReason === "rate_limited_candidate"
                ? "rate_limit"
                : "circuit_open",
          latencyMs: 0,
          durationMs: 0,
          startedAt: now,
          completedAt: now,
          status: "failed",
          errorCode:
            skipReason === "quota_exhausted_provider"
              ? "QUOTA_EXHAUSTED"
              : skipReason === "rate_limited_candidate"
                ? "RATE_LIMIT"
                : "CIRCUIT_OPEN",
          errorMessage:
            skipReason === "quota_exhausted_provider"
              ? "candidate skipped — provider credits exhausted earlier in this execution"
              : skipReason === "rate_limited_candidate"
                ? "candidate skipped — model rate-limited earlier in this execution"
                : "circuit breaker is open — skipped before execution",
          circuitStateBefore: runtimeCircuitOpen ? "open" : "closed",
          circuitStateAfter: runtimeCircuitOpen ? "open" : "closed",
        });
        lastFailureMessage =
          skipReason === "quota_exhausted_provider"
            ? "Provider quota or credits are exhausted. Check billing for this provider, then retry."
            : skipReason === "rate_limited_candidate"
              ? "Provider rate limit reached. Wait briefly, then retry."
              : "circuit breaker is open";
        continue;
      }
      // A prior provider already produced a contract-valid structured completion.
      // Never continue failover or let later errors overwrite that result.
      if (authoritativeContractValid) {
        break;
      }
      const primaryOrFailover: "primary" | "failover" =
        candidateIndex === 0 ? "primary" : "failover";
      const attemptStartedAt = this.nowIso();
      const execReq = toProviderExecutionRequest(providerRequest, bag, candidate);
      // Phase 3 — provider-boundary proof for canonical CDF context (privacy-safe).
      try {
        const promptText = String(
          execReq.payload?.prompt ??
            execReq.payload?.text ??
            execReq.payload?.input ??
            providerRequest.rawPrompt ??
            "",
        );
        emitCanonicalProviderBoundaryTrace({
          prompt: promptText,
          metadata: stampedMetadata,
          executionId:
            typeof stampedMetadata?.apiExecutionId === "string"
              ? stampedMetadata.apiExecutionId
              : typeof stampedMetadata?.executionId === "string"
                ? stampedMetadata.executionId
                : request.requestId,
          correlationId: correlationId,
          providerId: String(candidate.providerId),
          modelId: String(candidate.modelId),
          payloadKeys: Object.keys(execReq.payload ?? {}),
        });
      } catch {
        // Observability must never block provider dispatch.
      }
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
          providerCapability: resolveSelectedImageOperationCapability({
            providerId: String(candidate.providerId),
            referenceImageAttached: Boolean(refImage),
            referenceInputPresent: stampedMetadata?.referenceInputPresent === true,
            visualOperationKind:
              typeof stampedMetadata?.visualOperationKind === "string"
                ? stampedMetadata.visualOperationKind
                : undefined,
            capabilityId: primaryCap,
          }),
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
          const now = this.nowIso();
          attemptHistory.push({
            attemptId: `direct_attempt_${candidateIndex}`,
            positionInRoute: candidateIndex,
            primaryOrFailover,
            providerId: candidate.providerId,
            modelId: candidate.modelId,
            success: false,
            failureCategory: "unsupported_capability",
            latencyMs: 0,
            startedAt: attemptStartedAt,
            completedAt: now,
            status: "failed",
            errorMessage: lastFailureMessage.slice(0, 240),
          });
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
      const attemptCompletedAt = this.nowIso();
      if (!result) {
        lastFailureMessage = "Provider execution returned no result";
        continue;
      }
      const attemptResult = result;
      const circuitBeforeSnap = this.deps.runtime
        .getCircuitBreakerSnapshots()
        .find((s) => String(s.providerId) === candidate.providerId);
      const circuitStateBefore = circuitBeforeSnap?.state ?? "closed";
      const pushAttempt = (entry: {
        readonly success: boolean;
        readonly failureCategory: string;
        readonly status: string;
        readonly errorCode?: string;
        readonly errorMessage?: string;
        readonly httpStatus?: number;
        readonly providerErrorCode?: string;
      }) => {
        const circuitAfterSnap = this.deps.runtime
          .getCircuitBreakerSnapshots()
          .find((s) => String(s.providerId) === candidate.providerId);
        attemptHistory.push({
          attemptId: `direct_attempt_${candidateIndex}`,
          positionInRoute: candidateIndex,
          primaryOrFailover,
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          success: entry.success,
          failureCategory: entry.failureCategory,
          latencyMs: execMs,
          durationMs: execMs,
          startedAt: attemptStartedAt,
          completedAt: attemptCompletedAt,
          status: entry.status,
          errorCode: entry.errorCode,
          errorMessage: entry.errorMessage?.slice(0, 240),
          httpStatus: entry.httpStatus,
          providerErrorCode: entry.providerErrorCode,
          circuitStateBefore,
          circuitStateAfter: circuitAfterSnap?.state ?? circuitStateBefore,
        });
      };

      if (!attemptResult.ok) {
        lastFailureMessage = String(attemptResult.error.message);
        const errMeta =
          attemptResult.error &&
          typeof attemptResult.error === "object" &&
          "metadata" in attemptResult.error
            ? ((attemptResult.error as { metadata?: Record<string, unknown> })
                .metadata ?? {})
            : {};
        const transportProviderCode =
          typeof errMeta.providerErrorCode === "string"
            ? errMeta.providerErrorCode
            : typeof (attemptResult.error as { providerErrorCode?: string })
                  ?.providerErrorCode === "string"
              ? (attemptResult.error as { providerErrorCode?: string })
                  .providerErrorCode
              : undefined;
        const failCat = classifyExecutionFailure({
          message: lastFailureMessage,
          error: {
            code: "PROVIDER_ERROR",
            message: lastFailureMessage,
            ...(transportProviderCode
              ? { providerErrorCode: transportProviderCode }
              : {}),
            ...(typeof errMeta.httpStatus === "number"
              ? { httpStatus: errMeta.httpStatus }
              : {}),
          },
        });
        pushAttempt({
          success: false,
          failureCategory: failCat,
          status: "failed",
          errorMessage: lastFailureMessage,
          providerErrorCode: transportProviderCode,
          httpStatus:
            typeof errMeta.httpStatus === "number"
              ? errMeta.httpStatus
              : undefined,
        });
        if (isCircuitOpenFailureMessage(lastFailureMessage)) {
          // Local skip state for subsequent candidates of THIS execution only.
          circuitOpenProviders.add(candidate.providerId);
        } else if (
          isQuotaExhaustionFailure({
            failureCategory: failCat,
            providerErrorCode: transportProviderCode,
            message: lastFailureMessage,
          })
        ) {
          quotaExhaustedProviders.add(candidate.providerId);
        } else if (
          failCat === "rate_limit" ||
          isRateLimitFailureMessage(lastFailureMessage)
        ) {
          // Per-model only — preserve same-provider model fallback inside a leaf.
          // Quota exhaustion must NOT land here (classified as quota above).
          rateLimitedCandidateKeys.add(
            `${candidate.providerId}::${candidate.modelId}`,
          );
        }
        // HTTP/transport failure only triggers failover when no contract-valid
        // completion has already been produced.
        if (authoritativeContractValid) {
          result = authoritativeContractValid;
          break;
        }
        continue;
      }
      if (attemptResult.value.success === false) {
        const errCode = String(attemptResult.value.error?.code ?? "");
        lastFailureMessage =
          attemptResult.value.error?.message ?? "Provider execution failed";
        const failCat = classifyExecutionFailure({
          error: attemptResult.value.error,
          message: lastFailureMessage,
          httpStatus: attemptResult.value.error?.httpStatus,
        });
        pushAttempt({
          success: false,
          failureCategory: failCat,
          status: attemptResult.value.status ?? "failed",
          errorCode: attemptResult.value.error?.code,
          errorMessage: lastFailureMessage,
          httpStatus: attemptResult.value.error?.httpStatus,
          providerErrorCode: attemptResult.value.error?.providerErrorCode,
        });
        if (isCircuitOpenFailureMessage(lastFailureMessage)) {
          circuitOpenProviders.add(candidate.providerId);
        } else if (
          isQuotaExhaustionFailure({
            failureCategory: failCat,
            providerErrorCode: attemptResult.value.error?.providerErrorCode,
            message: lastFailureMessage,
          })
        ) {
          quotaExhaustedProviders.add(candidate.providerId);
        } else if (isRateLimitFailureMessage(lastFailureMessage)) {
          rateLimitedCandidateKeys.add(
            `${candidate.providerId}::${candidate.modelId}`,
          );
        }
        // Concepts may have succeeded — do not re-run the whole pipeline on Mistral etc.
        if (
          presentationDeliverableRequired &&
          isPresentationExpansionFailure(attemptResult.value)
        ) {
          lastFailureMessage =
            "Pitch deck slide expansion failed. Please try again — your concepts were generated but full slides could not be built.";
          break;
        }
        // Side-effect block only — structured-contract invalidation must continue.
        if (providerResultBlocksFailover(attemptResult.value)) {
          // eslint-disable-next-line no-console
          console.info(
            JSON.stringify({
              scope: "provider.failover",
              event: "stop_on_structured_side_effect_block",
              schemaName: structuredOutput?.name ?? null,
              errorCode: errCode || null,
              providerId: String(candidate.providerId),
              modelId: String(candidate.modelId),
              requestId: request.requestId,
            }),
          );
          break;
        }
        // STRUCTURED_OUTPUT_INVALID (and peers) are provider-attempt failures —
        // continue to the next declared failover candidate with the SAME schema.
        if (
          structuredOutput &&
          (errCode === "STRUCTURED_OUTPUT_INVALID" ||
            errCode === "STRUCTURED_OUTPUT_TRUNCATED")
        ) {
          // eslint-disable-next-line no-console
          console.info(
            JSON.stringify({
              scope: "provider.failover",
              event: "continue_on_structured_schema_mismatch",
              schemaName: structuredOutput.name ?? null,
              errorCode: errCode || null,
              providerId: String(candidate.providerId),
              modelId: String(candidate.modelId),
              requestId: request.requestId,
            }),
          );
        }
        if (authoritativeContractValid) {
          result = authoritativeContractValid;
          break;
        }
        continue;
      }

      // Successful dispatch — keep `result` as the authoritative attempt Result.
      result = attemptResult;

      if (presentationDeliverableRequired && structuredOutput) {
        const expanded = await ensurePresentationExpandedForDeliverable({
          executed: attemptResult.value,
          structured: structuredOutput,
          providerRequest: execReq,
          nowIso: this.nowIso,
          reExecute: presentationReExecute(this.deps.runtime, structuredOutput),
        });
        if (!expanded.ok) {
          lastFailureMessage = expanded.error.message;
          pushAttempt({
            success: false,
            failureCategory: classifyDirectAttemptFailure(lastFailureMessage),
            status: "failed",
            errorMessage: lastFailureMessage,
          });
          continue;
        }
        if (expanded.value.success === false) {
          lastFailureMessage =
            expanded.value.error?.message ??
            "Presentation deck expansion failed";
          pushAttempt({
            success: false,
            failureCategory: classifyDirectAttemptFailure(lastFailureMessage),
            status: expanded.value.status ?? "failed",
            errorCode: expanded.value.error?.code,
            errorMessage: lastFailureMessage,
          });
          continue;
        }
        result = expanded;
      }

      const settled = result;
      if (!settled?.ok) {
        continue;
      }

      // Website code-gen must produce a valid WebProject for the chosen stack.
      // CDF sitemap / page-structure phases validate via structured contract only.
      if (
        requiresCompleteWebsiteDeliverable(request.metadata) &&
        !providerResultHasCompleteWebsite(settled.value, request.metadata)
      ) {
        const stack = websiteContextFromMetadata(request.metadata, "").stack;
        lastFailureMessage = websiteIncompleteErrorMessage(stack);
        pushAttempt({
          success: false,
          failureCategory: "invalid_request",
          status: "failed",
          errorMessage: lastFailureMessage,
        });
        continue;
      }

      // Structured-output contract: only a validated structured completion is
      // terminal. Invalid emission against the same schema may failover to the
      // next declared candidate — schema identity is preserved (never weakened).
      if (structuredOutput) {
        if (
          providerResultSatisfiesStructuredContract(
            settled.value,
            structuredOutput
          )
        ) {
          pushAttempt({
            success: true,
            failureCategory: "none",
            status: settled.value.status ?? "succeeded",
          });
          authoritativeContractValid = settled;
          winnerCandidate = {
            providerId: candidate.providerId,
            modelId: candidate.modelId,
          };
          // Only after schema-valid structured completion — never on
          // STRUCTURED_OUTPUT_INVALID / array-vs-object mismatches.
          // eslint-disable-next-line no-console
          console.info(
            JSON.stringify({
              scope: "provider.failover",
              event: "stop_on_structured_contract",
              schemaName: structuredOutput.name ?? null,
              providerId: String(candidate.providerId),
              modelId: String(candidate.modelId),
              requestId: request.requestId,
              reason: "contract_satisfied",
            })
          );
          break;
        }
        const errCode = String(settled.value.error?.code ?? "");
        lastFailureMessage =
          settled.value.error?.message ??
          "Structured output contract was not satisfied";
        pushAttempt({
          success: false,
          failureCategory: "structured_output_invalid",
          status: "failed",
          errorCode: errCode || undefined,
          errorMessage: lastFailureMessage,
        });
        // Side-effect / paid-submit guards still block further failover.
        if (providerResultBlocksFailover(settled.value)) {
          // eslint-disable-next-line no-console
          console.info(
            JSON.stringify({
              scope: "provider.failover",
              event: "stop_on_structured_side_effect_block",
              schemaName: structuredOutput.name ?? null,
              errorCode: errCode || null,
              providerId: String(candidate.providerId),
              modelId: String(candidate.modelId),
              requestId: request.requestId,
            }),
          );
          break;
        }
        // eslint-disable-next-line no-console
        console.info(
          JSON.stringify({
            scope: "provider.failover",
            event: "continue_on_structured_schema_mismatch",
            schemaName: structuredOutput.name ?? null,
            errorCode: errCode || null,
            providerId: String(candidate.providerId),
            modelId: String(candidate.modelId),
            requestId: request.requestId,
          }),
        );
        continue;
      }

      // Unstructured text / image / video — preserve existing stop-on-success.
      pushAttempt({
        success: true,
        failureCategory: "none",
        status: settled.value.status ?? "succeeded",
      });
      winnerCandidate = {
        providerId: candidate.providerId,
        modelId: candidate.modelId,
      };
      break;
    }

    if (authoritativeContractValid) {
      result = authoritativeContractValid;
    }

    if (
      result?.ok &&
      result.value.success !== false &&
      winnerCandidate
    ) {
      result = success(
        stampDirectWinnerIdentity({
          result: result.value,
          attemptHistory,
          winner: winnerCandidate,
        }),
      );
    } else if (result?.ok && attemptHistory.length > 0) {
      // Terminal failure still carries attempt history for evidence.
      result = success({
        ...result.value,
        attemptHistory,
        finalProviderId:
          result.value.finalProviderId ??
          attemptHistory[attemptHistory.length - 1]?.providerId,
        finalModelId:
          result.value.finalModelId ??
          attemptHistory[attemptHistory.length - 1]?.modelId,
        failoverCount: attemptHistory.filter(
          (a) => a.primaryOrFailover === "failover",
        ).length,
      });
    } else if (
      !result &&
      attemptHistory.length > 0 &&
      !winnerCandidate
    ) {
      // All candidates skipped (circuit open / rate-limited) without a stamped
      // result — synthesize a typed terminal failure with history.
      const last = attemptHistory[attemptHistory.length - 1]!;
      const allCircuitOpen = attemptHistory.every(
        (a) => a.failureCategory === "circuit_open",
      );
      const snaps = this.deps.runtime.getCircuitBreakerSnapshots();
      const maxCooldown = snaps.reduce((max, s) => {
        if (s.state !== "open") return max;
        const openedMs = s.openedAtMs ?? (s.openedAt ? Date.parse(s.openedAt) : NaN);
        const reset = s.resetTimeoutMs ?? 30_000;
        if (!Number.isFinite(openedMs)) return Math.max(max, reset);
        return Math.max(max, Math.max(0, reset - (Date.now() - openedMs)));
      }, 0);
      const retryAfterMs = allCircuitOpen ? Math.max(maxCooldown, 1_000) : undefined;
      result = success({
        requestId: `${request.requestId}_rt`,
        sessionId: `direct_synth_${request.requestId}`,
        status: "failed",
        success: false,
        error: {
          code: allCircuitOpen
            ? ALL_PROVIDERS_COOLING_DOWN_CODE
            : last.errorCode ?? "PROVIDER_ERROR",
          message: allCircuitOpen
            ? allProvidersCoolingDownMessage()
            : lastFailureMessage,
          failureCategory: allCircuitOpen
            ? "circuit_open"
            : last.failureCategory,
          retryAfterMs,
        },
        statistics: {
          queueWaitMs: 0,
          dispatchMs: 0,
          executionMs: 0,
          streamingMs: 0,
          totalMs: execMs,
          attempts: attemptHistory.length,
          retries: 0,
          timeouts: 0,
          streamingChunks: 0,
        },
        completedAt: this.nowIso(),
        attemptHistory,
        finalProviderId: last.providerId,
        finalModelId: last.modelId,
        failoverCount: attemptHistory.filter(
          (a) => a.primaryOrFailover === "failover",
        ).length,
      });
      if (allCircuitOpen) {
        lastFailureMessage = allProvidersCoolingDownMessage();
      }
    }

    if (!result?.ok || result.value.success === false) {
      const historyCategory =
        attemptHistory.length > 0 &&
        attemptHistory.every((a) => a.failureCategory === "circuit_open")
          ? "circuit_open"
          : attemptHistory.length > 0
            ? attemptHistory[attemptHistory.length - 1]?.failureCategory
            : undefined;
      const category =
        historyCategory === "circuit_open" ||
        historyCategory === "rate_limit" ||
        historyCategory === "quota" ||
        historyCategory === "authentication" ||
        historyCategory === "unavailable" ||
        historyCategory === "timeout"
          ? historyCategory
          : classifyDirectAttemptFailure(
              lastFailureMessage,
              !result?.ok ? undefined : result.value.error?.code,
            );
      // Never collapse quota / rate-limit / auth into circuit "cooling down".
      // Circuit-open copy is only for genuine circuit_open category.
      const eligibleRemaining = uniqueCandidates.filter(
        (c) =>
          !circuitOpenProviders.has(c.providerId) &&
          !quotaExhaustedProviders.has(c.providerId) &&
          this.deps.runtime.canDispatchToProvider(c.providerId) &&
          !rateLimitedCandidateKeys.has(`${c.providerId}::${c.modelId}`),
      ).length;
      const allCoolingDown =
        category === "circuit_open" &&
        uniqueCandidates.length > 1 &&
        eligibleRemaining === 0;
      lastFailureMessage = allCoolingDown
        ? allProvidersCoolingDownMessage()
        : userFacingProviderFailureMessage({
            category,
            candidateCount: uniqueCandidates.length,
            eligibleRemaining,
            originalMessage: lastFailureMessage,
          });
      if (result?.ok && result.value.error) {
        const snaps = this.deps.runtime.getCircuitBreakerSnapshots();
        const maxCooldown = snaps.reduce((max, s) => {
          if (s.state !== "open") return max;
          const openedMs = s.openedAtMs ?? (s.openedAt ? Date.parse(s.openedAt) : NaN);
          const reset = s.resetTimeoutMs ?? 30_000;
          if (!Number.isFinite(openedMs)) return Math.max(max, reset);
          return Math.max(max, Math.max(0, reset - (Date.now() - openedMs)));
        }, 0);
        result = success({
          ...result.value,
          error: {
            ...result.value.error,
            code: allCoolingDown
              ? ALL_PROVIDERS_COOLING_DOWN_CODE
              : result.value.error.code,
            message: lastFailureMessage,
            failureCategory: category,
            ...(allCoolingDown
              ? { retryAfterMs: result.value.error.retryAfterMs ?? Math.max(maxCooldown, 1_000) }
              : {}),
          },
        });
      }
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

    try {
      const out = (result.value.response?.output ?? {}) as Record<
        string,
        unknown
      >;
      const structured = out.structured ?? out.structuredOutput ?? out.data;
      const keys =
        structured && typeof structured === "object" && !Array.isArray(structured)
          ? Object.keys(structured as object).slice(0, 24)
          : [];
      const meta = request.metadata ?? {};
      const executionId =
        typeof meta.apiExecutionId === "string"
          ? meta.apiExecutionId
          : typeof meta.executionId === "string"
            ? meta.executionId
            : request.requestId;
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          scope: "execution.structured_completion",
          event: "direct_execution_result",
          executionId,
          requestId: request.requestId,
          provider:
            result.value.finalProviderId ?? result.value.response?.providerId,
          model: result.value.finalModelId,
          resultKeys: Object.keys(out).slice(0, 24),
          structuredOutputPresent: out.structured != null,
          structuredPresent: out.structured != null,
          dataPresent: out.data != null,
          dataStructuredPresent:
            out.data != null &&
            typeof out.data === "object" &&
            !Array.isArray(out.data) &&
            (out.data as Record<string, unknown>).structured != null,
          textPresent:
            typeof out.content === "string" || typeof out.text === "string",
          mediaPresent: Array.isArray(out.outputs) && out.outputs.length > 0,
          structuredKeyCount: keys.length,
          structuredKeys: keys,
          ts: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore
    }

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
