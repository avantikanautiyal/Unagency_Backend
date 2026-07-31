/**
 * Intelligence OS Integration testing utilities.
 */

import {
  createIntelligenceOsIntegrationPlatform,
  type CreateIntelligenceOsIntegrationOptions,
  type IntelligenceOsIntegrationPlatform,
} from "../factories/create-intelligence-os-integration-platform";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import { seedExecutionContextFixtures } from "../../../business/execution-context/testing/seed-fixtures";
import { asOrganizationId, asWorkspaceId } from "../../shared/identifiers";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 7),
  };
}

export function sampleIntegrationRequest(
  overrides: Partial<IntelligenceOsIntegrationRequest> = {}
): IntelligenceOsIntegrationRequest {
  return {
    requestId: "ios_req_sneaker",
    rawPrompt: "Launch a new sneaker collection with marketing carousel and copy",
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
    scenarioHint: "retail",
    budgetLimit: 500,
    tokenBudgetLimit: 200000,
    correlationId: "corr_ios_1",
    mode: "full",
    metadata: {
      userId: "ios_test_user",
      brandId: "brand_org_1",
    },
    ...overrides,
  };
}

export function setupIntelligenceOsIntegration(
  options: CreateIntelligenceOsIntegrationOptions = {}
): IntelligenceOsIntegrationPlatform {
  const helpers = deterministicHelpers();
  return createIntelligenceOsIntegrationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    executionContextStores: seedExecutionContextFixtures({
      organizationId: "org_1",
      userId: "ios_test_user",
      organizationName: "Integration Test Org",
      brand: {
        brandId: "brand_org_1",
        name: "Integration Brand",
        toneOfVoice: "professional",
      },
    }),
    ...options,
  });
}
