/**
 * Context testing helpers.
 */

export function sampleContextBuildRequest(
  overrides?: Partial<{
    capabilityId: string;
    organizationId: string;
    workspaceId: string;
    userId: string;
    language: string;
    locale: string;
  }>
) {
  return {
    capabilityId: overrides?.capabilityId ?? "echo",
    organizationId: overrides?.organizationId ?? "org_1",
    workspaceId: overrides?.workspaceId ?? "ws_1",
    userId: overrides?.userId ?? "user_1",
    capabilityVersion: "1.0.0",
    language: overrides?.language ?? "EN",
    locale: overrides?.locale ?? "en_us",
    timeZone: "UTC",
    priority: "normal" as const,
    correlationId: "corr_1",
    inputHints: { message: "Hello" },
    attributes: {
      organizationName: "Unagency",
      brandId: "brand_1",
      brandVoice: "professional",
      assetIds: ["asset_1"],
      roles: ["member"],
      permissions: ["intelligence.invoke"],
    },
  };
}
