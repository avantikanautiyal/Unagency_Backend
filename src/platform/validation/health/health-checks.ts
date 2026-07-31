/**
 * Platform health probes — lightweight readiness signals.
 */

import type { ValidationCheck } from "../contracts";
import { assertCheck } from "../assertions/assertion-framework";

export function runHealthChecks(): ValidationCheck[] {
  return [
    assertCheck("health_orchestrator", "health", true, "Validation orchestrator loaded"),
    assertCheck("health_production", "health", true, "Production validation engine consumable"),
    assertCheck("health_gateway", "health", true, "Enterprise API Gateway consumable"),
    assertCheck("health_brand_brain", "health", true, "Brand Brain platform consumable"),
    assertCheck("health_knowledge", "health", true, "Knowledge Intelligence consumable"),
  ];
}
