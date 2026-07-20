/**
 * Business Platform factory — SaaS layer above Enterprise API Gateway only.
 */

import {
  createEnterpriseApiPlatform,
  type EnterpriseApiPlatform,
  type CreateEnterpriseApiOptions,
} from "../../api/factories/create-enterprise-api-platform";
import { BusinessPlatformEngine } from "../engine/business-platform-engine";
import type { IBusinessPlatform } from "../interfaces";

export interface BusinessPlatform {
  readonly engine: IBusinessPlatform;
  readonly api: EnterpriseApiPlatform;
  readonly seed?: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
    readonly password: string;
  };
}

export interface CreateBusinessPlatformOptions extends CreateEnterpriseApiOptions {
  readonly api?: EnterpriseApiPlatform;
  /** Align business org/user/workspace ids with API seed (default true). */
  readonly alignWithApiSeed?: boolean;
}

export function createBusinessPlatform(
  options: CreateBusinessPlatformOptions = {}
): BusinessPlatform {
  const api =
    options.api ??
    createEnterpriseApiPlatform({
      nowIso: options.nowIso,
      clockMs: options.clockMs,
      createId: options.createId,
      seedDemoTenant: options.seedDemoTenant ?? true,
      useIntegrationLayer: options.useIntegrationLayer,
      distributed: options.distributed,
      integration: options.integration,
    });

  const engine = new BusinessPlatformEngine({
    gateway: api.gateway,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  let seed: BusinessPlatform["seed"];
  if (options.alignWithApiSeed !== false && api.seed) {
    const org = engine.createOrganization({
      name: "UNAGENCY Demo",
      ownerEmail: api.seed.email,
      ownerDisplayName: "Platform Admin",
      organizationId: api.seed.organizationId,
      ownerUserId: api.seed.userId,
    });
    if (org.ok) {
      const ws = engine.createWorkspace(api.seed.organizationId, "Default");
      seed = {
        organizationId: api.seed.organizationId,
        workspaceId: ws.ok ? ws.value.workspaceId : api.seed.workspaceId,
        userId: api.seed.userId,
        email: api.seed.email,
        password: "admin",
      };
    }
  }

  return { engine, api, seed };
}
