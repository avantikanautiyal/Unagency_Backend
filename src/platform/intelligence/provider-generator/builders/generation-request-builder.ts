/**
 * Manifest request builder.
 */

import type { ProviderGenerationRequest, ProviderManifestSpec } from "../contracts/manifest";
import type { GenerationMode } from "../contracts/enums";

export class ProviderGenerationRequestBuilder {
  private requestId = "gen_req";
  private manifest?: ProviderManifestSpec;
  private mode: GenerationMode = "dry_run";
  private skipTests = false;

  static create(): ProviderGenerationRequestBuilder {
    return new ProviderGenerationRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withManifest(manifest: ProviderManifestSpec): this {
    this.manifest = manifest;
    return this;
  }

  withMode(mode: GenerationMode): this {
    this.mode = mode;
    return this;
  }

  withSkipTests(skip: boolean): this {
    this.skipTests = skip;
    return this;
  }

  build(): ProviderGenerationRequest {
    if (!this.manifest) throw new Error("manifest required");
    return {
      requestId: this.requestId,
      manifest: this.manifest,
      mode: this.mode,
      skipTests: this.skipTests,
    };
  }
}
