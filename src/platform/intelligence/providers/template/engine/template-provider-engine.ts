/**
 * Template provider engine — orchestrates standard lifecycle.
 * Architecture only — no networking or execution.
 */

import { success, type Result } from "../../../shared/result";
import type { TemplateLifecycleEvent, TemplateLifecycleState } from "../contracts/lifecycle";
import type { TemplateLifecyclePhase } from "../contracts/enums";
import type { TemplateFeatureMatrix } from "../contracts/features";
import type { TemplateHealthReport } from "../contracts/health";
import type {
  IProviderDiagnostics,
  IProviderHealthEngine,
  IProviderModelMapper,
  IProviderTemplateEngine,
} from "../interfaces/provider-template";

export interface TemplateProviderEngineDeps {
  readonly health: IProviderHealthEngine;
  readonly diagnostics: IProviderDiagnostics;
  readonly modelMapper: IProviderModelMapper;
  readonly nowIso?: () => string;
}

export class TemplateProviderEngine implements IProviderTemplateEngine {
  private phase: TemplateLifecyclePhase = "uninitialized";
  private readonly history: TemplateLifecycleEvent[] = [];
  private readonly nowIso: () => string;

  constructor(private readonly deps: TemplateProviderEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  async bootstrap(): Promise<Result<TemplateLifecycleState>> {
    const steps: TemplateLifecyclePhase[] = [
      "initializing",
      "authenticating",
      "validating",
      "health_checking",
      "loading_models",
      "ready",
    ];

    for (const step of steps) {
      this.transition(step);
      if (step === "loading_models") {
        const models = this.deps.modelMapper.listModels();
        if (!models.ok) return models;
      }
      if (step === "health_checking") {
        const health = await this.deps.health.check();
        if (!health.ok) return health;
      }
    }

    return success(this.lifecycleState());
  }

  async getHealth(): Promise<Result<TemplateHealthReport>> {
    return this.deps.health.check();
  }

  getFeatureMatrix(): Result<TemplateFeatureMatrix> {
    return this.deps.diagnostics.featureMatrix();
  }

  getLifecycle(): TemplateLifecycleState {
    return this.lifecycleState();
  }

  shutdown(): Result<TemplateLifecycleState> {
    this.transition("shutting_down");
    this.transition("shutdown");
    return success(this.lifecycleState());
  }

  private transition(phase: TemplateLifecyclePhase): void {
    this.phase = phase;
    this.history.push({ phase, timestamp: this.nowIso() });
  }

  private lifecycleState(): TemplateLifecycleState {
    return {
      currentPhase: this.phase,
      history: [...this.history],
      ready: this.phase === "ready",
    };
  }
}
