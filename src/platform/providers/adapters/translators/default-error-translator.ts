/**
 * Default (adapter-facing) error translator.
 *
 * Purpose: Convert any raw error thrown near an adapter into a ProviderError.
 * Responsibilities: Delegate classification to an IProviderErrorTranslator.
 * Usage: Held by AbstractProviderAdapter; injected for testability.
 * Future Extension: Per-provider error-code maps (M4.5).
 */

import type { ProviderError } from "../contracts/diagnostics";
import type { IErrorTranslator } from "../interfaces/translators";
import type { IProviderErrorTranslator } from "../interfaces/validation";
import { DefaultProviderErrorTranslator } from "../errors/error-translator";

export class DefaultErrorTranslator implements IErrorTranslator {
  constructor(
    private readonly canonicalizer: IProviderErrorTranslator = new DefaultProviderErrorTranslator()
  ) {}

  toProviderError(
    error: unknown,
    context?: Readonly<Record<string, unknown>>
  ): ProviderError {
    return this.canonicalizer.normalize(error, context);
  }
}
