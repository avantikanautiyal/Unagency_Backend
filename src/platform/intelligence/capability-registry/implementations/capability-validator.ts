/**
 * Capability validator.
 *
 * Purpose: Validate capability definitions before they enter the registry.
 * Responsibilities: Required fields, version, schemas, policies, constraints, timeouts.
 * Usage: Injected into CapabilityRegistry.
 * Future Extension: Custom rule plugins.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { CapabilityDefinition } from "../contracts/capability-definition";
import { canTransitionCapabilityStatus } from "../contracts/capability-status";
import { CapabilityVersion } from "../contracts/capability-version";
import { CapabilityValidationError } from "../errors";
import type { ICapabilityValidator } from "../interfaces/capability-validator";

export class CapabilityValidator implements ICapabilityValidator {
  validate(capability: CapabilityDefinition): Result<CapabilityDefinition> {
    const issues: string[] = [];

    if (!capability.id) {
      issues.push("id is required");
    }
    if (!capability.name?.trim()) {
      issues.push("name is required");
    }
    if (!capability.displayName?.trim()) {
      issues.push("displayName is required");
    }
    if (!capability.description?.trim()) {
      issues.push("description is required");
    }
    if (!capability.category?.trim()) {
      issues.push("category is required");
    }
    if (!capability.owner?.trim()) {
      issues.push("owner is required");
    }
    if (!capability.status) {
      issues.push("status is required");
    }

    const version = CapabilityVersion.tryParse(capability.version);
    if (!version) {
      issues.push("version must be semver major.minor.patch");
    }

    if (!capability.inputSchema?.contentTypes?.length) {
      issues.push("inputSchema.contentTypes must be non-empty");
    }
    if (!capability.outputSchema?.contentTypes?.length) {
      issues.push("outputSchema.contentTypes must be non-empty");
    }

    if (!capability.supportedModalities?.length) {
      issues.push("supportedModalities must be non-empty");
    }

    if (capability.timeout.timeoutMs <= 0) {
      issues.push("timeout.timeoutMs must be positive");
    }

    if (capability.retryPolicy.maxAttempts < 0) {
      issues.push("retryPolicy.maxAttempts must be >= 0");
    }
    if (capability.retryPolicy.backoffMs < 0) {
      issues.push("retryPolicy.backoffMs must be >= 0");
    }

    if (
      capability.evaluationStrategy.sampleRate !== undefined &&
      (capability.evaluationStrategy.sampleRate < 0 ||
        capability.evaluationStrategy.sampleRate > 1)
    ) {
      issues.push("evaluationStrategy.sampleRate must be between 0 and 1");
    }

    if (
      capability.costLimit.maxCost !== undefined &&
      capability.costLimit.maxCost < 0
    ) {
      issues.push("costLimit.maxCost must be >= 0");
    }
    if (
      capability.costLimit.maxTokens !== undefined &&
      capability.costLimit.maxTokens < 0
    ) {
      issues.push("costLimit.maxTokens must be >= 0");
    }

    if (
      capability.defaultProvider &&
      capability.providerCompatibility.compatibleProviderIds.length > 0 &&
      !capability.providerCompatibility.compatibleProviderIds.includes(
        capability.defaultProvider
      )
    ) {
      issues.push("defaultProvider must be in providerCompatibility list");
    }

    for (const fallback of capability.fallbackProviders) {
      if (
        capability.providerCompatibility.compatibleProviderIds.length > 0 &&
        !capability.providerCompatibility.compatibleProviderIds.includes(
          fallback
        )
      ) {
        issues.push(
          `fallbackProvider ${String(fallback)} must be in providerCompatibility list`
        );
      }
    }

    const constraints = capability.constraints;
    if (constraints.maxTokens && constraints.maxTokens.maxTokens <= 0) {
      issues.push("constraints.maxTokens.maxTokens must be positive");
    }
    if (constraints.maxDuration && constraints.maxDuration.maxDurationMs <= 0) {
      issues.push("constraints.maxDuration.maxDurationMs must be positive");
    }
    if (constraints.maxCost && constraints.maxCost.maxCost < 0) {
      issues.push("constraints.maxCost.maxCost must be >= 0");
    }

    if (!capability.createdAt || Number.isNaN(Date.parse(capability.createdAt))) {
      issues.push("createdAt must be a valid ISO timestamp");
    }
    if (!capability.updatedAt || Number.isNaN(Date.parse(capability.updatedAt))) {
      issues.push("updatedAt must be a valid ISO timestamp");
    }
    if (
      capability.deprecatedAt &&
      Number.isNaN(Date.parse(capability.deprecatedAt))
    ) {
      issues.push("deprecatedAt must be a valid ISO timestamp");
    }

    if (
      capability.status === "deprecated" &&
      capability.deprecatedAt === undefined
    ) {
      issues.push("deprecatedAt is required when status is deprecated");
    }

    // Self-transition check ensures status is a known lifecycle value
    if (
      capability.status &&
      !canTransitionCapabilityStatus(capability.status, capability.status)
    ) {
      issues.push("status is invalid");
    }

    if (issues.length > 0) {
      return failure(
        new CapabilityValidationError("Capability validation failed", {
          issues,
          capabilityId: capability.id,
          version: capability.version,
        })
      );
    }

    return success(capability);
  }
}
