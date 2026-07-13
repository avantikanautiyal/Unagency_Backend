/**
 * xAI SDK wrapper (placeholder).
 */

import type { IXaiSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class XaiSdkWrapper
  extends AbstractProviderSdkClient
  implements IXaiSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "xai" });
  }
}
