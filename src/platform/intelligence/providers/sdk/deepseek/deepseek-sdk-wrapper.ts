/**
 * DeepSeek SDK wrapper (placeholder).
 */

import type { IDeepSeekSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class DeepSeekSdkWrapper
  extends AbstractProviderSdkClient
  implements IDeepSeekSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "deepseek" });
  }
}
