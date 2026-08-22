/**
 * Perplexity SDK wrapper (placeholder).
 */

import type { IPerplexitySdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class PerplexitySdkWrapper
  extends AbstractProviderSdkClient
  implements IPerplexitySdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "perplexity" });
  }
}
