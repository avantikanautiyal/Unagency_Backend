/**
 * In-memory SDK registry.
 *
 * Purpose: Own SDK wrapper registration and resolution.
 * Responsibilities: register/resolve/remove/list/describe/validate.
 * Usage: Injected into the SDK engine.
 * Future Extension: Versioned registration.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError, ProviderError } from "../../../shared/errors";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkVendor } from "../contracts/enums";
import type { SdkClientId } from "../contracts/identifiers";
import type { IProviderSdkClient } from "../interfaces/client";
import type {
  ISdkRegistry,
  SdkValidationIssue,
  SdkValidationResult,
} from "../interfaces/registry";

export class InMemorySdkRegistry implements ISdkRegistry {
  private readonly byVendor = new Map<SdkVendor, IProviderSdkClient>();
  private readonly byId = new Map<string, IProviderSdkClient>();

  register(client: IProviderSdkClient): Result<void> {
    if (this.byVendor.has(client.vendor)) {
      return failure(
        new ProviderError("SDK client already registered", {
          vendor: client.vendor,
        })
      );
    }
    const descriptor = client.describe();
    this.byVendor.set(client.vendor, client);
    this.byId.set(String(descriptor.clientId), client);
    return success(undefined);
  }

  resolve(vendor: SdkVendor): Result<IProviderSdkClient> {
    const client = this.byVendor.get(vendor);
    if (!client) {
      return failure(
        new NotFoundError("no SDK client for vendor", { vendor })
      );
    }
    return success(client);
  }

  resolveById(clientId: SdkClientId): Result<IProviderSdkClient> {
    const client = this.byId.get(String(clientId));
    if (!client) {
      return failure(
        new NotFoundError("no SDK client for id", { clientId })
      );
    }
    return success(client);
  }

  remove(vendor: SdkVendor): Result<void> {
    const client = this.byVendor.get(vendor);
    if (!client) {
      return failure(
        new NotFoundError("no SDK client to remove", { vendor })
      );
    }
    this.byVendor.delete(vendor);
    this.byId.delete(String(client.describe().clientId));
    return success(undefined);
  }

  list(): readonly SdkVendor[] {
    return [...this.byVendor.keys()];
  }

  describe(vendor: SdkVendor): Result<SdkClientDescriptor> {
    const client = this.byVendor.get(vendor);
    if (!client) {
      return failure(
        new NotFoundError("no SDK client for vendor", { vendor })
      );
    }
    return success(client.describe());
  }

  validate(client: IProviderSdkClient): Result<SdkValidationResult> {
    const descriptor = client.describe();
    const issues: SdkValidationIssue[] = [];

    if (descriptor.vendor !== client.vendor) {
      issues.push({
        code: "vendor_mismatch",
        message: "descriptor vendor does not match client vendor",
        severity: "error",
      });
    }
    if (!descriptor.version?.raw) {
      issues.push({
        code: "missing_version",
        message: "SDK client descriptor requires a version",
        severity: "error",
      });
    }

    return success({
      valid: issues.every((i) => i.severity !== "error"),
      issues,
    });
  }
}
