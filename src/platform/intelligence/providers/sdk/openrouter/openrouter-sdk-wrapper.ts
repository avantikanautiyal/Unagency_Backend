/**
 * OpenRouter SDK wrapper (placeholder).
 */

import type { IOpenRouterSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class OpenRouterSdkWrapper
  extends AbstractProviderSdkClient
  implements IOpenRouterSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "openrouter" });
  }
}
