/**
 * Meta Llama SDK wrapper (placeholder).
 */

import type { IMetaSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class MetaSdkWrapper
  extends AbstractProviderSdkClient
  implements IMetaSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "meta" });
  }
}
