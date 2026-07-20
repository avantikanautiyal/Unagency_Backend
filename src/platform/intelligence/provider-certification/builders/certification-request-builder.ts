/**
 * Certification request builder.
 */

import type { IProviderAdapter } from "../../providers/adapters/interfaces/adapter";
import type { ProviderManifest } from "../../providers/adapters/contracts/provider-manifest";
import type { CertificationRequest } from "../contracts/request";
import type { CertificationMode } from "../contracts/enums";

export class CertificationRequestBuilder {
  private requestId = "";
  private adapter?: IProviderAdapter;
  private manifest?: ProviderManifest;
  private mode?: CertificationMode;

  static create(): CertificationRequestBuilder {
    return new CertificationRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withAdapter(adapter: IProviderAdapter): this {
    this.adapter = adapter;
    return this;
  }

  withManifest(manifest: ProviderManifest): this {
    this.manifest = manifest;
    return this;
  }

  withMode(mode: CertificationMode): this {
    this.mode = mode;
    return this;
  }

  build(): CertificationRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.adapter) throw new Error("adapter required");
    if (!this.manifest) throw new Error("manifest required");
    return Object.freeze({
      requestId: this.requestId,
      adapter: this.adapter,
      manifest: this.manifest,
      mode: this.mode,
    });
  }
}
