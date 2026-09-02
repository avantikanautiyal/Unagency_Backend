#!/usr/bin/env npx ts-node
/**
 * Priority 3 — Production reality & integration audit (deterministic, zero paid provider calls).
 *
 * Usage:
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/priority3-production-integration-audit.ts
 *   npm run audit:production
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import {
  logProductionIntegrationAudit,
  runProductionIntegrationAudit,
} from "../src/platform/os/observability/production-integration-audit";
import { PRODUCTION_AUDIT_PREFIX } from "../src/platform/os/observability/production-integration-audit-contract";

async function main(): Promise<void> {
  if (process.env.ADAPTIVE_ROUTING_ENABLED === "true") {
    console.error(`${PRODUCTION_AUDIT_PREFIX} ABORT: ADAPTIVE_ROUTING_ENABLED must be false`);
    process.exit(1);
  }

  const result = await runProductionIntegrationAudit({ env: process.env });
  logProductionIntegrationAudit(result);

  if (result.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${PRODUCTION_AUDIT_PREFIX} fatal:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
