/**
 * Anthropic SDK wrapper (placeholder).
 */

import type { IAnthropicSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class AnthropicSdkWrapper
  extends AbstractProviderSdkClient
  implements IAnthropicSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "anthropic" });
  }
}
