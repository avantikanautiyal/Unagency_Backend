/**
 * Mistral SDK wrapper (placeholder).
 */

import type { IMistralSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class MistralSdkWrapper
  extends AbstractProviderSdkClient
  implements IMistralSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "mistral" });
  }
}
