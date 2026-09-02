import { ValidationError } from "../../../src/platform/core/errors";
import { resolveProviderInputImageUrl } from "../../../src/platform/providers/common/resolve-provider-input-image-url";

describe("resolveProviderInputImageUrl", () => {
  it("falls back to data URL when blob signing fails", async () => {
    const blobAccess = {
      createProviderInputSignedUrl: jest.fn().mockResolvedValue({
        ok: false,
        error: new ValidationError(
          "Blob not found or access denied — cross-tenant storage reference rejected"
        ),
      }),
    };

    const result = await resolveProviderInputImageUrl({
      asset: {
        storageRef: "tenant/org/assets/asset/logo.png",
        url: "data:image/png;base64,abc",
        organizationId: "org",
      },
      organizationId: "org",
      blobAccess: blobAccess as never,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("data:image/png;base64,abc");
    }
  });

  it("prefers signed URL when blob access succeeds", async () => {
    const blobAccess = {
      createProviderInputSignedUrl: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          signedUrl: "https://signed.example/logo.png",
          storageKey: "tenant/org/assets/asset/logo.png",
          organizationId: "org",
          expiresInSeconds: 300,
        },
      }),
    };

    const result = await resolveProviderInputImageUrl({
      asset: {
        storageRef: "tenant/org/assets/asset/logo.png",
        url: "data:image/png;base64,abc",
        organizationId: "org",
      },
      organizationId: "org",
      blobAccess: blobAccess as never,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("https://signed.example/logo.png");
    }
  });
});
