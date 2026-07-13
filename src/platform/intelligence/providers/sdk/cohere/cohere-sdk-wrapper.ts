/**
 * Cohere SDK wrapper (placeholder).
 */

import type { ICohereSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class CohereSdkWrapper
  extends AbstractProviderSdkClient
  implements ICohereSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "cohere" });
  }
}
