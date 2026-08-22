/**
 * Moonshot SDK wrapper (placeholder).
 */

import type { IMoonshotSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class MoonshotSdkWrapper
  extends AbstractProviderSdkClient
  implements IMoonshotSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "moonshot" });
  }
}
