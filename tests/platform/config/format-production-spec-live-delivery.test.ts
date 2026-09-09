/**
 * Live delivery wiring — production gate from metadata + Spec filename convention.
 */

import {
  buildProductionExportFilename,
  buildProductionGateFromExecutionContext,
  evaluateProductionReleaseGate,
  sizeTokenFromCanvas,
} from "../../../src/platform/config/format-production-spec";
import { maybeAutoDeliverOnSuccess } from "../../../src/platform/api/services/auto-delivery-on-success";
import type { OsDeliveryService } from "../../../src/platform/os/delivery/engine/delivery-service";
import { DeliveryAuthorizationService } from "../../../src/platform/os/delivery/authorization/delivery-authorization";
import type { IArtifactVersionStore } from "../../../src/platform/os/delivery/artifact/artifact-version-store";

describe("buildProductionGateFromExecutionContext", () => {
  it("returns undefined without Spec-relevant context", () => {
    expect(buildProductionGateFromExecutionContext({})).toBeUndefined();
    expect(buildProductionGateFromExecutionContext(undefined)).toBeUndefined();
  });

  it("builds gate input from platform + format metadata", () => {
    const gate = buildProductionGateFromExecutionContext({
      service: "social",
      platform: "facebook",
      format: "page-cover-video",
      generatedWidth: 1280,
      generatedHeight: 720,
    });
    expect(gate).toEqual(
      expect.objectContaining({
        service: "social",
        platform: "facebook",
        formatId: "page-cover-video",
        generatedWidth: 1280,
        generatedHeight: 720,
      }),
    );
    expect(evaluateProductionReleaseGate(gate!).allowed).toBe(false);
  });

  it("honors productionConfirmedOverride from metadata", () => {
    const gate = buildProductionGateFromExecutionContext({
      platform: "facebook",
      format: "page-cover-video",
      productionConfirmedOverride: true,
    });
    expect(gate?.confirmedOverride).toBe(true);
    expect(evaluateProductionReleaseGate(gate!).allowed).toBe(true);
  });

  it("lets overrides win over metadata", () => {
    const gate = buildProductionGateFromExecutionContext(
      {
        platform: "instagram",
        format: "reels",
        generatedWidth: 1080,
        generatedHeight: 1920,
      },
      { generatedWidth: 1024, generatedHeight: 1792 },
    );
    expect(gate?.generatedWidth).toBe(1024);
    expect(gate?.generatedHeight).toBe(1792);
  });
});

describe("production export filename", () => {
  it("follows Spec convention", () => {
    const name = buildProductionExportFilename({
      service: "social",
      placement: "feed.portrait",
      size: sizeTokenFromCanvas(1080, 1350),
      language: "EN",
      variant: "A",
      version: 1,
      date: "2026-09-07T12:00:00.000Z",
      extension: "png",
    });
    expect(name).toBe(
      "UNAGENCY_social_feed_portrait_1080x1350_EN_A_v01_20260907.png",
    );
  });
});

describe("maybeAutoDeliverOnSuccess + production gate", () => {
  function mockDeliveryService(opts: {
    authorizeAuthorized: boolean;
    authorizeReason?: string;
  }): OsDeliveryService {
    const authorize = jest.fn(async (input: { productionGate?: unknown }) => ({
      authorized: opts.authorizeAuthorized,
      reason: opts.authorizeReason ?? (opts.authorizeAuthorized ? "ok" : "blocked"),
      artifactId: "art1",
      artifactVersion: 1,
    }));
    const createDelivery = jest.fn(async (input: {
      productionGate?: unknown;
      suggestedFilename?: string;
    }) => ({
      deliveryId: "deliv_1",
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export" as const,
      status: "SUCCEEDED" as const,
      timestamp: "2026-09-07T00:00:00.000Z",
      idempotencyKey: "idem",
      suggestedFilename: input.suggestedFilename,
    }));
    return {
      authorize,
      createDelivery,
    } as unknown as OsDeliveryService;
  }

  it("passes productionGate and blocks when authorize denies Hold placement", async () => {
    const deliveryService = mockDeliveryService({
      authorizeAuthorized: false,
      authorizeReason: "PRODUCTION_RELEASE_HOLD: facebook.page-cover-video is H",
    });

    const result = await maybeAutoDeliverOnSuccess({
      deliveryService,
      organizationId: "org1",
      executionId: "exec1",
      artifactRefs: [
        {
          artifactId: "art1",
          kind: "media",
          label: "primary",
          mimeType: "image/png",
        },
      ],
      nowIso: () => "2026-09-07T00:00:00.000Z",
      createId: (p) => `${p}_1`,
      metadata: {
        platform: "facebook",
        format: "page-cover-video",
        service: "social",
      },
    });

    expect(result.deliveryId).toBeUndefined();
    expect(result.error).toMatch(/PRODUCTION_RELEASE_HOLD|blocked/i);
    expect(deliveryService.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        productionGate: expect.objectContaining({
          platform: "facebook",
          formatId: "page-cover-video",
        }),
      }),
    );
    expect(deliveryService.createDelivery).not.toHaveBeenCalled();
  });

  it("passes suggestedFilename on successful auto-delivery", async () => {
    const deliveryService = mockDeliveryService({ authorizeAuthorized: true });

    const result = await maybeAutoDeliverOnSuccess({
      deliveryService,
      organizationId: "org1",
      executionId: "exec1",
      artifactRefs: [
        {
          artifactId: "art1",
          kind: "media",
          label: "primary",
          mimeType: "image/png",
        },
      ],
      nowIso: () => "2026-09-07T00:00:00.000Z",
      createId: (p) => `${p}_1`,
      metadata: {
        platform: "instagram",
        format: "reels",
        service: "social",
        generatedWidth: 1080,
        generatedHeight: 1920,
      },
    });

    expect(result.deliveryId).toBe("deliv_1");
    expect(deliveryService.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        productionGate: expect.objectContaining({
          platform: "instagram",
          formatId: "reels",
        }),
        suggestedFilename: expect.stringMatching(
          /^UNAGENCY_social_.*_1080x1920_EN_A_v01_20260907\.png$/,
        ),
      }),
    );
  });
});

describe("delivery authorization with gate from context", () => {
  function mockStore(): IArtifactVersionStore {
    return {
      implementationStatus: "implemented",
      async putVersion() {
        return undefined as never;
      },
      async getVersion() {
        return {
          artifactId: "art1",
          version: 1,
          organizationId: "org1",
          executionId: "exec1",
          approvalState: "APPROVED",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never;
      },
      async listVersions() {
        return [];
      },
      async getLatestManifest() {
        return undefined;
      },
      async putManifest() {
        return undefined as never;
      },
    };
  }

  it("denies authorize when gate built from Hold metadata", async () => {
    const authz = new DeliveryAuthorizationService(mockStore());
    const gate = buildProductionGateFromExecutionContext({
      platform: "facebook",
      format: "page-cover-video",
    });
    const result = await authz.authorizeAsync({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 1,
      executionId: "exec1",
      destination: "export",
      productionGate: gate,
    });
    expect(result.authorized).toBe(false);
    expect(result.reason).toMatch(/PRODUCTION_RELEASE_HOLD|H/i);
  });
});
