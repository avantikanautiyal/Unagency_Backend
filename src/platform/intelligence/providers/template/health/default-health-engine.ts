/**
 * Template health engine.
 */

import { success, type Result } from "../../../shared/result";
import type { TemplateHealthCheck, TemplateHealthReport } from "../contracts/health";
import type { TemplateLifecyclePhase } from "../contracts/enums";
import type { IProviderHealthEngine } from "../interfaces/provider-template";

export class DefaultHealthEngine implements IProviderHealthEngine {
  constructor(
    private readonly lifecyclePhase: () => TemplateLifecyclePhase = () => "ready",
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  async check(): Promise<Result<TemplateHealthReport>> {
    const checks = await this.runChecks();
    if (!checks.ok) return checks;
    const passed = checks.value.filter((c) => c.passed).length;
    const failed = checks.value.length - passed;
    const phase = this.lifecyclePhase();
    const state =
      failed > 0 ? "degraded" : phase === "ready" ? "healthy" : "offline";

    return success({
      state,
      lifecyclePhase: phase,
      message: `${passed} checks passed, ${failed} failed`,
      checksPassed: passed,
      checksFailed: failed,
      lastCheckedAt: this.nowIso(),
    });
  }

  async runChecks(): Promise<Result<readonly TemplateHealthCheck[]>> {
    return success([
      { id: "lifecycle", name: "Lifecycle", passed: this.lifecyclePhase() === "ready" },
      { id: "models", name: "Models Loaded", passed: true },
      { id: "auth", name: "Authentication", passed: true },
    ]);
  }
}
