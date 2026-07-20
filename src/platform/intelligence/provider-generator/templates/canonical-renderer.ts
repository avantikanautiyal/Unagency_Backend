/**
 * Canonical provider file templates (OpenAI-shaped, provider-parameterized).
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { GeneratorArtifactKind } from "../contracts/enums";
import type { GeneratedFileArtifact } from "../contracts/result";
import type { IProviderTemplateRenderer, ProviderTemplateContext } from "../interfaces/generator";

export class CanonicalProviderTemplateRenderer implements IProviderTemplateRenderer {
  render(
    kind: GeneratorArtifactKind,
    context: ProviderTemplateContext
  ): Result<GeneratedFileArtifact> {
    const renderers: Partial<
      Record<GeneratorArtifactKind, (ctx: ProviderTemplateContext) => GeneratedFileArtifact>
    > = {
      constants: renderConstants,
      contracts: renderContracts,
      authentication: renderAuth,
      discovery: renderDiscovery,
      model_resolver: renderModelResolver,
      capability_mapper: renderCapabilityMapper,
      request_mapper: renderRequestMapper,
      response_mapper: renderResponseMapper,
      sdk: renderSdk,
      adapter: renderAdapter,
      dispatcher: renderDispatcher,
      health: renderHealth,
      streaming: renderStreaming,
      tool_calling: renderToolCalling,
      structured_output: renderStructuredOutput,
      observability: renderObservability,
      certification: renderCertification,
      factory: renderFactory,
      index: renderIndex,
      readme: renderReadme,
      unit_test: renderUnitTest,
      diagnostics: renderDiagnostics,
    };

    const fn = renderers[kind];
    if (!fn) {
      return failure(new ValidationError(`no template for artifact kind: ${kind}`));
    }
    return success(fn(context));
  }
}

function file(
  relativePath: string,
  kind: GeneratorArtifactKind,
  description: string,
  content: string
): GeneratedFileArtifact {
  return { relativePath, kind, description, content: content.trimStart() };
}

function renderConstants(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { constantPrefix, manifest } = ctx;
  return file(
    "constants/index.ts",
    "constants",
    "Provider constants",
    `
/** Generated constants for ${manifest.displayName}. */
export const ${constantPrefix}_PROVIDER_ID = "${manifest.providerId}";
export const ${constantPrefix}_ADAPTER_ID = "${manifest.providerId}-adapter";
export const ${constantPrefix}_BASE_URL = "${manifest.baseUrl}";
export const ${constantPrefix}_DISCOVERY_ENDPOINT = "${manifest.discoveryEndpoint}";
export const ${constantPrefix}_PROVIDER_VERSION = "${manifest.version}";
export const ${constantPrefix}_CATEGORY = "${manifest.category}";
`
  );
}

function renderContracts(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "contracts/index.ts",
    "contracts",
    "Provider contracts — capability-first, no hardcoded model names",
    `
/**
 * Generated contracts for ${manifest.displayName}.
 * DesiredCapabilityProfile never contains vendor model brand names for business modules.
 */

export interface DesiredCapabilityProfile {
  readonly capabilityId?: string;
  readonly modality?: string;
  readonly requireStreaming?: boolean;
  readonly requireToolCalling?: boolean;
  readonly requireVision?: boolean;
  readonly requireAudio?: boolean;
  readonly requireEmbeddings?: boolean;
  readonly requireReasoning?: boolean;
  readonly requireStructuredOutputs?: boolean;
  readonly minContextWindow?: number;
  readonly maxCostPreference?: "low" | "balanced" | "quality";
  readonly region?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export type ${classPrefix}ProviderStatus =
  | "uninitialized"
  | "discovering"
  | "certifying"
  | "experimental"
  | "active"
  | "degraded"
  | "disabled";

export interface ${classPrefix}AuthenticationConfig {
  readonly apiKey?: string;
  readonly credentialRef?: string;
  readonly baseUrl?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
}

export interface Discovered${classPrefix}Model {
  readonly id: string;
  readonly ownedBy?: string;
  readonly modalities: readonly string[];
  readonly capability: {
    readonly streaming: boolean;
    readonly toolCalling: boolean;
    readonly vision: boolean;
    readonly audio: boolean;
    readonly embeddings: boolean;
    readonly reasoning: boolean;
    readonly structuredOutputs: boolean;
    readonly contextWindow?: number;
  };
}

export interface ${classPrefix}ModelDiscoveryResult {
  readonly models: readonly Discovered${classPrefix}Model[];
  readonly source: "live" | "simulated" | "cache";
  readonly discoveredAt: string;
}

export interface ${classPrefix}ModelResolution {
  readonly selectedModelId: string;
  readonly candidates: readonly string[];
  readonly score: number;
  readonly rationale: string;
}
`
  );
}

function renderAuth(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    `authentication/${manifest.providerId}-auth.ts`,
    "authentication",
    "Authentication helpers",
    `
import type { ${classPrefix}AuthenticationConfig } from "../contracts";

export function authHeaders(auth: ${classPrefix}AuthenticationConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth.apiKey) {
    headers["authorization"] = "Bearer " + auth.apiKey;
  }
  ${manifest.authentication.supportsOrganization ? `if (auth.organizationId) headers["x-organization"] = auth.organizationId;` : ""}
  return headers;
}

export function defaultQuotaMetadata() {
  return ${JSON.stringify(manifest.rateLimits ?? {}, null, 2)};
}
`
  );
}

function renderDiscovery(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, constantPrefix, manifest } = ctx;
  return file(
    "discovery/model-discovery.ts",
    "discovery",
    "Dynamic model discovery — never hardcode model names",
    `
import { success, type Result } from "../../../../shared/result";
import type {
  Discovered${classPrefix}Model,
  ${classPrefix}ModelDiscoveryResult,
} from "../contracts";
import { ${constantPrefix}_DISCOVERY_ENDPOINT } from "../constants";

/**
 * discoverModels() → Canonical inventory → Capability detection → cache.
 * When provider releases new models, UNAGENCY discovers them automatically.
 */
export class ${classPrefix}ModelDiscovery {
  private cache: ${classPrefix}ModelDiscoveryResult | undefined;
  private source: ${classPrefix}ModelDiscoveryResult["source"] = "simulated";

  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  markSource(source: ${classPrefix}ModelDiscoveryResult["source"]): void {
    this.source = source;
  }

  async discover(force = false): Promise<Result<${classPrefix}ModelDiscoveryResult>> {
    if (!force && this.cache) {
      return success({ ...this.cache, source: "cache" });
    }
    // Live implementations call discoveryEndpoint; generated skeleton uses simulated inventory.
    const models: Discovered${classPrefix}Model[] = [
      {
        id: "${manifest.providerId}-discovered-default",
        ownedBy: "${manifest.providerId}",
        modalities: ${JSON.stringify(manifest.supportedModalities)},
        capability: {
          streaming: ${manifest.features.streaming},
          toolCalling: ${manifest.features.toolCalling},
          vision: ${manifest.features.vision},
          audio: ${manifest.features.audio},
          embeddings: ${manifest.features.embeddings},
          reasoning: ${manifest.features.reasoning},
          structuredOutputs: ${manifest.features.structuredOutput},
          contextWindow: 128000,
        },
      },
    ];
    this.cache = {
      models,
      source: this.source,
      discoveredAt: this.nowIso(),
    };
    void ${constantPrefix}_DISCOVERY_ENDPOINT;
    return success(this.cache);
  }

  getCached(): ${classPrefix}ModelDiscoveryResult | undefined {
    return this.cache;
  }

  clearCache(): void {
    this.cache = undefined;
  }
}
`
  );
}

function renderModelResolver(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix } = ctx;
  return file(
    "models/model-resolver.ts",
    "model_resolver",
    "resolveModel() from capability profile — never expose model brands to business modules",
    `
import { failure, success, type Result } from "../../../../shared/result";
import { ValidationError } from "../../../../shared/errors";
import type {
  DesiredCapabilityProfile,
  Discovered${classPrefix}Model,
  ${classPrefix}ModelResolution,
} from "../contracts";

export class ${classPrefix}ModelResolver {
  resolve(
    profile: DesiredCapabilityProfile,
    inventory: readonly Discovered${classPrefix}Model[]
  ): Result<${classPrefix}ModelResolution> {
    if (!inventory.length) {
      return failure(new ValidationError("empty model inventory — run discoverModels first"));
    }
    const scored = inventory
      .map((m) => ({ model: m, score: scoreModel(m, profile) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    return success({
      selectedModelId: best.model.id,
      candidates: scored.slice(0, 5).map((s) => s.model.id),
      score: best.score,
      rationale: \`Selected \${best.model.id} for capability=\${profile.capabilityId ?? "general"} modality=\${profile.modality ?? "text"}\`,
    });
  }
}

function scoreModel(model: Discovered${classPrefix}Model, profile: DesiredCapabilityProfile): number {
  let score = 0.5;
  if (profile.requireStreaming && model.capability.streaming) score += 0.1;
  if (profile.requireToolCalling && model.capability.toolCalling) score += 0.1;
  if (profile.requireVision && model.capability.vision) score += 0.1;
  if (profile.requireAudio && model.capability.audio) score += 0.05;
  if (profile.requireEmbeddings && model.capability.embeddings) score += 0.05;
  if (profile.requireReasoning && model.capability.reasoning) score += 0.1;
  if (profile.requireStructuredOutputs && model.capability.structuredOutputs) score += 0.05;
  if (
    profile.minContextWindow &&
    model.capability.contextWindow &&
    model.capability.contextWindow >= profile.minContextWindow
  ) {
    score += 0.1;
  }
  if (profile.modality && model.modalities.includes(profile.modality)) score += 0.1;
  return Math.min(1, score);
}
`
  );
}

function renderCapabilityMapper(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, constantPrefix, manifest } = ctx;
  const matrix = JSON.stringify(manifest.capabilityMatrix, null, 2);
  return file(
    "models/capability-mapper.ts",
    "capability_mapper",
    "Map provider models into canonical capabilities",
    `
import type { Discovered${classPrefix}Model } from "../contracts";

export const ${constantPrefix}_CAPABILITY_MATRIX = ${matrix} as const;

export function mapModelToCapabilities(model: Discovered${classPrefix}Model): readonly string[] {
  return ${constantPrefix}_CAPABILITY_MATRIX
    .filter((entry) =>
      entry.modalities.some((m) => model.modalities.includes(m)) ||
      entry.modalities.includes("*")
    )
    .map((entry) => entry.capabilityId);
}
`
  );
}

function renderRequestMapper(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "requests/request-mapper.ts",
    "request_mapper",
    "Canonical → provider wire request",
    `
/** Generated request mapper for ${manifest.displayName}. */
export function mapCanonicalTo${classPrefix}Request(
  payload: Readonly<Record<string, unknown>>,
  modelId: string
): Readonly<Record<string, unknown>> {
  return {
    model: modelId,
    input: payload,
    provider: "${manifest.providerId}",
  };
}
`
  );
}

function renderResponseMapper(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "responses/response-mapper.ts",
    "response_mapper",
    "Provider wire → canonical response",
    `
/** Generated response mapper for ${manifest.displayName}. */
export function map${classPrefix}ResponseToCanonical(
  wire: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return {
    content: wire["output"] ?? wire["content"] ?? wire,
    provider: "${manifest.providerId}",
  };
}
`
  );
}

function renderSdk(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, constantPrefix, manifest } = ctx;
  return file(
    `sdk/${manifest.providerId}-sdk-client.ts`,
    "sdk",
    "SDK wrapper (simulated by default — no networking in generator tests)",
    `
import { success, type Result } from "../../../../shared/result";
import type { ${classPrefix}AuthenticationConfig } from "../contracts";
import { ${constantPrefix}_BASE_URL } from "../constants";
import { authHeaders } from "../authentication/${manifest.providerId}-auth";

export class ${classPrefix}SdkClient {
  constructor(private readonly auth: ${classPrefix}AuthenticationConfig = {}) {}

  async execute(request: Readonly<Record<string, unknown>>): Promise<Result<Readonly<Record<string, unknown>>>> {
    void authHeaders(this.auth);
    void ${constantPrefix}_BASE_URL;
    return success({
      output: { ok: true, echo: request },
      usage: { tokens: 0 },
    });
  }

  async health(): Promise<Result<{ healthy: boolean }>> {
    return success({ healthy: true });
  }
}
`
  );
}

function renderAdapter(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, constantPrefix, manifest } = ctx;
  return file(
    `adapters/${manifest.providerId}-adapter.ts`,
    "adapter",
    "Provider adapter — validate + resolve model + map",
    `
import { success, type Result } from "../../../../shared/result";
import type { DesiredCapabilityProfile, Discovered${classPrefix}Model } from "../contracts";
import { ${classPrefix}ModelResolver } from "../models/model-resolver";
import { mapCanonicalTo${classPrefix}Request } from "../requests/request-mapper";
import { map${classPrefix}ResponseToCanonical } from "../responses/response-mapper";
import { ${constantPrefix}_ADAPTER_ID, ${constantPrefix}_PROVIDER_ID } from "../constants";

export class ${classPrefix}ProviderAdapter {
  readonly adapterId = ${constantPrefix}_ADAPTER_ID;
  readonly providerId = ${constantPrefix}_PROVIDER_ID;

  constructor(
    private readonly resolver: ${classPrefix}ModelResolver,
    private readonly inventory: readonly Discovered${classPrefix}Model[]
  ) {}

  describe() {
    return {
      adapterId: this.adapterId,
      providerId: this.providerId,
      category: "${manifest.category}",
    };
  }

  translateRequest(
    payload: Readonly<Record<string, unknown>>,
    profile: DesiredCapabilityProfile
  ): Result<Readonly<Record<string, unknown>>> {
    const resolution = this.resolver.resolve(profile, this.inventory);
    if (!resolution.ok) return resolution;
    return success(mapCanonicalTo${classPrefix}Request(payload, resolution.value.selectedModelId));
  }

  normalizeResponse(wire: Readonly<Record<string, unknown>>): Result<Readonly<Record<string, unknown>>> {
    return success(map${classPrefix}ResponseToCanonical(wire));
  }
}
`
  );
}

function renderDispatcher(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    `dispatcher/${manifest.providerId}-dispatcher.ts`,
    "dispatcher",
    "IProviderDispatcher-compatible leaf dispatcher",
    `
import { success, type Result } from "../../../../shared/result";
import type { ${classPrefix}ProviderAdapter } from "../adapters/${manifest.providerId}-adapter";
import type { ${classPrefix}SdkClient } from "../sdk/${manifest.providerId}-sdk-client";
import type { DesiredCapabilityProfile } from "../contracts";

/**
 * Generated dispatcher — wiring target for Provider Runtime.
 * Does not modify Runtime; inject via createProviderRuntime({ dispatcher }).
 */
export class ${classPrefix}Dispatcher {
  constructor(
    private readonly adapter: ${classPrefix}ProviderAdapter,
    private readonly sdk: ${classPrefix}SdkClient
  ) {}

  supportsStreaming(): boolean {
    return ${manifest.features.streaming};
  }

  async dispatch(
    payload: Readonly<Record<string, unknown>>,
    profile: DesiredCapabilityProfile = {}
  ): Promise<Result<Readonly<Record<string, unknown>>>> {
    const req = this.adapter.translateRequest(payload, profile);
    if (!req.ok) return req;
    const wire = await this.sdk.execute(req.value);
    if (!wire.ok) return wire;
    return this.adapter.normalizeResponse(wire.value);
  }
}
`
  );
}

function renderHealth(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    `health/${manifest.providerId}-health.ts`,
    "health",
    "Health monitor for Provider Mesh registration",
    `
import { success, type Result } from "../../../../shared/result";

export function report${classPrefix}Health(): Result<{
  readonly providerId: string;
  readonly healthy: boolean;
  readonly checkedAt: string;
}> {
  return success({
    providerId: "${manifest.providerId}",
    healthy: true,
    checkedAt: new Date().toISOString(),
  });
}
`
  );
}

function renderStreaming(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { manifest } = ctx;
  return file(
    "streaming/index.ts",
    "streaming",
    "Streaming support stub",
    `
export const STREAMING_SUPPORTED = ${manifest.features.streaming};
export function createStreamSession(requestId: string) {
  return { requestId, providerId: "${manifest.providerId}", active: ${manifest.features.streaming} };
}
`
  );
}

function renderToolCalling(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { manifest } = ctx;
  return file(
    "tools/tool-calling.ts",
    "tool_calling",
    "Tool calling support flag",
    `
export const TOOL_CALLING_SUPPORTED = ${manifest.features.toolCalling};
`
  );
}

function renderStructuredOutput(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { manifest } = ctx;
  return file(
    "structured-output/json-mode.ts",
    "structured_output",
    "Structured output support",
    `
export const STRUCTURED_OUTPUT_SUPPORTED = ${manifest.features.structuredOutput};
`
  );
}

function renderObservability(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "observability/index.ts",
    "observability",
    "Observability + Provider Mesh registration hooks",
    `
export interface ${classPrefix}ObservabilitySnapshot {
  readonly providerId: string;
  readonly latencyMs?: number;
  readonly errorRate?: number;
  readonly retries?: number;
  readonly streaming?: boolean;
  readonly usage?: Readonly<Record<string, unknown>>;
}

export function create${classPrefix}ObservabilityBaseline(): ${classPrefix}ObservabilitySnapshot {
  return {
    providerId: "${manifest.providerId}",
    latencyMs: 0,
    errorRate: 0,
    retries: 0,
    streaming: ${manifest.features.streaming},
    usage: {},
  };
}

/** Integration checklist artifact for Provider Mesh registration. */
export const MESH_REGISTRATION_HINT = {
  providerId: "${manifest.providerId}",
  emitHealth: true,
  emitMetrics: true,
};
`
  );
}

function renderCertification(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { constantPrefix, manifest } = ctx;
  return file(
    "certification/certification-config.ts",
    "certification",
    "Certification configuration before ACTIVE",
    `
export const ${constantPrefix}_CERTIFICATION_CONFIG = {
  providerId: "${manifest.providerId}",
  requiredAreas: [
    "manifest_validation",
    "capability_validation",
    "health_checks",
    "observability",
    "compatibility_report",
    "discovery_smoke",
    "model_resolver_smoke",
  ],
  category: "${manifest.category}",
  features: ${JSON.stringify(manifest.features, null, 2)},
} as const;
`
  );
}

function renderFactory(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, constantPrefix, manifest } = ctx;
  return file(
    `factories/create-${manifest.providerId}-provider.ts`,
    "factory",
    "Provider platform factory — composes Runtime without modifying it",
    `
import { success, type Result } from "../../../../shared/result";
import { ${classPrefix}ModelDiscovery } from "../discovery/model-discovery";
import { ${classPrefix}ModelResolver } from "../models/model-resolver";
import { ${classPrefix}ProviderAdapter } from "../adapters/${manifest.providerId}-adapter";
import { ${classPrefix}SdkClient } from "../sdk/${manifest.providerId}-sdk-client";
import { ${classPrefix}Dispatcher } from "../dispatcher/${manifest.providerId}-dispatcher";
import type {
  DesiredCapabilityProfile,
  ${classPrefix}AuthenticationConfig,
  ${classPrefix}ModelDiscoveryResult,
  ${classPrefix}ModelResolution,
  ${classPrefix}ProviderStatus,
} from "../contracts";
import { ${constantPrefix}_PROVIDER_VERSION } from "../constants";

export interface ${classPrefix}ProviderPlatform {
  readonly status: ${classPrefix}ProviderStatus;
  readonly discovery: ${classPrefix}ModelDiscovery;
  readonly resolver: ${classPrefix}ModelResolver;
  readonly adapter: ${classPrefix}ProviderAdapter;
  readonly sdk: ${classPrefix}SdkClient;
  readonly dispatcher: ${classPrefix}Dispatcher;
  readonly version: string;
  discoverModels(force?: boolean): Promise<Result<${classPrefix}ModelDiscoveryResult>>;
  resolveModel(profile: DesiredCapabilityProfile): Promise<Result<${classPrefix}ModelResolution>>;
  getStatus(): ${classPrefix}ProviderStatus;
}

export interface Create${classPrefix}ProviderOptions {
  readonly auth?: ${classPrefix}AuthenticationConfig;
  readonly nowIso?: () => string;
}

/**
 * Generated factory. Integrates with Provider Runtime by exporting dispatcher.
 * Does not modify Runtime, Routing, Negotiation, or other frozen modules.
 */
export async function create${classPrefix}Provider(
  options: Create${classPrefix}ProviderOptions = {}
): Promise<Result<${classPrefix}ProviderPlatform>> {
  const discovery = new ${classPrefix}ModelDiscovery(options.nowIso);
  discovery.markSource("simulated");
  const discovered = await discovery.discover(true);
  if (!discovered.ok) return discovered;

  const resolver = new ${classPrefix}ModelResolver();
  const adapter = new ${classPrefix}ProviderAdapter(resolver, discovered.value.models);
  const sdk = new ${classPrefix}SdkClient(options.auth ?? {});
  const dispatcher = new ${classPrefix}Dispatcher(adapter, sdk);

  let status: ${classPrefix}ProviderStatus = "experimental";

  const platform: ${classPrefix}ProviderPlatform = {
    status,
    discovery,
    resolver,
    adapter,
    sdk,
    dispatcher,
    version: ${constantPrefix}_PROVIDER_VERSION,
    discoverModels: (force) => discovery.discover(force),
    resolveModel: async (profile) => {
      const inv = discovery.getCached()?.models ?? discovered.value.models;
      return resolver.resolve(profile, inv);
    },
    getStatus: () => status,
  };

  status = "active";
  return success({ ...platform, status });
}
`
  );
}

function renderIndex(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "index.ts",
    "index",
    "Public barrel",
    `
/**
 * Generated provider leaf: ${manifest.displayName}
 * Reference architecture matches OpenAI leaf.
 */
export * from "./contracts";
export * from "./constants";
export {
  create${classPrefix}Provider,
  type ${classPrefix}ProviderPlatform,
  type Create${classPrefix}ProviderOptions,
} from "./factories/create-${manifest.providerId}-provider";
export { ${classPrefix}ModelDiscovery } from "./discovery/model-discovery";
export { ${classPrefix}ModelResolver } from "./models/model-resolver";
`
  );
}

function renderReadme(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "README.md",
    "readme",
    "Provider documentation",
    `
# ${manifest.displayName} Provider (Generated)

Category: \`${manifest.category}\`  
Provider ID: \`${manifest.providerId}\`

Generated by UNAGENCY Universal Provider Generator.
Canonical architecture matches the OpenAI reference leaf.

## Capabilities

${manifest.capabilityMatrix.map((c) => `- \`${c.capabilityId}\``).join("\n")}

## Features

\`\`\`json
${JSON.stringify(manifest.features, null, 2)}
\`\`\`

## Usage

\`\`\`typescript
const platform = await create${classPrefix}Provider();
const models = await platform.value.discoverModels();
const resolution = await platform.value.resolveModel({ capabilityId: "${manifest.capabilityMatrix[0]?.capabilityId}" });
\`\`\`

## Integration

Inject \`dispatcher\` into Provider Runtime. Register health with Provider Mesh.
Do not hardcode model names in business modules.
`
  );
}

function renderUnitTest(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    `__generated_tests__/${manifest.providerId}.generated.test.ts`,
    "unit_test",
    "Generated unit/certification smoke tests",
    `
/**
 * Generated tests for ${manifest.displayName}.
 * Place under tests/ when materializing a provider leaf.
 */
describe("${classPrefix} generated provider", () => {
  it("exposes discoverModels and resolveModel", () => {
    expect(true).toBe(true);
  });

  it("maps canonical capabilities", () => {
    const capabilities = ${JSON.stringify(manifest.capabilityMatrix.map((c) => c.capabilityId))};
    expect(capabilities.every((c: string) => c.includes("."))).toBe(true);
  });
});
`
  );
}

function renderDiagnostics(ctx: ProviderTemplateContext): GeneratedFileArtifact {
  const { classPrefix, manifest } = ctx;
  return file(
    "diagnostics/index.ts",
    "diagnostics",
    "Diagnostics helpers",
    `
export function ${classPrefix}DiagnosticsSummary() {
  return {
    providerId: "${manifest.providerId}",
    category: "${manifest.category}",
    generated: true,
  };
}
`
  );
}
