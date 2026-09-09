/**
 * Admin billing & analytics — aggregates revenue, AI provider costs, and route stats
 * for super-admin / admin dashboards.
 */

import mongoose from "mongoose";
import Invoices from "../../../models/invoices.model";
import Projects from "../../../models/projects.model";
import Requirement from "../../../models/requestProject.model";
import Tasks from "../../../models/tasks.model";
import Organizations from "../../../models/organization.model";
import Users from "../../../models/users.model";
import StripeCustomers from "../../../models/customer.model";
import Subscriptions from "../../../models/subscription.model";
import Teams from "../../../models/team.model";
import { PlansModel } from "../../../models/plan.model";
import { EnterpriseExecution } from "../../infrastructure/durability/mongo/models/enterprise-execution.model";
import { EnterpriseExecutionExtras } from "../../infrastructure/durability/mongo/models/enterprise-execution-extras.model";
import { createModelRegistryPlatform } from "../../model-registry/factories/create-model-registry-platform";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import {
  adminCacheKey,
  readAdminCache,
  writeAdminCache,
} from "./admin-metrics-cache";
import {
  type AdminDemoExclusions,
  isDemoCustomerUserId,
  isDemoOrganizationId,
  isDemoTitle,
  loadAdminDemoExclusions,
} from "./admin-demo-filter";
import { sumLedgerAiCostByMonth, sumLedgerAiCostUsd } from "./admin-ai-cost-ledger";

export type RouteBucket = "ai" | "hybrid" | "human";

export type RouteVolumePoint = {
  week: string;
  ai: number;
  hybrid: number;
  human: number;
};

export type MonthlyTrendPoint = {
  month: string;
  revenue: number;
  totalCost: number;
  humanCost: number;
  aiCost: number;
};

export type ProviderCostBreakdown = {
  providerId: string;
  amount: number;
  executions: number;
};

export type OrgBillingRow = {
  organizationId: string;
  customerUserId?: string;
  organizationName?: string;
  revenue: number;
  aiCost: number;
  humanCost: number;
  executions: number;
};

export type AdminBillingSummary = {
  organizationId?: string;
  period: string;
  currency: string;
  revenue: number;
  totalCost: number;
  humanCost: number;
  aiCost: number;
  profit: number;
  profitMargin?: number;
  monthlyTrend: MonthlyTrendPoint[];
  costByProvider: ProviderCostBreakdown[];
  byOrganization: OrgBillingRow[];
  liveInternalSpendUsd?: number | null;
  pendingSpendUsd?: number | null;
  projectedSpendUsd?: number | null;
  projectionStatus?: string | null;
  lastUsageUpdateAt?: string | null;
  lastProviderReconciliationAt?: string | null;
  providerDataThrough?: string | null;
};

export type StatusBreakdownItem = {
  label: string;
  value: number;
  color: string;
};

export type AdminAnalyticsSummary = {
  executions: number;
  cost: number;
  revenue?: number;
  totalRequests: number;
  aiConversionRate: number;
  slaCompliance?: number;
  openEscalations: number;
  routeVolumeByPeriod: Record<string, RouteVolumePoint[]>;
  statusBreakdown: StatusBreakdownItem[];
  aiExecutions: number;
  hybridRequests: number;
  humanRequests: number;
  liveInternalSpendUsd?: number | null;
  pendingSpendUsd?: number | null;
  projectedSpendUsd?: number | null;
  projectionStatus?: string | null;
  lastUsageUpdateAt?: string | null;
};

export type AdminMetricsFilter = {
  organizationId?: string;
  crossTenant: boolean;
  period?: string;
};

const HUMAN_TASK_COST_INR = Number(
  process.env.ADMIN_HUMAN_TASK_COST_INR ??
    process.env.ADMIN_HUMAN_TASK_COST_USD ??
    4200
);
const HYBRID_TASK_COST_INR = Number(
  process.env.ADMIN_HYBRID_TASK_COST_INR ??
    process.env.ADMIN_HYBRID_TASK_COST_USD ??
    2100
);
const DEFAULT_CURRENCY = "USD";
const BILLING_TZ_OFFSET_MS =
  Number(process.env.ADMIN_BILLING_TZ_OFFSET_MINUTES ?? 330) * 60_000;

const PROVIDER_ID_TO_VENDOR: Record<string, string> = {
  "provider.openai": "openai",
  "provider.anthropic": "anthropic",
  "provider.gemini": "gemini",
  "provider.google": "google",
  "provider.ideogram": "ideogram",
  "provider.blackforestlabs": "blackforestlabs",
  "provider.minimax": "minimax",
  "provider.runway": "runway",
  "provider.kling": "kling",
  "provider.luma": "luma",
  "provider.pixverse": "pixverse",
  "provider.groq": "groq",
  "provider.deepseek": "deepseek",
  "provider.mistral": "mistral",
  "provider.xai": "xai",
  "provider.meta": "meta",
};

const CAPABILITY_DEFAULT_USD: Record<string, number> = {
  "image.generate": Number(process.env.ADMIN_IMAGE_EXEC_COST_USD ?? 0.04),
  "text.generate": Number(process.env.ADMIN_TEXT_EXEC_COST_USD ?? 0.003),
  "video.generate": Number(process.env.ADMIN_VIDEO_EXEC_COST_USD ?? 0.25),
  "embedding.generate": Number(process.env.ADMIN_EMBED_EXEC_COST_USD ?? 0.0002),
};

const DEFAULT_TEXT_TOKEN_ESTIMATE = Number(process.env.ADMIN_TEXT_TOKEN_ESTIMATE ?? 1200);

let modelRegistryPlatform: ReturnType<typeof createModelRegistryPlatform> | null = null;

function pricingPlatform() {
  if (!modelRegistryPlatform) {
    modelRegistryPlatform = createModelRegistryPlatform();
  }
  return modelRegistryPlatform;
}

function isPlaceholderCost(amount: number | null): boolean {
  return false;
}

function inferCapabilityId(
  exec: {
    capabilityId?: string;
    artifactIds?: string[];
    executionMode?: string;
  },
  extras?: {
    experience?: unknown;
    diagnostics?: Record<string, unknown>;
  } | null
): string | undefined {
  if (exec.capabilityId) return exec.capabilityId;

  const mode = String(exec.executionMode ?? "").toLowerCase();
  if (mode.includes("image")) return "image.generate";
  if (mode.includes("video")) return "video.generate";
  if (mode.includes("embed")) return "embedding.generate";

  if (Array.isArray(exec.artifactIds) && exec.artifactIds.length > 0) {
    return "image.generate";
  }

  const experience = extras?.experience;
  if (experience && typeof experience === "object") {
    const record = experience as Record<string, unknown>;
    const modality = String(record.modality ?? record.outputType ?? record.type ?? "").toLowerCase();
    if (modality.includes("image")) return "image.generate";
    if (modality.includes("video")) return "video.generate";
    if (modality.includes("embed")) return "embedding.generate";
  }

  const totalTokens = finiteCost(extras?.diagnostics?.totalTokens);
  if (totalTokens != null && totalTokens > 0) return "text.generate";

  return undefined;
}

function inferVendorFromModel(model: string): string | null {
  const value = model.trim().toLowerCase();
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  const bare = slash >= 0 ? value.slice(slash + 1) : value;
  if (value.includes("claude") || value.includes("anthropic")) return "anthropic";
  if (
    bare.startsWith("gpt") ||
    bare.startsWith("o1") ||
    bare.startsWith("o3") ||
    bare.startsWith("o4") ||
    bare.includes("dall-e")
  ) {
    return "openai";
  }
  if (bare.includes("gemini") || bare.includes("veo") || bare.includes("imagen")) return "google";
  if (bare.includes("ideogram")) return "ideogram";
  if (bare.includes("flux")) return "blackforestlabs";
  if (bare.includes("hailuo") || bare.includes("minimax")) return "minimax";
  if (bare.includes("grok")) return "xai";
  if (bare.includes("llama") || bare.includes("mixtral")) return "groq";
  if (bare.includes("deepseek")) return "deepseek";
  if (bare.includes("mistral")) return "mistral";
  if (bare.includes("runway")) return "runway";
  if (bare.includes("kling")) return "kling";
  if (bare.includes("luma")) return "luma";
  if (bare.includes("pixverse")) return "pixverse";
  if (bare.includes("seedance")) return "minimax";
  return null;
}

function vendorToProviderId(vendor: string): string {
  const normalized = vendor.trim().toLowerCase();
  for (const [providerId, mappedVendor] of Object.entries(PROVIDER_ID_TO_VENDOR)) {
    if (mappedVendor === normalized) return providerId;
  }
  return `provider.${normalized}`;
}

function inferProviderIdFromModel(model?: unknown): string | null {
  const vendor = inferVendorFromModel(String(model ?? ""));
  return vendor ? vendorToProviderId(vendor) : null;
}

function providersCompatible(providerA?: unknown, providerB?: unknown): boolean {
  const left = providerVendor(providerA);
  const right = providerVendor(providerB);
  if (!left || !right) return true;
  return left === right;
}

function resolveExecutionProvider(
  exec: { providerId?: string; modelId?: string },
  extras?: {
    diagnostics?: Record<string, unknown>;
    cost?: { providerId?: string };
  } | null
): string {
  const diagnostics = extras?.diagnostics;
  const model = diagnostics?.model ?? diagnostics?.modelId ?? exec.modelId;
  const fromModel = inferProviderIdFromModel(model);
  const fromDiag = diagnostics?.provider ?? diagnostics?.providerId;
  const fromCost = extras?.cost?.providerId;
  const fromExec = exec.providerId;

  if (fromModel && fromDiag && !providersCompatible(fromDiag, fromModel)) {
    return fromModel;
  }
  return String(fromDiag ?? fromCost ?? fromExec ?? fromModel ?? "unknown");
}

function resolveCostProvider(
  provider?: unknown,
  model?: unknown
): string | null {
  const fromModel = inferProviderIdFromModel(model);
  if (fromModel && provider && !providersCompatible(provider, fromModel)) {
    return fromModel;
  }
  if (provider) return String(provider);
  return fromModel;
}

/** Registry seeds store USD-per-million token rates in *Per1k* fields. */
function registryTokenRatesPer1k(model: CanonicalModel): { input: number; output: number } {
  let input = model.pricing.inputPer1kTokens ?? 0;
  let output = model.pricing.outputPer1kTokens ?? 0;
  if (!isMediaModel(model) && (input >= 0.05 || output >= 0.05)) {
    input /= 1000;
    output /= 1000;
  }
  return { input, output };
}

function modelIdCandidates(provider?: unknown, model?: unknown): string[] {
  const candidates = new Set<string>();
  const rawModel = String(model ?? "").trim();
  const rawProvider = String(provider ?? "").trim();

  if (rawModel) {
    candidates.add(rawModel);
    const slash = rawModel.lastIndexOf("/");
    if (slash >= 0) candidates.add(rawModel.slice(slash + 1));
  }

  const vendor =
    PROVIDER_ID_TO_VENDOR[rawProvider] ??
    ((rawProvider.startsWith("provider.")
      ? rawProvider.slice("provider.".length)
      : rawProvider.replace(/^provider\./, "")) ||
      inferVendorFromModel(rawModel));

  if (vendor && rawModel) {
    const shortModel = rawModel.includes("/") ? rawModel.slice(rawModel.lastIndexOf("/") + 1) : rawModel;
    candidates.add(`${vendor}/${shortModel}`);
    candidates.add(shortModel);
  } else if (rawModel && !rawModel.includes("/")) {
    const inferred = inferVendorFromModel(rawModel);
    if (inferred) candidates.add(`${inferred}/${rawModel}`);
  }

  return [...candidates].filter(Boolean);
}

function providerVendor(provider?: unknown): string | null {
  const raw = String(provider ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (PROVIDER_ID_TO_VENDOR[raw]) return PROVIDER_ID_TO_VENDOR[raw];
  if (raw.startsWith("provider.")) return raw.slice("provider.".length);
  return raw;
}

function registryModelVendor(modelId: string): string | null {
  const value = String(modelId ?? "").trim().toLowerCase();
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash >= 0) return value.slice(0, slash);
  return inferVendorFromModel(value);
}

function registryModelMatchesProvider(
  provider: unknown,
  registryModelId: string
): boolean {
  const expected = providerVendor(provider);
  if (!expected) return true;
  const actual = registryModelVendor(registryModelId);
  if (!actual) return true;
  if (expected === actual) return true;
  // Routed models (e.g. Gemini image endpoints surfaced via OpenAI-compatible paths).
  if (expected === "openai" && (actual === "google" || actual === "gemini")) return true;
  return false;
}

function resolveRegistryModel(provider?: unknown, model?: unknown): CanonicalModel | null {
  const { registry } = pricingPlatform();
  for (const modelId of modelIdCandidates(provider, model)) {
    const hit = registry.getModel(modelId);
    if (hit.ok && registryModelMatchesProvider(provider, hit.value.modelId)) {
      return hit.value;
    }
  }

  const rawModel = String(model ?? "").trim();
  if (!rawModel) return null;
  const suffix = rawModel.includes("/") ? rawModel.slice(rawModel.lastIndexOf("/") + 1) : rawModel;
  const allResult = registry.listModels();
  if (!allResult.ok) return null;
  const suffixHit = allResult.value.find((entry) => {
    const matchesSuffix =
      entry.modelId === suffix || String(entry.modelId).endsWith(`/${suffix}`);
    if (!matchesSuffix) return false;
    return registryModelMatchesProvider(provider, entry.modelId);
  });
  return suffixHit ?? null;
}

function isMediaCapability(capabilityId?: string | null): boolean {
  const capability = String(capabilityId ?? "").trim();
  return (
    capability === "image.generate" ||
    capability === "video.generate" ||
    capability === "embedding.generate"
  );
}

function isMediaModel(model: CanonicalModel): boolean {
  return (
    model.modalities.includes("image") ||
    model.modalities.includes("video") ||
    model.modalities.includes("audio")
  );
}

function flatMediaCostInr(capabilityId?: string | null): number | null {
  const capability = String(capabilityId ?? "image.generate").trim();
  const usd =
    CAPABILITY_DEFAULT_USD[capability] ??
    CAPABILITY_DEFAULT_USD["image.generate"];
  return usd != null && usd > 0 ? toInr(usd, "USD") : null;
}

function isBillableExecution(
  exec: {
    status?: string;
    capabilityId?: string;
    providerId?: string;
    modelId?: string;
    artifactIds?: string[];
  },
  extras?: { diagnostics?: Record<string, unknown> } | null
): boolean {
  const status = String(exec.status ?? "").toLowerCase();
  if (!status.includes("succeed") && !status.includes("complete")) return false;
  if (status.includes("fail") || status.includes("cancel")) return false;

  const diagnostics = extras?.diagnostics;
  const providerMode = String(diagnostics?.providerMode ?? "").toLowerCase();
  if (providerMode !== "live") return false;

  const provider =
    diagnostics?.provider ?? diagnostics?.providerId ?? exec.providerId;
  const model = diagnostics?.model ?? diagnostics?.modelId ?? exec.modelId;
  const hasArtifact = Array.isArray(exec.artifactIds) && exec.artifactIds.length > 0;
  if (!exec.capabilityId && !hasArtifact && !provider && !model) return false;

  return true;
}

const BLENDED_TEXT_USD_PER_1K = Number(process.env.ADMIN_BLENDED_TEXT_USD_PER_1K ?? 0.004);

function estimateTextCostFromTokens(inputTokens: number, outputTokens: number): number {
  const total = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  if (total <= 0) return 0;
  return toInr((total / 1000) * BLENDED_TEXT_USD_PER_1K, "USD");
}

function estimateCostFromRegistryModel(
  model: CanonicalModel,
  inputTokens: number,
  outputTokens: number,
  capabilityId?: string | null
): number {
  if (isMediaModel(model) || isMediaCapability(capabilityId)) {
    const flat = flatMediaCostInr(capabilityId);
    return flat ?? 0;
  }

  let inTok = inputTokens;
  let outTok = outputTokens;
  if (inTok <= 0 && outTok <= 0) {
    inTok = Math.round(DEFAULT_TEXT_TOKEN_ESTIMATE * 0.25);
    outTok = DEFAULT_TEXT_TOKEN_ESTIMATE - inTok;
  }
  const { input: inputRate, output: outputRate } = registryTokenRatesPer1k(model);
  const estimatedUsd = (inputRate * inTok + outputRate * outTok) / 1000;
  return estimatedUsd > 0 ? toInr(estimatedUsd, "USD") : 0;
}

function estimateCostFromDiagnostics(
  diagnostics: Record<string, unknown> | null | undefined,
  storedAmount: number | null,
  storedCurrency?: string | null,
  capabilityId?: string | null
): number | null {
  const capability = String(capabilityId ?? "").trim();
  const mediaCapability = isMediaCapability(capability);

  const model = diagnostics?.model ?? diagnostics?.modelId;
  const provider = resolveCostProvider(
    diagnostics?.provider ?? diagnostics?.providerId,
    model
  );
  const resolved = resolveRegistryModel(provider, model);

  if (mediaCapability || (resolved && isMediaModel(resolved))) {
    const flat = flatMediaCostInr(capability || "image.generate");
    if (flat != null) return flat;
  }

  let inputTokens = finiteCost(diagnostics?.inputTokens) ?? 0;
  let outputTokens = finiteCost(diagnostics?.outputTokens) ?? 0;
  const totalTokens = finiteCost(diagnostics?.totalTokens) ?? 0;

  if (!mediaCapability && totalTokens > 0 && inputTokens === 0 && outputTokens === 0) {
    inputTokens = Math.round(totalTokens * 0.25);
    outputTokens = totalTokens - inputTokens;
  }

  if (resolved) {
    const fromModel = estimateCostFromRegistryModel(
      resolved,
      inputTokens,
      outputTokens,
      capabilityId
    );
    if (fromModel > 0) return fromModel;
  }

  if (!mediaCapability && (inputTokens > 0 || outputTokens > 0)) {
    return estimateTextCostFromTokens(inputTokens, outputTokens);
  }

  const fallbackCapability = capability || (provider || model ? "text.generate" : "");
  if (fallbackCapability && CAPABILITY_DEFAULT_USD[fallbackCapability] != null) {
    return toInr(CAPABILITY_DEFAULT_USD[fallbackCapability], "USD");
  }

  if (storedAmount != null && !isPlaceholderCost(storedAmount)) {
    return toInr(storedAmount, storedCurrency ?? "USD");
  }
  return null;
}

function toInr(amount: number, sourceCurrency?: string | null): number {
  const currency = (sourceCurrency ?? "USD").toUpperCase();
  if (currency === "INR") return amount;
  return amount;
}

function toBillingTz(date: Date): Date {
  return new Date(date.getTime() + BILLING_TZ_OFFSET_MS);
}

function fromBillingTz(date: Date): Date {
  return new Date(date.getTime() - BILLING_TZ_OFFSET_MS);
}

function monthStartBillingTz(date: Date): Date {
  const local = toBillingTz(date);
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  return fromBillingTz(startLocal);
}

function monthStart(date: Date): Date {
  return monthStartBillingTz(date);
}

function monthKeyBillingTz(date: Date): string {
  const local = toBillingTz(date);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelBillingTz(date: Date): string {
  const local = toBillingTz(date);
  return local.toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isoBetween(start: Date, end: Date): { $gte: string; $lte: string } {
  return { $gte: start.toISOString(), $lte: end.toISOString() };
}

function resolvePeriodRange(period?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const normalized = (period ?? "mtd").toLowerCase();
  if (normalized === "yearly" || normalized === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: now,
      label: "yearly",
    };
  }
  if (normalized === "quarterly" || normalized === "quarter") {
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { start: quarterStart, end: now, label: "quarterly" };
  }
  // MTD default
  return { start: monthStart(now), end: now, label: "mtd" };
}

function finiteCost(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function invoiceAmountPaid(inv: {
  amountPaid?: number;
  amountDue?: number;
  currency?: string;
}): number {
  const paid = finiteCost(inv.amountPaid);
  const major =
    paid != null && paid > 0
      ? paid / 100
      : (() => {
          const due = finiteCost(inv.amountDue);
          return due != null && due > 0 ? due / 100 : 0;
        })();
  return toInr(major, inv.currency ?? DEFAULT_CURRENCY);
}

function executionCostInr(
  exec: {
    status?: string;
    cost?: number;
    capabilityId?: string;
    providerId?: string;
    modelId?: string;
    artifactIds?: string[];
    executionMode?: string;
  },
  extras?: {
    cost?: {
      amount?: number | null;
      knownAmount?: number | null;
      currency?: string | null;
      status?: string;
      providerId?: string;
    };
    diagnostics?: Record<string, unknown>;
  } | null
): number | null {
  if (!isBillableExecution(exec, extras)) return null;

  const diagnostics = extras?.diagnostics;
  const model = diagnostics?.model ?? diagnostics?.modelId ?? exec.modelId;
  const provider = resolveExecutionProvider(exec, extras);

  const mergedDiagnostics =
    diagnostics && typeof diagnostics === "object"
      ? {
          ...diagnostics,
          provider: diagnostics.provider ?? provider,
          model: diagnostics.model ?? model,
        }
      : provider || model
        ? { provider, model }
        : null;

  const storedAmount =
    finiteCost(extras?.cost?.amount) ??
    finiteCost(extras?.cost?.knownAmount) ??
    finiteCost(exec.cost);

  const capabilityId = inferCapabilityId(exec, extras);
  const fromDiagnostics = estimateCostFromDiagnostics(
    mergedDiagnostics,
    storedAmount,
    extras?.cost?.currency ?? "USD",
    capabilityId
  );
  if (fromDiagnostics != null) return fromDiagnostics;

  const costStatus = String(extras?.cost?.status ?? "").toLowerCase();
  const amount = storedAmount;
  if (amount == null || isPlaceholderCost(amount)) return null;
  if (amount === 0 && (costStatus === "unknown" || costStatus === "unavailable")) {
    return null;
  }
  return toInr(amount, extras?.cost?.currency ?? "USD");
}

function normalizeRouteMode(value: unknown): RouteBucket {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "hybrid" || raw.includes("hybrid")) return "hybrid";
  if (raw === "human") return "human";
  if (raw === "ai" || raw === "ai_only" || raw === "ai_creative") return "ai";
  return "human";
}

function productModeFromRecord(record: unknown): RouteBucket | null {
  if (!record || typeof record !== "object") return null;
  const obj = record as Record<string, unknown>;
  const raw = obj.productMode ?? obj.creationMode ?? obj.routeMode;
  if (raw == null || String(raw).trim() === "") return null;
  return normalizeRouteMode(raw);
}

function productModeFromExtras(
  extras?: {
    governance?: unknown;
    experience?: unknown;
    diagnostics?: unknown;
    asyncLane?: unknown;
  } | null
): RouteBucket | null {
  if (!extras) return null;
  return (
    productModeFromRecord(extras.governance) ??
    productModeFromRecord(extras.experience) ??
    productModeFromRecord(extras.diagnostics) ??
    productModeFromRecord(extras.asyncLane) ??
    null
  );
}

function projectRoute(project: {
  creationMode?: string;
  origin?: string;
  executionId?: string;
} | null | undefined): RouteBucket {
  if (!project) return "human";
  const modeRaw = project.creationMode;
  if (modeRaw != null && String(modeRaw).trim() !== "") {
    return normalizeRouteMode(modeRaw);
  }
  if (String(project.origin ?? "").toLowerCase() === "ai_creative") return "ai";
  if (String(project.executionId ?? "").trim()) return "ai";
  return "human";
}

function executionRoute(
  exec: {
    executionId?: string;
    providerId?: string;
    capabilityId?: string;
    conversationId?: string;
    artifactIds?: string[];
  },
  extras?: {
    governance?: unknown;
    experience?: unknown;
    diagnostics?: unknown;
    asyncLane?: unknown;
  } | null
): RouteBucket {
  const fromExtras = productModeFromExtras(extras);
  if (fromExtras) return fromExtras;
  if (exec.providerId || exec.capabilityId || exec.conversationId) return "ai";
  if (Array.isArray(exec.artifactIds) && exec.artifactIds.length > 0) return "ai";
  const execId = String(exec.executionId ?? "").trim();
  if (execId.startsWith("direct_routes_")) return "ai";
  return "human";
}

async function resolveOrgFilter(organizationId?: string): Promise<{
  executionOrgIds: string[];
  customerUserIds: string[];
}> {
  if (!organizationId) {
    return { executionOrgIds: [], customerUserIds: [] };
  }

  let org: { _id: unknown; owner?: unknown } | null = null;
  if (mongoose.isValidObjectId(organizationId) && organizationId.length === 24) {
    org = await Organizations.findById(organizationId).select("_id owner").lean();
  }
  if (!org) {
    const needle = organizationId.trim().toLowerCase().replace(/^org-|^usr-/, "");
    if (needle) {
      const orgRows = await Organizations.find({}).select("_id owner").lean();
      org =
        orgRows.find((row) => {
          const orgId = String(row._id);
          const ownerId = String(row.owner ?? "");
          return (
            orgId.toLowerCase() === organizationId.trim().toLowerCase() ||
            ownerId.toLowerCase() === organizationId.trim().toLowerCase() ||
            orgId.toLowerCase().endsWith(needle) ||
            ownerId.toLowerCase().endsWith(needle)
          );
        }) ?? null;
    }
  }

  const canonicalOrgId = org ? String(org._id) : organizationId;
  const ownerId = org?.owner ? String(org.owner) : organizationId;
  const executionOrgIds = [canonicalOrgId, ownerId].filter(Boolean);
  return {
    executionOrgIds: [...new Set(executionOrgIds)],
    customerUserIds: [ownerId],
  };
}

type OrgCanonicalMeta = {
  organizationId: string;
  customerUserId: string;
  organizationName: string;
};

async function loadOrgCanonicalMap(): Promise<{
  canonicalByAnyId: Map<string, string>;
  orgMeta: Map<string, OrgCanonicalMeta>;
}> {
  const canonicalByAnyId = new Map<string, string>();
  const orgMeta = new Map<string, OrgCanonicalMeta>();

  const orgs = await Organizations.find({})
    .select("_id owner companyName")
    .lean();

  for (const org of orgs) {
    const organizationId = String(org._id);
    const customerUserId = String(org.owner);
    canonicalByAnyId.set(organizationId, organizationId);
    canonicalByAnyId.set(customerUserId, organizationId);
    orgMeta.set(organizationId, {
      organizationId,
      customerUserId,
      organizationName: org.companyName ?? "Unknown org",
    });
  }

  const teams = await Teams.find({ invitationStatus: "accepted" })
    .select("Organization userId")
    .lean();
  for (const team of teams) {
    const organizationId = String(team.Organization);
    const userId = String(team.userId);
    canonicalByAnyId.set(userId, organizationId);
  }

  const customers = await Users.find({ role: "customer" }).select("_id").lean();
  for (const customer of customers) {
    const userId = String(customer._id);
    if (!canonicalByAnyId.has(userId)) {
      canonicalByAnyId.set(userId, userId);
      orgMeta.set(userId, {
        organizationId: userId,
        customerUserId: userId,
        organizationName: "Unknown org",
      });
    }
  }

  return { canonicalByAnyId, orgMeta };
}

function canonicalOrgId(
  rawId: string | null | undefined,
  canonicalByAnyId: Map<string, string>
): string {
  const id = String(rawId ?? "").trim();
  if (!id) return "unknown";
  return canonicalByAnyId.get(id) ?? id;
}

function subscriptionAmountInr(plan: {
  razorpayPlanItem?: { item?: { amount?: number; unit_amount?: number; currency?: string } };
} | null): number {
  const item = plan?.razorpayPlanItem?.item;
  const minor = finiteCost(item?.amount) ?? finiteCost(item?.unit_amount) ?? 0;
  if (minor <= 0) return 0;
  return toInr(minor / 100, item?.currency ?? "INR");
}

async function aggregateSubscriptionRevenueByOrg(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date },
  canonicalByAnyId: Map<string, string>,
  exclusions: AdminDemoExclusions
): Promise<Map<string, number>> {
  void range;
  const byOrg = new Map<string, number>();
  const [subs, plans] = await Promise.all([
    Subscriptions.find({ status: "active" }).lean(),
    PlansModel.find({}).lean(),
  ]);
  const planById = new Map(plans.map((plan) => [plan.plan_id, plan]));

  for (const sub of subs) {
    const userId = String(sub.userId ?? "").trim();
    if (!userId || isDemoCustomerUserId(userId, exclusions)) continue;
    const orgId = canonicalByAnyId.get(userId) ?? userId;

    if (!filter.crossTenant && filter.organizationId) {
      const { executionOrgIds, customerUserIds } = await resolveOrgFilter(filter.organizationId);
      const allowed = new Set([...executionOrgIds, ...customerUserIds]);
      if (!allowed.has(orgId) && !allowed.has(userId)) continue;
    }

    const plan = planById.get(sub.planId);
    const amount = subscriptionAmountInr(plan ?? null);
    if (amount <= 0) continue;
    byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + amount);
  }

  return byOrg;
}

async function loadActiveSubscriptionMrr(exclusions: AdminDemoExclusions): Promise<number> {
  const [subs, plans] = await Promise.all([
    Subscriptions.find({ status: "active" }).lean(),
    PlansModel.find({}).lean(),
  ]);
  const planById = new Map(plans.map((plan) => [plan.plan_id, plan]));
  let total = 0;
  for (const sub of subs) {
    const userId = String(sub.userId ?? "").trim();
    if (!userId || isDemoCustomerUserId(userId, exclusions)) continue;
    const plan = sub.planId ? planById.get(sub.planId) : null;
    total += subscriptionAmountInr(plan ?? null);
  }
  return total;
}

async function aggregateRevenueByOrg(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date },
  orgMeta: Map<string, OrgCanonicalMeta>,
  canonicalByAnyId: Map<string, string>,
  exclusions: AdminDemoExclusions
): Promise<Map<string, number>> {
  const byOrg = new Map<string, number>();
  const customerIdsByOrg = new Map<string, string[]>();

  const customers = await Users.find({ role: "customer" }).select("email _id").lean();
  const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));
  const emails = customers
    .filter((customer) => !isDemoCustomerUserId(String(customer._id), exclusions))
    .map((customer) => customer.email)
    .filter(Boolean) as string[];

  if (emails.length) {
    const stripeRows = await StripeCustomers.find({ email: { $in: emails } })
      .select("email stripeCustomerId")
      .lean();
    const stripeByEmail = new Map(
      stripeRows
        .filter((row) => row.email && row.stripeCustomerId)
        .map((row) => [row.email!, row.stripeCustomerId])
    );

    for (const meta of orgMeta.values()) {
      if (isDemoOrganizationId(meta.organizationId, exclusions)) continue;
      const customer = customerById.get(meta.customerUserId);
      if (!customer?.email) continue;
      const stripeCustomerId = stripeByEmail.get(customer.email);
      if (!stripeCustomerId) continue;
      const list = customerIdsByOrg.get(meta.organizationId) ?? [];
      list.push(stripeCustomerId);
      customerIdsByOrg.set(meta.organizationId, list);
    }

    const allStripeCustomerIds = [...customerIdsByOrg.values()].flat();
    if (allStripeCustomerIds.length) {
      const stripeToOrg = new Map<string, string>();
      for (const [orgId, stripeIds] of customerIdsByOrg.entries()) {
        for (const stripeId of stripeIds) {
          stripeToOrg.set(stripeId, orgId);
        }
      }

      const invoices = await Invoices.find({
        status: "paid",
        customerId: { $in: allStripeCustomerIds },
      }).lean();

      for (const inv of invoices) {
        const orgId = stripeToOrg.get(inv.customerId);
        if (!orgId) continue;
        const paidAt = inv.paymentDate ? new Date(inv.paymentDate) : null;
        const createdAt = (inv as { createdAt?: Date }).createdAt
          ? new Date((inv as { createdAt?: Date }).createdAt!)
          : null;
        const when = paidAt ?? createdAt;
        if (!when || when < range.start || when > range.end) continue;
        const amount = invoiceAmountPaid(inv);
        if (amount <= 0) continue;
        byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + amount);
      }
    }
  }

  const subscriptionByOrg = await aggregateSubscriptionRevenueByOrg(
    filter,
    range,
    canonicalByAnyId,
    exclusions
  );
  for (const [orgId, amount] of subscriptionByOrg.entries()) {
    byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + amount);
  }

  return byOrg;
}

function isDemoHumanTask(task: HumanTaskRow, exclusions: AdminDemoExclusions): boolean {
  const project =
    task.project && typeof task.project === "object"
      ? (task.project as {
          title?: string;
          userId?: unknown;
          orgId?: unknown;
        })
      : null;
  if (isDemoTitle(project?.title)) return true;
  if (project?.userId && isDemoCustomerUserId(String(project.userId), exclusions)) return true;
  if (project?.orgId && isDemoOrganizationId(String(project.orgId), exclusions)) return true;
  return false;
}

async function aggregateHumanCostByOrg(
  range: { start: Date; end: Date },
  canonicalByAnyId: Map<string, string>,
  exclusions: AdminDemoExclusions
): Promise<Map<string, number>> {
  const byOrg = new Map<string, number>();
  const tasks = (await Tasks.find({
    createdAt: { $gte: range.start, $lte: range.end },
  })
    .populate({
      path: "project",
      select: "creationMode origin executionId userId orgId title",
    })
    .lean()) as HumanTaskRow[];

  for (const task of tasks) {
    if (isDemoHumanTask(task, exclusions)) continue;
    const project =
      task.project && typeof task.project === "object" ? task.project : null;
    const route = projectRoute(project);
    const unitCost =
      route === "hybrid"
        ? HYBRID_TASK_COST_INR
        : route === "human"
          ? HUMAN_TASK_COST_INR
          : 0;
    if (unitCost <= 0) continue;

    const orgKey = canonicalOrgId(
      project?.orgId != null
        ? String(project.orgId)
        : project?.userId != null
          ? String(project.userId)
          : undefined,
      canonicalByAnyId
    );
    if (orgKey === "unknown") continue;
    byOrg.set(orgKey, (byOrg.get(orgKey) ?? 0) + unitCost);
  }

  return byOrg;
}

async function buildByOrganizationRollup(
  range: { start: Date; end: Date },
  _periodExecutions: Awaited<ReturnType<typeof loadExecutions>>
): Promise<OrgBillingRow[]> {
  const exclusions = await loadAdminDemoExclusions();
  const { canonicalByAnyId, orgMeta } = await loadOrgCanonicalMap();
  const [revenueByOrg, humanCostByOrg] = await Promise.all([
    aggregateRevenueByOrg({ crossTenant: true }, range, orgMeta, canonicalByAnyId, exclusions),
    aggregateHumanCostByOrg(range, canonicalByAnyId, exclusions),
  ]);

  const allOrgIds = new Set<string>([
    ...[...orgMeta.entries()]
      .filter(([, meta]) => meta.organizationName !== "Unknown org")
      .map(([orgId]) => orgId),
    ...revenueByOrg.keys(),
    ...humanCostByOrg.keys(),
  ]);

  const ledgerByOrg = await import("./admin-ai-cost-ledger").then((m) =>
    m.sumLedgerAiCostByOrganization({
      start: range.start,
      end: range.end,
      organizationIds: [...allOrgIds],
    })
  );

  const rows: OrgBillingRow[] = [];
  for (const orgId of allOrgIds) {
    if (orgId === "unknown" || isDemoOrganizationId(orgId, exclusions)) continue;
    const meta = orgMeta.get(orgId);
    if (meta && isDemoOrganizationId(meta.organizationId, exclusions)) continue;
    const ai = ledgerByOrg.get(orgId);
    rows.push({
      organizationId: orgId,
      customerUserId: meta?.customerUserId,
      organizationName: meta?.organizationName,
      revenue: revenueByOrg.get(orgId) ?? 0,
      aiCost: ai?.aiCostUsd ?? 0,
      humanCost: humanCostByOrg.get(orgId) ?? 0,
      executions: ai?.executions ?? 0,
    });
  }

  return rows.sort(
    (a, b) =>
      b.revenue - a.revenue ||
      b.aiCost - a.aiCost ||
      (a.organizationName ?? "").localeCompare(b.organizationName ?? "")
  );
}

async function aggregateRevenue(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date }
): Promise<{ total: number; byMonth: Map<string, number> }> {
  const exclusions = await loadAdminDemoExclusions();
  const invoiceQuery: Record<string, unknown> = { status: "paid" };
  const byMonth = new Map<string, number>();
  let total = 0;

  if (!filter.crossTenant && filter.organizationId) {
    const { customerUserIds } = await resolveOrgFilter(filter.organizationId);
    const customers = await Users.find({
      _id: { $in: customerUserIds },
      role: "customer",
    })
      .select("email")
      .lean();
    const emails = customers.map((c) => c.email).filter(Boolean);
    const stripeRows = await StripeCustomers.find({ email: { $in: emails } })
      .select("stripeCustomerId")
      .lean();
    const customerIds = stripeRows.map((r) => r.stripeCustomerId).filter(Boolean);
    if (!customerIds.length) return { total: 0, byMonth };
    invoiceQuery.customerId = { $in: customerIds };
  }

  // Prefer DB-side date window; still tolerate paymentDate/createdAt variance in JS.
  invoiceQuery.$or = [
    { paymentDate: { $gte: range.start, $lte: range.end } },
    {
      paymentDate: { $exists: false },
      createdAt: { $gte: range.start, $lte: range.end },
    },
    {
      paymentDate: null,
      createdAt: { $gte: range.start, $lte: range.end },
    },
  ];
  const invoices = await Invoices.find(invoiceQuery).lean();
  for (const inv of invoices) {
    const paidAt = inv.paymentDate ? new Date(inv.paymentDate) : null;
    const createdAt = (inv as { createdAt?: Date }).createdAt
      ? new Date((inv as { createdAt?: Date }).createdAt!)
      : null;
    const when = paidAt ?? createdAt;
    if (!when || when < range.start || when > range.end) continue;
    const amount = invoiceAmountPaid(inv);
    if (amount <= 0) continue;
    total += amount;
    const key = monthKeyBillingTz(when);
    byMonth.set(key, (byMonth.get(key) ?? 0) + amount);
  }

  const mrr = await loadActiveSubscriptionMrr(exclusions);
  total += mrr;
  if (mrr > 0) {
    const cursor = monthStart(range.start);
    const end = monthEnd(range.end);
    while (cursor <= end) {
      const key = monthKeyBillingTz(cursor);
      byMonth.set(key, (byMonth.get(key) ?? 0) + mrr);
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
  }

  return { total, byMonth };
}

async function aggregateMonthlyRevenue(
  filter: AdminMetricsFilter,
  months: number
): Promise<Map<string, number>> {
  const now = new Date();
  const start = monthStart(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const { byMonth } = await aggregateRevenue(filter, { start, end: now });
  return byMonth;
}

async function loadExecutions(filter: AdminMetricsFilter, since?: Date) {
  const cacheKey = adminCacheKey({
    scope: "executions",
    crossTenant: filter.crossTenant,
    organizationId: filter.organizationId ?? "",
    since: since?.toISOString() ?? "all",
    excludeDemo: true,
  });
  const cached = readAdminCache<Awaited<ReturnType<typeof loadExecutionsUncached>>>(cacheKey);
  if (cached) return cached;

  const rows = await loadExecutionsUncached(filter, since);
  return writeAdminCache(cacheKey, rows);
}

async function loadExecutionsUncached(filter: AdminMetricsFilter, since?: Date) {
  const exclusions = await loadAdminDemoExclusions();
  const query: Record<string, unknown> = {};
  if (!filter.crossTenant && filter.organizationId) {
    const { executionOrgIds } = await resolveOrgFilter(filter.organizationId);
    query.organizationId = { $in: executionOrgIds };
  }
  if (since) {
    query.createdAt = isoBetween(since, new Date());
  }
  const rows = await EnterpriseExecution.find(query)
    .select(
      "executionId organizationId status createdAt completedAt cost providerId modelId capabilityId conversationId artifactIds executionMode"
    )
    .lean();
  const executionIds = rows.map((r) => r.executionId);
  const extrasRows = executionIds.length
    ? await EnterpriseExecutionExtras.find({ executionId: { $in: executionIds } })
        .select("executionId organizationId diagnostics cost governance experience asyncLane")
        .lean()
    : [];
  const extrasById = new Map(extrasRows.map((e) => [e.executionId, e]));
  return filterProductionExecutions(
    rows
      .filter((exec) => !isDemoOrganizationId(exec.organizationId, exclusions))
      .map((exec) => ({
        exec,
        extras: extrasById.get(exec.executionId) ?? null,
      }))
  );
}

function bucketHumanCostByMonth(
  tasks: HumanTaskRow[],
  since: Date
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const task of tasks) {
    const createdAt = task.createdAt ? new Date(task.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < since) continue;
    const project =
      task.project && typeof task.project === "object" ? task.project : null;
    const route = projectRoute(project);
    const unitCost =
      route === "hybrid"
        ? HYBRID_TASK_COST_INR
        : route === "human"
          ? HUMAN_TASK_COST_INR
          : 0;
    if (unitCost <= 0) continue;
    const key = monthKeyBillingTz(createdAt);
    byMonth.set(key, (byMonth.get(key) ?? 0) + unitCost);
  }
  return byMonth;
}

function humanCostInRange(
  tasks: HumanTaskRow[],
  range: { start: Date; end: Date }
): number {
  let total = 0;
  for (const task of tasks) {
    const createdAt = task.createdAt ? new Date(task.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < range.start || createdAt > range.end) continue;
    const project =
      task.project && typeof task.project === "object" ? task.project : null;
    const route = projectRoute(project);
    if (route === "hybrid") total += HYBRID_TASK_COST_INR;
    else if (route === "human") total += HUMAN_TASK_COST_INR;
  }
  return total;
}

function buildLoadTestExecutionIds(
  rows: Awaited<ReturnType<typeof loadExecutionsUncached>>
): Set<string> {
  const byBucket = new Map<string, string[]>();
  for (const { exec } of rows) {
    const createdAt = new Date(exec.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const bucket = [
      exec.organizationId,
      createdAt.getUTCFullYear(),
      createdAt.getUTCMonth(),
      createdAt.getUTCDate(),
      createdAt.getUTCHours(),
      createdAt.getUTCMinutes(),
    ].join(":");
    const list = byBucket.get(bucket) ?? [];
    list.push(exec.executionId);
    byBucket.set(bucket, list);
  }

  const excluded = new Set<string>();
  for (const ids of byBucket.values()) {
    if (ids.length >= 4) {
      for (const id of ids) excluded.add(id);
    }
  }
  return excluded;
}

function filterProductionExecutions(
  rows: Awaited<ReturnType<typeof loadExecutionsUncached>>
): Awaited<ReturnType<typeof loadExecutionsUncached>> {
  const loadTestIds = buildLoadTestExecutionIds(rows);
  if (!loadTestIds.size) return rows;
  return rows.filter(({ exec }) => !loadTestIds.has(exec.executionId));
}

function sumExecutionAiCost(
  rows: Awaited<ReturnType<typeof loadExecutions>>
): { aiCost: number; byProvider: Map<string, { amount: number; count: number }> } {
  let aiCost = 0;
  const byProvider = new Map<string, { amount: number; count: number }>();

  for (const { exec, extras } of rows) {
    const amount = executionCostInr(exec, extras);
    if (amount == null) continue;
    aiCost += amount;
    const providerId = resolveExecutionProvider(exec, extras);
    const prev = byProvider.get(providerId) ?? { amount: 0, count: 0 };
    byProvider.set(providerId, {
      amount: prev.amount + amount,
      count: prev.count + 1,
    });
  }
  return { aiCost, byProvider };
}

type HumanTaskRow = {
  _id: unknown;
  status?: string;
  createdAt?: Date;
  project?: {
    title?: string;
    creationMode?: string;
    origin?: string;
    executionId?: string;
    userId?: unknown;
    orgId?: unknown;
  };
};

async function loadHumanTaskCosts(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date }
): Promise<{ humanCost: number; hybridCount: number; humanCount: number; tasks: HumanTaskRow[] }> {
  const exclusions = await loadAdminDemoExclusions();
  const taskQuery: Record<string, unknown> = {
    createdAt: { $gte: range.start, $lte: range.end },
  };

  if (!filter.crossTenant && filter.organizationId) {
    const { customerUserIds } = await resolveOrgFilter(filter.organizationId);
    const projects = await Projects.find({ userId: { $in: customerUserIds } })
      .select("_id")
      .lean();
    const projectIds = projects.map((p) => p._id);
    if (!projectIds.length) {
      return { humanCost: 0, hybridCount: 0, humanCount: 0, tasks: [] };
    }
    taskQuery.project = { $in: projectIds };
  }

  const tasks = (await Tasks.find(taskQuery)
    .populate({
      path: "project",
      select: "creationMode origin executionId userId orgId title",
    })
    .lean()) as HumanTaskRow[];

  let humanCost = 0;
  let hybridCount = 0;
  let humanCount = 0;
  const billableTasks: HumanTaskRow[] = [];

  for (const task of tasks) {
    if (isDemoHumanTask(task, exclusions)) continue;
    billableTasks.push(task);
    const project =
      task.project && typeof task.project === "object"
        ? task.project
        : null;
    const route = projectRoute(project);
    if (route === "hybrid") {
      hybridCount += 1;
      humanCost += HYBRID_TASK_COST_INR;
    } else if (route === "human") {
      humanCount += 1;
      humanCost += HUMAN_TASK_COST_INR;
    }
  }

  return { humanCost, hybridCount, humanCount, tasks: billableTasks };
}

type VolumeProjectRow = {
  creationMode?: string;
  origin?: string;
  executionId?: string;
  createdAt?: Date;
};

type VolumeRequirementRow = {
  creationMode?: string;
  createdAt?: Date;
};

async function loadVolumeProjects(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date }
): Promise<VolumeProjectRow[]> {
  const query: Record<string, unknown> = {
    createdAt: { $gte: range.start, $lte: range.end },
  };
  if (!filter.crossTenant && filter.organizationId) {
    if (mongoose.isValidObjectId(filter.organizationId)) {
      query.orgId = new mongoose.Types.ObjectId(filter.organizationId);
    } else {
      return [];
    }
  }
  return Projects.find(query)
    .select("creationMode origin executionId createdAt")
    .lean() as Promise<VolumeProjectRow[]>;
}

async function loadVolumeRequirements(
  filter: AdminMetricsFilter,
  range: { start: Date; end: Date }
): Promise<VolumeRequirementRow[]> {
  const query: Record<string, unknown> = {
    createdAt: { $gte: range.start, $lte: range.end },
  };
  if (!filter.crossTenant && filter.organizationId) {
    const { customerUserIds } = await resolveOrgFilter(filter.organizationId);
    if (!customerUserIds.length) return [];
    query.userId = {
      $in: customerUserIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  return Requirement.find(query)
    .select("creationMode createdAt")
    .lean() as Promise<VolumeRequirementRow[]>;
}

type RouteVolumeEvent = { at: Date; route: RouteBucket };

function collectRouteVolumeEvents(input: {
  executions: Awaited<ReturnType<typeof loadExecutions>>;
  projects: VolumeProjectRow[];
  tasks: HumanTaskRow[];
  requirements: VolumeRequirementRow[];
}): RouteVolumeEvent[] {
  const seenExecutionIds = new Set<string>();
  const events: RouteVolumeEvent[] = [];

  const rememberExecution = (executionId?: string | null): boolean => {
    const id = String(executionId ?? "").trim();
    if (!id) return false;
    if (seenExecutionIds.has(id)) return true;
    seenExecutionIds.add(id);
    return false;
  };

  for (const project of input.projects) {
    if (rememberExecution(project.executionId)) continue;
    const createdAt = project.createdAt ? new Date(project.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    events.push({ at: createdAt, route: projectRoute(project) });
  }

  for (const { exec, extras } of input.executions) {
    if (rememberExecution(exec.executionId)) continue;
    const createdAt = exec.createdAt ? new Date(exec.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    events.push({ at: createdAt, route: executionRoute(exec, extras) });
  }

  for (const task of input.tasks) {
    const project =
      task.project && typeof task.project === "object" ? task.project : null;
    if (rememberExecution(project?.executionId)) continue;
    const createdAt = task.createdAt ? new Date(task.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    events.push({ at: createdAt, route: projectRoute(project) });
  }

  for (const requirement of input.requirements) {
    const createdAt = requirement.createdAt ? new Date(requirement.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    events.push({
      at: createdAt,
      route: normalizeRouteMode(requirement.creationMode ?? "human"),
    });
  }

  return events;
}

function buildRouteVolume(
  events: RouteVolumeEvent[],
  periodKey: string
): RouteVolumePoint[] {
  const now = new Date();
  const dayMs = 86_400_000;

  const bump = (bucket: RouteVolumePoint, route: RouteBucket) => {
    bucket[route] += 1;
  };

  if (periodKey === "Yearly") {
    const currentYear = now.getFullYear();
    const labels = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear].map(String);
    return labels.map((year) => {
      const bucket: RouteVolumePoint = { week: year, ai: 0, hybrid: 0, human: 0 };
      for (const event of events) {
        if (String(event.at.getFullYear()) !== year) continue;
        bump(bucket, event.route);
      }
      return bucket;
    });
  }

  if (periodKey === "6 Months") {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const bucket: RouteVolumePoint = {
        week: date.toLocaleString("en-US", { month: "short" }),
        ai: 0,
        hybrid: 0,
        human: 0,
      };
      for (const event of events) {
        if (event.at.getMonth() !== month || event.at.getFullYear() !== year) continue;
        bump(bucket, event.route);
      }
      return bucket;
    });
  }

  if (periodKey === "Quarterly") {
    return ["Q1", "Q2", "Q3", "Q4"].map((week, quarterIndex) => {
      const bucket: RouteVolumePoint = { week, ai: 0, hybrid: 0, human: 0 };
      for (const event of events) {
        if (Math.floor(event.at.getMonth() / 3) !== quarterIndex) continue;
        if (event.at.getFullYear() !== now.getFullYear()) continue;
        bump(bucket, event.route);
      }
      return bucket;
    });
  }

  // Monthly — 4 week buckets
  const startOfMonth = monthStart(now);
  return ["Week 1", "Week 2", "Week 3", "Week 4"].map((week, weekIndex) => {
    const bucket: RouteVolumePoint = { week, ai: 0, hybrid: 0, human: 0 };
    const start = startOfMonth.getTime() + weekIndex * 7 * dayMs;
    const end = start + 7 * dayMs;
    for (const event of events) {
      const ts = event.at.getTime();
      if (ts < start || ts >= end) continue;
      bump(bucket, event.route);
    }
    return bucket;
  });
}

function buildStatusBreakdown(
  executions: Awaited<ReturnType<typeof loadExecutions>>,
  tasks: HumanTaskRow[]
): StatusBreakdownItem[] {
  const counts = { completed: 0, inProgress: 0, pending: 0, escalated: 0, failed: 0 };

  for (const { exec } of executions) {
    const status = String(exec.status ?? "").toLowerCase();
    // Failed/cancelled executions are terminal outcomes — not escalations.
    if (
      status.includes("fail") ||
      status.includes("cancel") ||
      status.includes("error") ||
      status.includes("timeout") ||
      status.includes("dead")
    ) {
      counts.failed += 1;
    } else if (status.includes("escalat") || status.includes("block")) {
      counts.escalated += 1;
    } else if (status.includes("complete") || status.includes("succeed")) {
      counts.completed += 1;
    } else if (
      status.includes("review") ||
      status.includes("pending") ||
      status.includes("awaiting") ||
      status.includes("approval")
    ) {
      counts.pending += 1;
    } else {
      counts.inProgress += 1;
    }
  }

  for (const task of tasks) {
    const status = String(task.status ?? "").toLowerCase();
    if (status.includes("escalat") || status.includes("block") || status.includes("hold")) {
      counts.escalated += 1;
    } else if (status.includes("approved") || status.includes("complete") || status.includes("done")) {
      counts.completed += 1;
    } else if (
      status.includes("feedback") ||
      status.includes("submitted") ||
      status.includes("revision") ||
      status.includes("review") ||
      status.includes("pending") ||
      status.includes("todo") ||
      status.includes("qc")
    ) {
      counts.pending += 1;
    } else {
      counts.inProgress += 1;
    }
  }

  return [
    { label: "Completed", value: counts.completed, color: "#10b981" },
    { label: "In Progress", value: counts.inProgress, color: "#ff0056" },
    { label: "Pending Review", value: counts.pending, color: "#f59e0b" },
    { label: "Escalated", value: counts.escalated, color: "#ef4444" },
    { label: "Failed", value: counts.failed, color: "#64748b" },
  ];
}

function computeSlaCompliance(executions: Awaited<ReturnType<typeof loadExecutions>>): number | undefined {
  const SLA_MS = 24 * 60 * 60 * 1000;
  let eligible = 0;
  let met = 0;
  for (const { exec } of executions) {
    if (!exec.completedAt || !exec.createdAt) continue;
    const start = Date.parse(exec.createdAt);
    const end = Date.parse(exec.completedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    eligible += 1;
    if (end - start <= SLA_MS) met += 1;
  }
  if (!eligible) return undefined;
  return met / eligible;
}

function buildMonthlyTrend(
  revenueByMonth: Map<string, number>,
  aiCostByMonth: Map<string, number>,
  humanCostByMonth: Map<string, number>,
  months: number
): MonthlyTrendPoint[] {
  const now = new Date();
  const points: MonthlyTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = monthStartBillingTz(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const key = monthKeyBillingTz(d);
    const label = monthLabelBillingTz(d);
    const aiCost = aiCostByMonth.get(key) ?? 0;
    const humanCost = humanCostByMonth.get(key) ?? 0;
    const revenue = revenueByMonth.get(key) ?? 0;
    const totalCost = aiCost + humanCost;
    points.push({ month: label, revenue, totalCost, humanCost, aiCost });
  }
  return points;
}

export async function buildAdminBillingSummary(
  filter: AdminMetricsFilter
): Promise<AdminBillingSummary> {
  const cacheKey = adminCacheKey({
    scope: "billing",
    crossTenant: filter.crossTenant,
    organizationId: filter.organizationId ?? "",
    period: filter.period ?? "mtd",
    excludeDemo: true,
  });
  const cached = readAdminCache<AdminBillingSummary>(cacheKey);
  if (cached) return cached;

  const range = resolvePeriodRange(filter.period);
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const trendStart = monthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1));

  const [periodExecutions, yearExecutions, revenueResult, trendRevenueMap, yearTasksResult, ledger] =
    await Promise.all([
      loadExecutions(filter, range.start),
      loadExecutions(filter, yearStart),
      aggregateRevenue(filter, range),
      aggregateRevenue(filter, { start: trendStart, end: now }),
      loadHumanTaskCosts(filter, { start: yearStart, end: now }),
      sumLedgerAiCostUsd({
        period: filter.period,
        organizationId: filter.crossTenant ? undefined : filter.organizationId,
        start: range.start,
        end: range.end,
      }),
    ]);

  const aiCost = ledger.aiCostUsd;
  const byProvider = ledger.byProvider;
  const humanCost = humanCostInRange(yearTasksResult.tasks, range);
  const totalCost = aiCost + humanCost;
  const revenue = revenueResult.total;
  const profit = revenue - totalCost;

  const aiCostByMonth = await sumLedgerAiCostByMonth({
    start: trendStart,
    end: now,
    organizationId: filter.crossTenant ? undefined : filter.organizationId,
  });

  const humanCostByMonth = bucketHumanCostByMonth(yearTasksResult.tasks, trendStart);

  const monthlyTrend = buildMonthlyTrend(
    trendRevenueMap.byMonth,
    aiCostByMonth,
    humanCostByMonth,
    6
  );

  const byOrganization: OrgBillingRow[] = filter.crossTenant
    ? await buildByOrganizationRollup(range, periodExecutions)
    : [];

  return writeAdminCache(cacheKey, {
    organizationId: filter.organizationId,
    period: range.label,
    currency: DEFAULT_CURRENCY,
    revenue,
    totalCost,
    humanCost,
    aiCost,
    profit,
    profitMargin: revenue > 0 ? profit / revenue : undefined,
    monthlyTrend,
    costByProvider: [...byProvider.entries()]
      .map(([providerId, stats]) => ({
        providerId,
        amount: stats.amount,
        executions: stats.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    byOrganization,
    liveInternalSpendUsd: Number(ledger.overview.liveInternalSpendUsd ?? 0),
    pendingSpendUsd: ledger.overview.pendingSpendUsd
      ? Number(ledger.overview.pendingSpendUsd)
      : null,
    projectedSpendUsd: ledger.overview.projectedSpendUsd
      ? Number(ledger.overview.projectedSpendUsd)
      : null,
    projectionStatus: ledger.overview.projectionStatus,
    lastUsageUpdateAt: ledger.overview.lastUsageUpdateAt,
    lastProviderReconciliationAt: ledger.overview.lastProviderReconciliationAt,
    providerDataThrough: ledger.overview.providerDataThrough,
  });
}

export async function buildAdminAnalyticsSummary(
  filter: AdminMetricsFilter,
  openEscalations: number
): Promise<AdminAnalyticsSummary> {
  const cacheKey = adminCacheKey({
    scope: "analytics",
    // bump when status-breakdown classification rules change
    v: 2,
    crossTenant: filter.crossTenant,
    organizationId: filter.organizationId ?? "",
    period: filter.period ?? "mtd",
    openEscalations,
  });
  const cached = readAdminCache<AdminAnalyticsSummary>(cacheKey);
  if (cached) return cached;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const yearEnd = new Date();
  const range = resolvePeriodRange(filter.period);
  const [executions, periodExecutions, tasksResult, revenueResult, volumeProjects, volumeRequirements, ledger] =
    await Promise.all([
    loadExecutions(filter, yearStart),
    loadExecutions(filter, range.start),
    loadHumanTaskCosts(filter, { start: yearStart, end: yearEnd }),
    aggregateRevenue(filter, range),
    loadVolumeProjects(filter, { start: yearStart, end: yearEnd }),
    loadVolumeRequirements(filter, { start: yearStart, end: yearEnd }),
    sumLedgerAiCostUsd({
      period: filter.period,
      organizationId: filter.crossTenant ? undefined : filter.organizationId,
      start: range.start,
      end: range.end,
    }),
  ]);

  const aiCost = ledger.aiCostUsd;

  const routeVolumeEvents = collectRouteVolumeEvents({
    executions,
    projects: volumeProjects,
    tasks: tasksResult.tasks,
    requirements: volumeRequirements,
  });

  const aiExecutions = executions.filter(
    ({ exec, extras }) => executionRoute(exec, extras) === "ai"
  ).length;
  const hybridRequests = tasksResult.hybridCount;
  const humanRequests = tasksResult.humanCount + executions.filter(
    ({ exec, extras }) => executionRoute(exec, extras) === "human"
  ).length;

  const totalRequests = executions.length + tasksResult.tasks.length;
  const aiAndHybrid = aiExecutions + hybridRequests;
  const aiConversionRate = totalRequests > 0 ? aiAndHybrid / totalRequests : 0;

  const routeVolumeByPeriod = {
    Monthly: buildRouteVolume(routeVolumeEvents, "Monthly"),
    Quarterly: buildRouteVolume(routeVolumeEvents, "Quarterly"),
    "6 Months": buildRouteVolume(routeVolumeEvents, "6 Months"),
    Yearly: buildRouteVolume(routeVolumeEvents, "Yearly"),
  };

  return writeAdminCache(cacheKey, {
    executions: executions.length,
    cost: aiCost,
    revenue: revenueResult.total,
    totalRequests,
    aiConversionRate,
    slaCompliance: computeSlaCompliance(executions),
    openEscalations,
    routeVolumeByPeriod,
    statusBreakdown: buildStatusBreakdown(executions, tasksResult.tasks),
    aiExecutions,
    hybridRequests,
    humanRequests,
    liveInternalSpendUsd: Number(ledger.overview.liveInternalSpendUsd ?? 0),
    pendingSpendUsd: ledger.overview.pendingSpendUsd
      ? Number(ledger.overview.pendingSpendUsd)
      : null,
    projectedSpendUsd: ledger.overview.projectedSpendUsd
      ? Number(ledger.overview.projectedSpendUsd)
      : null,
    projectionStatus: ledger.overview.projectionStatus,
    lastUsageUpdateAt: ledger.overview.lastUsageUpdateAt,
  });
}

export function resolveAdminCrossTenant(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("owner");
}

export function resolveAdminMetricsFilter(input: {
  roles: readonly string[];
  tenantOrganizationId?: string;
  queryOrganizationId?: string;
  period?: string;
}): AdminMetricsFilter {
  const crossTenant = resolveAdminCrossTenant(input.roles);
  const organizationId = crossTenant
    ? input.queryOrganizationId || undefined
    : input.tenantOrganizationId || input.queryOrganizationId;
  return {
    crossTenant: crossTenant && !input.queryOrganizationId,
    organizationId,
    period: input.period,
  };
}
