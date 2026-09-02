/**
 * Business platform test helpers — not imported by production code.
 */

import { bootstrapEnterpriseApiRuntime, resetEnterpriseApiRuntimeForTests } from "../../api/runtime";
import { loginDemo } from "../../api/testing";
import type { BusinessPlatformEngine } from "../engine/business-platform-engine";

export type BusinessPlatformTestContext = {
  readonly engine: BusinessPlatformEngine;
  readonly runtime: ReturnType<typeof bootstrapEnterpriseApiRuntime>;
  readonly seed?: {
    organizationId: string;
    workspaceId: string;
    userId: string;
    email: string;
  };
  readonly reset: () => void;
};

export function setupBusinessPlatform(): BusinessPlatformTestContext {
  resetEnterpriseApiRuntimeForTests();
  const runtime = bootstrapEnterpriseApiRuntime({
    executionMode: "simulated",
    seedDemoTenant: true,
  });
  const engine = runtime.platform.businessPlatform;

  let seed: BusinessPlatformTestContext["seed"];
  if (runtime.platform.seed) {
    const apiSeed = runtime.platform.seed;
    const org = engine.createOrganization({
      name: "UNAGENCY Demo",
      ownerEmail: apiSeed.email ?? "admin@unagency.local",
      ownerDisplayName: "Platform Admin",
      organizationId: apiSeed.organizationId,
      ownerUserId: apiSeed.userId,
    });
    if (org.ok) {
      const ws = engine.createWorkspace(apiSeed.organizationId, "Default");
      seed = {
        organizationId: apiSeed.organizationId,
        workspaceId: ws.ok ? ws.value.workspaceId : apiSeed.workspaceId,
        userId: apiSeed.userId,
        email: apiSeed.email ?? "admin@unagency.local",
      };
    }
  }

  return {
    engine,
    runtime,
    seed,
    reset: () => resetEnterpriseApiRuntimeForTests(),
  };
}

export async function gatewayLogin(
  platform: BusinessPlatformTestContext,
): Promise<string> {
  const { token } = await loginDemo(platform.runtime.platform);
  return token;
}

export { BusinessExecutionRequestBuilder } from "./business-builders";
