/**
 * Alibaba SDK wrapper (placeholder).
 */

import type { IAlibabaSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class AlibabaSdkWrapper
  extends AbstractProviderSdkClient
  implements IAlibabaSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "alibaba" });
  }
}
