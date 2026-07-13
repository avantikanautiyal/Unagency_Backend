/**
 * Capability builder.
 *
 * Purpose: Construct CapabilityDefinition without large constructors.
 * Responsibilities: Fluent setters and build() producing an immutable definition.
 * Usage: CapabilityBuilder.create().withId(...).build()
 * Future Extension: Load defaults from templates.
 */

import { asCapabilityId, asProviderId } from "../../shared/identifiers";
import type { CapabilityId, ProviderId } from "../../shared/identifiers";
import type { CapabilityConstraints } from "../contracts/capability-constraints";
import type {
  CapabilityCostLimitInline,
  CapabilityDefinition,
  CapabilityEvaluationStrategyInline,
  CapabilityHumanReviewPolicyInline,
  CapabilityModality,
  CapabilityProviderCompatibility,
  CapabilityRetryPolicyInline,
  CapabilitySchema,
  CapabilitySecurityClassification,
  CapabilityTimeoutPolicy,
  CapabilityVisibility,
} from "../contracts/capability-definition";
import type { CapabilityPolicyReferences } from "../contracts/capability-policies";
import type { CapabilityStatus } from "../contracts/capability-status";
import { CapabilityValidationError } from "../errors";
import { CapabilityValidator } from "./capability-validator";

type Mutable<T> = { -readonly [K in keyof T]?: T[K] };

export class CapabilityBuilder {
  private readonly draft: Mutable<CapabilityDefinition> = {
    tags: [],
    fallbackProviders: [],
    requiredPermissions: [],
    supportedModalities: [],
    metadata: {},
    constraints: {},
    policies: {},
    providerCompatibility: { compatibleProviderIds: [] },
    timeout: { timeoutMs: 60_000 },
    retryPolicy: { maxAttempts: 0, backoffMs: 0, strategy: "none" },
    evaluationStrategy: { enabled: false },
    costLimit: {},
    humanReviewPolicy: { required: false },
    visibility: "internal",
    status: "draft",
    securityClassification: "internal",
  };

  private constructor(private readonly nowIso: () => string) {}

  static create(nowIso: () => string = () => new Date().toISOString()): CapabilityBuilder {
    return new CapabilityBuilder(nowIso);
  }

  withId(id: CapabilityId | string): this {
    this.draft.id = typeof id === "string" ? asCapabilityId(id) : id;
    return this;
  }

  withName(name: string): this {
    this.draft.name = name;
    if (!this.draft.displayName) {
      this.draft.displayName = name;
    }
    return this;
  }

  withVersion(version: string): this {
    this.draft.version = version;
    return this;
  }

  withDisplayName(displayName: string): this {
    this.draft.displayName = displayName;
    return this;
  }

  withDescription(description: string): this {
    this.draft.description = description;
    return this;
  }

  withCategory(category: string, subcategory?: string): this {
    this.draft.category = category;
    this.draft.subcategory = subcategory;
    return this;
  }

  withTags(...tags: string[]): this {
    this.draft.tags = tags;
    return this;
  }

  withStatus(status: CapabilityStatus): this {
    this.draft.status = status;
    if (status === "deprecated" && !this.draft.deprecatedAt) {
      this.draft.deprecatedAt = this.nowIso();
    }
    return this;
  }

  withOwner(owner: string): this {
    this.draft.owner = owner;
    return this;
  }

  withVisibility(visibility: CapabilityVisibility): this {
    this.draft.visibility = visibility;
    return this;
  }

  withInputSchema(schema: CapabilitySchema): this {
    this.draft.inputSchema = schema;
    return this;
  }

  withOutputSchema(schema: CapabilitySchema): this {
    this.draft.outputSchema = schema;
    return this;
  }

  withConfigurationSchema(schema: CapabilitySchema): this {
    this.draft.configurationSchema = schema;
    return this;
  }

  withModalities(...modalities: CapabilityModality[]): this {
    this.draft.supportedModalities = modalities;
    return this;
  }

  withProviderCompatibility(
    compatibility: CapabilityProviderCompatibility
  ): this {
    this.draft.providerCompatibility = compatibility;
    return this;
  }

  withDefaultProvider(providerId: ProviderId | string): this {
    this.draft.defaultProvider =
      typeof providerId === "string" ? asProviderId(providerId) : providerId;
    return this;
  }

  withFallbackProviders(...providerIds: Array<ProviderId | string>): this {
    this.draft.fallbackProviders = providerIds.map((id) =>
      typeof id === "string" ? asProviderId(id) : id
    );
    return this;
  }

  withTimeout(timeout: CapabilityTimeoutPolicy | number): this {
    this.draft.timeout =
      typeof timeout === "number" ? { timeoutMs: timeout } : timeout;
    return this;
  }

  withRetryPolicy(retryPolicy: CapabilityRetryPolicyInline): this {
    this.draft.retryPolicy = retryPolicy;
    return this;
  }

  withEvaluation(evaluationStrategy: CapabilityEvaluationStrategyInline): this {
    this.draft.evaluationStrategy = evaluationStrategy;
    return this;
  }

  withCostLimit(costLimit: CapabilityCostLimitInline): this {
    this.draft.costLimit = costLimit;
    return this;
  }

  withHumanReview(humanReviewPolicy: CapabilityHumanReviewPolicyInline): this {
    this.draft.humanReviewPolicy = humanReviewPolicy;
    return this;
  }

  withSecurityClassification(
    securityClassification: CapabilitySecurityClassification
  ): this {
    this.draft.securityClassification = securityClassification;
    return this;
  }

  withRequiredPermissions(...permissions: string[]): this {
    this.draft.requiredPermissions = permissions;
    return this;
  }

  withConstraints(constraints: CapabilityConstraints): this {
    this.draft.constraints = constraints;
    return this;
  }

  withPolicies(policies: CapabilityPolicyReferences): this {
    this.draft.policies = policies;
    return this;
  }

  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this.draft.metadata = metadata;
    return this;
  }

  build(): CapabilityDefinition {
    const now = this.nowIso();
    const capability: CapabilityDefinition = {
      id: this.draft.id as CapabilityId,
      name: this.draft.name ?? "",
      version: this.draft.version ?? "1.0.0",
      displayName: this.draft.displayName ?? this.draft.name ?? "",
      description: this.draft.description ?? "",
      category: this.draft.category ?? "",
      subcategory: this.draft.subcategory,
      tags: this.draft.tags ?? [],
      status: this.draft.status ?? "draft",
      owner: this.draft.owner ?? "",
      visibility: this.draft.visibility ?? "internal",
      inputSchema: this.draft.inputSchema ?? { contentTypes: ["application/json"] },
      outputSchema: this.draft.outputSchema ?? { contentTypes: ["application/json"] },
      configurationSchema: this.draft.configurationSchema,
      supportedModalities: this.draft.supportedModalities ?? ["text"],
      providerCompatibility: this.draft.providerCompatibility ?? {
        compatibleProviderIds: [],
      },
      defaultProvider: this.draft.defaultProvider,
      fallbackProviders: this.draft.fallbackProviders ?? [],
      timeout: this.draft.timeout ?? { timeoutMs: 60_000 },
      retryPolicy: this.draft.retryPolicy ?? {
        maxAttempts: 0,
        backoffMs: 0,
        strategy: "none",
      },
      evaluationStrategy: this.draft.evaluationStrategy ?? { enabled: false },
      costLimit: this.draft.costLimit ?? {},
      humanReviewPolicy: this.draft.humanReviewPolicy ?? { required: false },
      securityClassification: this.draft.securityClassification ?? "internal",
      requiredPermissions: this.draft.requiredPermissions ?? [],
      constraints: this.draft.constraints ?? {},
      policies: this.draft.policies ?? {},
      metadata: this.draft.metadata ?? {},
      createdAt: this.draft.createdAt ?? now,
      updatedAt: now,
      deprecatedAt: this.draft.deprecatedAt,
    };

    const validated = new CapabilityValidator().validate(capability);
    if (!validated.ok) {
      throw validated.error;
    }
    return validated.value;
  }

  /**
   * Build without throwing — returns Result for callers that prefer Result.
   */
  tryBuild():
    | { ok: true; value: CapabilityDefinition }
    | { ok: false; error: CapabilityValidationError } {
    try {
      return { ok: true, value: this.build() };
    } catch (error) {
      if (error instanceof CapabilityValidationError) {
        return { ok: false, error };
      }
      return {
        ok: false,
        error: new CapabilityValidationError("Failed to build capability", {
          cause: error,
        }),
      };
    }
  }
}
