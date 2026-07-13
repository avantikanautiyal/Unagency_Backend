/**
 * Centralized configuration for the Intelligence Platform.
 * No other module may read process.env for intelligence settings.
 */

import { loadAppConfig, type AppConfig } from "./app.config";
import {
  loadIntelligenceConfig,
  type IntelligenceConfig,
} from "./intelligence.config";
import { loadProvidersConfig, type ProvidersConfig } from "./providers.config";
import { loadTelemetryConfig, type TelemetryConfig } from "./telemetry.config";
import { loadSecurityConfig, type SecurityConfig } from "./security.config";
import { loadKnowledgeConfig, type KnowledgeConfig } from "./knowledge.config";
import { loadWorkflowConfig, type WorkflowConfig } from "./workflow.config";
import {
  loadEvaluationConfig,
  type EvaluationConfig,
} from "./evaluation.config";

export type {
  AppConfig,
  IntelligenceConfig,
  ProvidersConfig,
  TelemetryConfig,
  SecurityConfig,
  KnowledgeConfig,
  WorkflowConfig,
  EvaluationConfig,
};

export interface IntelligencePlatformConfig {
  readonly app: AppConfig;
  readonly intelligence: IntelligenceConfig;
  readonly providers: ProvidersConfig;
  readonly telemetry: TelemetryConfig;
  readonly security: SecurityConfig;
  readonly knowledge: KnowledgeConfig;
  readonly workflow: WorkflowConfig;
  readonly evaluation: EvaluationConfig;
}

let cachedConfig: IntelligencePlatformConfig | undefined;

export function loadIntelligencePlatformConfig(
  forceReload = false
): IntelligencePlatformConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  cachedConfig = {
    app: loadAppConfig(),
    intelligence: loadIntelligenceConfig(),
    providers: loadProvidersConfig(),
    telemetry: loadTelemetryConfig(),
    security: loadSecurityConfig(),
    knowledge: loadKnowledgeConfig(),
    workflow: loadWorkflowConfig(),
    evaluation: loadEvaluationConfig(),
  };

  return cachedConfig;
}

export function getIntelligencePlatformConfig(): IntelligencePlatformConfig {
  return loadIntelligencePlatformConfig();
}

export * from "./app.config";
export * from "./intelligence.config";
export * from "./providers.config";
export * from "./telemetry.config";
export * from "./security.config";
export * from "./knowledge.config";
export * from "./workflow.config";
export * from "./evaluation.config";
