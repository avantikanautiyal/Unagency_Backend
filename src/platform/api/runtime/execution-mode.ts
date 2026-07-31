/**
 * Enterprise API execution mode — authoritative runtime configuration.
 *
 * STUB:        Synthetic API execution (no Integration OS provider path).
 * SIMULATED:   Full Intelligence OS pipeline; ControllableDispatcher (no network).
 * LIVE:        Full Intelligence OS pipeline; real provider dispatcher (explicit only).
 */

import type { CreateEnterpriseApiOptions } from "../factories/create-enterprise-api-platform";

export type EnterpriseApiExecutionMode = "stub" | "simulated" | "live";

/** @deprecated Use EnterpriseApiExecutionMode "simulated" */
export type LegacyEnterpriseApiExecutionMode = EnterpriseApiExecutionMode | "integration";

const VALID_MODES = new Set(["stub", "simulated", "integration", "live"]);

export function parseEnterpriseApiExecutionModeFromEnv(
  env: NodeJS.ProcessEnv = process.env
): EnterpriseApiExecutionMode {
  const raw = env.ENTERPRISE_API_EXECUTION_MODE?.trim().toLowerCase();
  if (raw) {
    if (raw === "integration") return "simulated";
    if (raw === "stub" || raw === "simulated" || raw === "live") return raw;
    throw new Error(
      `Invalid ENTERPRISE_API_EXECUTION_MODE="${env.ENTERPRISE_API_EXECUTION_MODE}". ` +
        `Expected stub | simulated | live`
    );
  }
  if (env.ENTERPRISE_API_USE_INTEGRATION_LAYER === "true") {
    return "simulated";
  }
  return "stub";
}

export function validateEnterpriseApiExecutionConfig(
  mode: EnterpriseApiExecutionMode,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (mode === "live" && !env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      "ENTERPRISE_API_EXECUTION_MODE=live requires OPENAI_API_KEY to be set"
    );
  }
  const raw = env.ENTERPRISE_API_EXECUTION_MODE?.trim();
  if (raw && !VALID_MODES.has(raw.toLowerCase())) {
    throw new Error(`Invalid ENTERPRISE_API_EXECUTION_MODE="${raw}"`);
  }
}

export function resolveEnterpriseApiExecutionMode(
  options: CreateEnterpriseApiOptions = {}
): EnterpriseApiExecutionMode {
  if (options.executionMode) {
    return options.executionMode === "integration" ? "simulated" : options.executionMode;
  }
  if (options.integration) {
    const injected = (options.integration as { executionMode?: string }).executionMode;
    if (injected === "live") return "live";
    return "simulated";
  }
  if (options.useIntegrationLayer === true) {
    return "simulated";
  }
  return "stub";
}

export function integrationPipelineModeFor(
  mode: EnterpriseApiExecutionMode
): "full" | "planning_through_routing" {
  // M10.5: SIMULATED must reach ControllableDispatcher (no network) so
  // application clients receive presentation-safe results via POST /v1/executions.
  // STUB remains planning-only when Integration OS is used; LIVE is full.
  if (mode === "stub") return "planning_through_routing";
  return "full";
}

export function executionModeLabel(mode: EnterpriseApiExecutionMode): string {
  switch (mode) {
    case "stub":
      return "STUB (StubJobExecutor — no Intelligence OS provider execution)";
    case "simulated":
      return "SIMULATED (Intelligence OS — ControllableDispatcher, no provider network)";
    case "live":
      return "LIVE (Intelligence OS — real provider dispatch)";
  }
}

export function readEnterpriseApiRuntimeOptionsFromEnv(): CreateEnterpriseApiOptions {
  const executionMode = parseEnterpriseApiExecutionModeFromEnv();
  validateEnterpriseApiExecutionConfig(executionMode);
  const isProduction = process.env.NODE_ENV === "production";
  const seedDemoTenant = isProduction
    ? process.env.ENTERPRISE_API_SEED_DEMO_TENANT === "true"
    : process.env.ENTERPRISE_API_SEED_DEMO_TENANT !== "false";
  return {
    executionMode,
    useIntegrationLayer:
      executionMode === "simulated" || executionMode === "live",
    seedDemoTenant,
    enableFirebaseBridge: process.env.ENTERPRISE_API_FIREBASE_BRIDGE === "true",
  };
}
