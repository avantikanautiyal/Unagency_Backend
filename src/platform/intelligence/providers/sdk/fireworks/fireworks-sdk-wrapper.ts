/**
 * Fireworks SDK wrapper (placeholder).
 */

import type { IFireworksSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class FireworksSdkWrapper
  extends AbstractProviderSdkClient
  implements IFireworksSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "fireworks" });
  }
}
