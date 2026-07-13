/**
 * Abstract SDK client base.
 *
 * Purpose: Reusable base for all placeholder SDK wrappers.
 * Responsibilities: describe(), health(), NOT_IMPLEMENTED execute/stream/auth.
 * Usage: Extended by every vendor wrapper.
 * Future Extension: Transport delegation hook for real integrations.
 *
 * NO vendor SDK objects are ever exposed. NO networking.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotImplementedError } from "../../../shared/errors";
import type { SdkAuthentication } from "../contracts/authentication";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkVendor } from "../contracts/enums";
import type { SdkExecutionContext } from "../contracts/context";
import type { SdkHealth, SdkStreamingChunk } from "../contracts/health-result";
import type { SdkRequest, SdkResponse } from "../contracts/request-response";
import type { SdkClientId } from "../contracts/identifiers";
import type { SdkVersion } from "../contracts/version";
import type { IProviderSdkClient } from "../interfaces/client";
import { capabilityForVendor } from "./capability-catalog";

export interface AbstractSdkClientOptions {
  readonly clientId: SdkClientId;
  readonly vendor: SdkVendor;
  readonly version: SdkVersion;
  readonly models?: SdkClientDescriptor["models"];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly nowIso?: () => string;
}

export abstract class AbstractProviderSdkClient implements IProviderSdkClient {
  readonly vendor: SdkVendor;
  protected readonly clientId: SdkClientId;
  protected readonly version: SdkVersion;
  protected readonly models: SdkClientDescriptor["models"];
  protected readonly metadata?: Readonly<Record<string, unknown>>;
  protected readonly nowIso: () => string;

  constructor(options: AbstractSdkClientOptions) {
    this.vendor = options.vendor;
    this.clientId = options.clientId;
    this.version = options.version;
    this.models = options.models ?? [];
    this.metadata = options.metadata;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  describe(): SdkClientDescriptor {
    return {
      clientId: this.clientId,
      vendor: this.vendor,
      version: this.version,
      capability: capabilityForVendor(this.vendor),
      models: this.models,
      metadata: this.metadata,
    };
  }

  async execute(
    _request: SdkRequest,
    _context: SdkExecutionContext
  ): Promise<Result<SdkResponse>> {
    return failure(this.notImplemented("execute"));
  }

  async stream(
    _request: SdkRequest,
    _context: SdkExecutionContext
  ): Promise<Result<AsyncIterable<SdkStreamingChunk>>> {
    return failure(this.notImplemented("stream"));
  }

  health(): Result<SdkHealth> {
    return success({
      vendor: this.vendor,
      state: "unconfigured",
      configured: false,
      registered: true,
      checkedAt: this.nowIso(),
      details: { placeholder: true },
    });
  }

  async authenticate(_auth: SdkAuthentication): Promise<Result<void>> {
    return failure(this.notImplemented("authenticate"));
  }

  async shutdown(): Promise<Result<void>> {
    return success(undefined);
  }

  protected notImplemented(operation: string): NotImplementedError {
    return new NotImplementedError(
      `${this.vendor} SDK wrapper ${operation} is reserved for a future milestone`,
      { vendor: this.vendor, operation }
    );
  }
}
