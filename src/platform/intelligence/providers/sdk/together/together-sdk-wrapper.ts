/**
 * Together AI SDK wrapper (placeholder).
 */

import type { ITogetherSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class TogetherSdkWrapper
  extends AbstractProviderSdkClient
  implements ITogetherSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "together" });
  }
}
