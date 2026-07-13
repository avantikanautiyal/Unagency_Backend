/**
 * Context validator — completeness, scope, permissions, identity, capability.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ContextValidationResult,
  IntelligenceContext,
} from "../contracts/intelligence-context";
import { ContextValidationError } from "../errors";
import type { IContextValidator } from "../interfaces/validation";

export class ContextValidator implements IContextValidator {
  validate(context: IntelligenceContext): Result<ContextValidationResult> {
    const issues: string[] = [];

    if (!context.identity.organizationId) {
      issues.push("identity.organizationId is required");
    }
    if (!context.identity.workspaceId) {
      issues.push("identity.workspaceId is required");
    }
    if (!context.scope.capabilityId) {
      issues.push("scope.capabilityId is required");
    }
    if (
      String(context.identity.organizationId) !==
      String(context.scope.organizationId)
    ) {
      issues.push("identity and scope organizationId mismatch");
    }
    if (
      String(context.identity.workspaceId) !== String(context.scope.workspaceId)
    ) {
      issues.push("identity and scope workspaceId mismatch");
    }
    if (!context.organization.organizationId) {
      issues.push("organization section incomplete");
    }
    if (!context.workspace.workspaceId) {
      issues.push("workspace section incomplete");
    }
    if (!context.capability.capabilityId) {
      issues.push("capability section incomplete");
    }
    if (
      String(context.capability.capabilityId) !==
      String(context.scope.capabilityId)
    ) {
      issues.push("capability section does not match scope");
    }
    if (!context.language.language) {
      issues.push("language is required");
    }
    if (!context.locale.locale) {
      issues.push("locale is required");
    }
    if (!context.timeZone.timeZone) {
      issues.push("timeZone is required");
    }
    if (!context.platform.platformName) {
      issues.push("platform context incomplete");
    }
    if (!context.metadata.contextId) {
      issues.push("metadata.contextId is required");
    }

    if (issues.length > 0) {
      return failure(
        new ContextValidationError("Context validation failed", { issues })
      );
    }

    return success({
      valid: true,
      issues: [],
      context,
    });
  }
}
