/**
 * Resolves human-readable AI provider labels for admin project / request views.
 */

import { EnterpriseExecution } from "../../infrastructure/durability/mongo/models/enterprise-execution.model";
import { EnterpriseExecutionExtras } from "../../infrastructure/durability/mongo/models/enterprise-execution-extras.model";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  gemini: "Google",
  ideogram: "Ideogram",
  blackforestlabs: "Black Forest Labs",
  xai: "xAI",
  minimax: "MiniMax",
  groq: "Groq",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  meta: "Meta",
  runway: "Runway",
  kling: "Kling",
  luma: "Luma",
  pixverse: "Pixverse",
  elevenlabs: "ElevenLabs",
  cartesia: "Cartesia",
};

const DIRECT_ROUTES_WINDOW_MS = 5 * 60 * 1000;

function parseDirectRoutesTimestamp(executionId: string): number | null {
  const match = /^direct_routes_(\d+)$/i.exec(executionId.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseExecTimestamp(executionId: string): number | null {
  const match = /^exec_\d+_(\d+)$/i.exec(executionId.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
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
  return null;
}

function formatProviderLabel(providerId: string): string {
  const vendor = providerId.replace(/^provider\./i, "").trim().toLowerCase();
  return PROVIDER_LABELS[vendor] ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

function providersCompatible(providerA?: unknown, providerB?: unknown): boolean {
  const normalize = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^provider\./, "");
  const left = normalize(providerA);
  const right = normalize(providerB);
  if (!left || !right) return true;
  return left === right;
}

function resolveProviderFromRecord(
  exec: { providerId?: string | null; modelId?: string | null },
  extras?: { diagnostics?: Record<string, unknown>; cost?: { providerId?: string } } | null
): string | null {
  const diagnostics = extras?.diagnostics;
  const model = diagnostics?.model ?? diagnostics?.modelId ?? exec.modelId;
  const fromModel = inferVendorFromModel(String(model ?? ""));
  const modelProvider = fromModel ? `provider.${fromModel}` : null;
  const fromDiag = diagnostics?.provider ?? diagnostics?.providerId;
  const fromCost = extras?.cost?.providerId;
  const fromExec = exec.providerId;

  if (modelProvider && fromDiag && !providersCompatible(fromDiag, modelProvider)) {
    return modelProvider;
  }
  return String(fromDiag ?? fromCost ?? fromExec ?? modelProvider ?? "").trim() || null;
}

function isLiveSucceededExecution(
  exec: { status?: string | null },
  extras?: { diagnostics?: Record<string, unknown> } | null
): boolean {
  const status = String(exec.status ?? "").toLowerCase();
  if (!status.includes("succeed") && !status.includes("complete")) return false;
  if (status.includes("fail") || status.includes("cancel")) return false;
  const providerMode = String(extras?.diagnostics?.providerMode ?? "").toLowerCase();
  return providerMode === "live";
}

async function findDirectRouteSessionExecutions(
  organizationId: string,
  sessionTs: number
): Promise<Array<{ executionId: string; status?: string; providerId?: string; modelId?: string }>> {
  const start = new Date(sessionTs);
  const end = new Date(sessionTs + DIRECT_ROUTES_WINDOW_MS);
  const rows = await EnterpriseExecution.find({
    organizationId,
    createdAt: { $gte: start.toISOString(), $lte: end.toISOString() },
  })
    .select("executionId status providerId modelId createdAt")
    .lean();

  return rows.filter((row) => {
    const ts = parseExecTimestamp(row.executionId);
    return ts != null && ts >= sessionTs && ts <= sessionTs + DIRECT_ROUTES_WINDOW_MS;
  });
}

export function isAiCreativeProject(project: {
  origin?: string | null;
  executionId?: string | null;
  creationMode?: string | null;
}): boolean {
  const mode = String(project.creationMode ?? "").toLowerCase();
  if (mode.includes("hybrid")) return true;
  const origin = String(project.origin ?? "").toLowerCase();
  if (origin === "ai_creative" || String(project.executionId ?? "").trim()) return true;
  return mode === "ai" || mode === "ai_creative";
}

export async function resolveProjectAiProviders(project: {
  executionId?: string | null;
  sourceRouteId?: string | null;
  orgId?: unknown;
  origin?: string | null;
  creationMode?: string | null;
}): Promise<string> {
  if (!isAiCreativeProject(project)) return "—";

  const organizationId = project.orgId ? String(project.orgId) : "";
  if (!organizationId) return "—";

  const executionId = String(project.executionId ?? "").trim();
  if (!executionId) return "—";

  let execRows: Array<{ executionId: string; status?: string; providerId?: string; modelId?: string }> =
    [];

  if (executionId.startsWith("exec_")) {
    const row = await EnterpriseExecution.findOne({ executionId })
      .select("executionId status providerId modelId")
      .lean();
    if (row) execRows = [row];
  } else if (executionId.startsWith("direct_routes_")) {
    const sessionTs = parseDirectRoutesTimestamp(executionId);
    if (sessionTs != null) {
      execRows = await findDirectRouteSessionExecutions(organizationId, sessionTs);
    }
  } else {
    const row = await EnterpriseExecution.findOne({ executionId })
      .select("executionId status providerId modelId")
      .lean();
    if (row) execRows = [row];
  }

  if (!execRows.length) return "—";

  const executionIds = execRows.map((row) => row.executionId);
  const extrasRows = await EnterpriseExecutionExtras.find({
    executionId: { $in: executionIds },
  })
    .select("executionId diagnostics cost")
    .lean();
  const extrasById = new Map(extrasRows.map((row) => [row.executionId, row]));

  const labels = new Set<string>();
  for (const exec of execRows) {
    const extras = extrasById.get(exec.executionId);
    if (!isLiveSucceededExecution(exec, extras)) continue;
    const providerId = resolveProviderFromRecord(exec, extras);
    if (!providerId || providerId === "unknown") continue;
    labels.add(formatProviderLabel(providerId));
  }

  if (!labels.size) return "—";
  return [...labels].sort((a, b) => a.localeCompare(b)).join(", ");
}

export async function resolveProjectAiProvidersBatch(
  projects: Array<{
    executionId?: string | null;
    sourceRouteId?: string | null;
    orgId?: unknown;
    origin?: string | null;
    creationMode?: string | null;
  }>
): Promise<string[]> {
  return Promise.all(projects.map((project) => resolveProjectAiProviders(project)));
}
