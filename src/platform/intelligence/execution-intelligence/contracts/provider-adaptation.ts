/**
 * Provider adaptation hints (no SDK logic).
 */

import type { ProviderId } from "../../shared/identifiers";

export interface ProviderAdaptationHints {
  readonly providerId?: ProviderId;
  readonly preferredFormatting: string;
  readonly reasoningStyle: string;
  readonly structuredOutputPreference: boolean;
  readonly toolCallingPreference: boolean;
  readonly streamingPreference: boolean;
  readonly contextPreference: string;
  readonly hints: readonly string[];
}
