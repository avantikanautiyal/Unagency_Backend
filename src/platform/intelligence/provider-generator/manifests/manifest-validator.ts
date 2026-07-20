/**
 * Manifest validator.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ProviderManifestSpec } from "../contracts/manifest";
import type { IProviderManifestValidator } from "../interfaces/generator";

export class DefaultProviderManifestValidator implements IProviderManifestValidator {
  validate(manifest: ProviderManifestSpec): Result<void> {
    if (!manifest.providerId?.trim()) {
      return failure(new ValidationError("providerId is required"));
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(manifest.providerId)) {
      return failure(
        new ValidationError("providerId must be lowercase alphanumeric with - or _")
      );
    }
    if (!manifest.displayName?.trim()) {
      return failure(new ValidationError("displayName is required"));
    }
    if (!manifest.baseUrl?.trim()) {
      return failure(new ValidationError("baseUrl is required"));
    }
    if (!manifest.discoveryEndpoint?.trim()) {
      return failure(new ValidationError("discoveryEndpoint is required"));
    }
    if (!manifest.supportedModalities?.length) {
      return failure(new ValidationError("supportedModalities required"));
    }
    if (!manifest.features) {
      return failure(new ValidationError("features required"));
    }
    if (!manifest.capabilityMatrix?.length) {
      return failure(new ValidationError("capabilityMatrix must include at least one mapping"));
    }
    for (const entry of manifest.capabilityMatrix) {
      if (!entry.capabilityId.includes(".")) {
        return failure(
          new ValidationError(
            `capabilityId "${entry.capabilityId}" must be capability-first (e.g. marketing.copywriting)`
          )
        );
      }
    }
    return success(undefined);
  }
}
