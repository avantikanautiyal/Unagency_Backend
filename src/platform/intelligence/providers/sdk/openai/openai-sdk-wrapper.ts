/**
 * OpenAI SDK wrapper (placeholder).
 *
 * Purpose: Future integration point for the OpenAI SDK.
 * Responsibilities: Implements IOpenAISdk; returns NOT_IMPLEMENTED.
 * Usage: Registered in ISdkRegistry.
 * Future Extension: Real OpenAI SDK calls via Transport Platform.
 *
 * NO openai package. NO networking. NO SDK logic.
 */

import type { IOpenAISdk } from "../interfaces/client";
import { AbstractProviderSdkClient } from "../common/abstract-sdk-client";
import type { AbstractSdkClientOptions } from "../common/abstract-sdk-client";

export class OpenAISdkWrapper
  extends AbstractProviderSdkClient
  implements IOpenAISdk
{
  constructor(options: Omit<AbstractSdkClientOptions, "vendor">) {
    super({ ...options, vendor: "openai" });
  }
}
