/**
 * M9.5F opt-in LIVE video smokes — NEVER run by default.
 * Requires credential + RUN_LIVE_<VENDOR>_VIDEO_SMOKE=true + LIVE durable async media.
 *
 * LIVE PROVIDER CERTIFICATION: NOT RUN unless explicitly opted in.
 */

import {
  RUNWAY_VIDEO_SPEC,
  LUMA_VIDEO_SPEC,
  MINIMAX_VIDEO_SPEC,
  PIXVERSE_VIDEO_SPEC,
  KLING_VIDEO_SPEC,
  GOOGLE_VEO_VIDEO_SPEC,
  type VerifiedVideoProviderSpec,
} from "../../../../../src/platform/intelligence/providers/video/configs/verified-video-provider-specs";
import { resolveVideoApiKey } from "../../../../../src/platform/production/execution/video-provider-env";

const VERIFIED_SMOKE_SPECS: readonly VerifiedVideoProviderSpec[] = [
  RUNWAY_VIDEO_SPEC,
  KLING_VIDEO_SPEC,
  LUMA_VIDEO_SPEC,
  MINIMAX_VIDEO_SPEC,
  PIXVERSE_VIDEO_SPEC,
  GOOGLE_VEO_VIDEO_SPEC,
];

function smokeEnabled(spec: VerifiedVideoProviderSpec): boolean {
  if (!spec.vendorApiVerified) return false;
  if (process.env[spec.liveSmokeEnvVar]?.trim() !== "true") return false;
  if (spec.secretEnvVar) {
    return Boolean(
      process.env[spec.accessKeyEnvVar ?? spec.credentialEnvVar]?.trim() &&
        process.env[spec.secretEnvVar]?.trim()
    );
  }
  return Boolean(resolveVideoApiKey(process.env, spec.credentialEnvVar));
}

describe("M9.5F live video smoke gate (offline default)", () => {
  it("does not enable live smokes without explicit flags", () => {
    for (const spec of VERIFIED_SMOKE_SPECS) {
      const flag = process.env[spec.liveSmokeEnvVar];
      if (flag !== "true") {
        expect(smokeEnabled(spec)).toBe(false);
      }
    }
  });
});

for (const spec of VERIFIED_SMOKE_SPECS) {
  const enabled = smokeEnabled(spec);
  (enabled ? describe : describe.skip)(
    `M9.5F LIVE ${spec.displayName} video smoke (opt-in)`,
    () => {
      it("submits cheapest verified generation through Enterprise API", async () => {
        process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED = "true";
        process.env.ENTERPRISE_API_EXECUTION_MODE = "live";
        process.env[spec.enableEnvVar] = "true";

        const { createEnterpriseApiPlatform } = await import(
          "../../../../../src/platform/api/factories/create-enterprise-api-platform"
        );
        const platform = createEnterpriseApiPlatform({
          executionMode: "live",
          seedDemoTenant: true,
        });
        const orgId = platform.seed!.organizationId;
        const created = await platform.executions.create(
          {
            prompt: "short product clip, no logos",
            organizationId: orgId,
            capabilityId: "video.generate",
            providerId: spec.canonicalProviderId,
            modelId: `${spec.vendor}/${spec.inventoryModelId}`,
            metadata: {
              duration: 5,
              aspectRatio: "16:9",
            },
          },
          {
            principalId: platform.seed!.userId,
            kind: "user",
            userId: platform.seed!.userId,
            organizationId: orgId,
            roles: ["owner"],
            workspaceId: platform.seed!.workspaceId,
          }
        );
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        let terminalStatus = created.value.status;
        for (let i = 0; i < 120; i += 1) {
          const got = await platform.executions.get(created.value.executionId, {
            organizationId: orgId,
          });
          if (!got.ok) break;
          terminalStatus = got.value.status;
          if (
            terminalStatus === "succeeded" ||
            terminalStatus === "failed" ||
            terminalStatus === "cancelled"
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        expect(terminalStatus).toBe("succeeded");
        if (platform.asyncReconciler) await platform.asyncReconciler.shutdown();
      }, 300_000);
    }
  );
}
