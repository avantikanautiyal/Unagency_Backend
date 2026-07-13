/**
 * Groq SDK wrapper (placeholder).
 */

import type { IGroqSdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class GroqSdkWrapper
  extends AbstractProviderSdkClient
  implements IGroqSdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "groq" });
  }
}
