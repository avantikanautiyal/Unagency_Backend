/**
 * Authentication placeholder — implement per provider.
 */

import type { Result } from "../../../shared/result";
import { success } from "../../../shared/result";

export interface TemplateAuthenticationConfig {
  readonly scheme: "api_key" | "bearer" | "oauth" | "service_account" | "anonymous";
  readonly configured: boolean;
}

export class TemplateAuthenticationPlaceholder {
  constructor(private readonly config: TemplateAuthenticationConfig) {}

  validate(): Result<void> {
    if (!this.config.configured && this.config.scheme !== "anonymous") {
      return { ok: false, error: new Error("authentication not configured") as never };
    }
    return success(undefined);
  }
}
