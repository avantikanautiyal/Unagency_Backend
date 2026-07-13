/**
 * Gemini SDK wrapper (placeholder).
 */

import type { IGeminiSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class GeminiSdkWrapper
  extends AbstractProviderSdkClient
  implements IGeminiSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "gemini" });
  }
}
