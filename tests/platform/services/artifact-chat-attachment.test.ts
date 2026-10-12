/**
 * Shared artifacts are copied into normal chat attachments — only for the
 * sender's own organization.
 */

const send = jest.fn(async () => ({}));
jest.mock("../../../src/config/aws.config", () => ({
  __esModule: true,
  default: { send: (...args: unknown[]) => send(...(args as [])) },
}));

const resolveArtifactBinaryForTenant = jest.fn();
jest.mock("../../../src/platform/api/runtime/bootstrap-enterprise-api", () => ({
  getEnterpriseApiRuntime: () => ({
    platform: {
      durableStores: {
        asyncMedia: { mediaDelivery: { resolveArtifactBinaryForTenant } },
      },
    },
  }),
}));

import { copyArtifactToChatAttachment } from "../../../src/services/collaboration/artifact-chat-attachment";

describe("copyArtifactToChatAttachment", () => {
  beforeEach(() => {
    send.mockClear();
    resolveArtifactBinaryForTenant.mockReset();
  });

  it("stores the file like a chat upload and returns its attachment details", async () => {
    resolveArtifactBinaryForTenant.mockResolvedValue({
      ok: true,
      value: { bytes: Buffer.from("png-bytes"), contentType: "image/png" },
    });
    const out = await copyArtifactToChatAttachment({
      artifactId: "art_1",
      organizationId: "org_1",
      label: "Approved creative — Route 2",
    });
    expect(resolveArtifactBinaryForTenant).toHaveBeenCalledWith("art_1", "org_1");
    expect(out).toMatchObject({ mimeType: "image/png", size: 9 });
    expect(out?.fileName).toBe("Approved-creative-Route-2.png");
    expect(out?.url).toMatch(/^https:\/\/prakriadirect\.s3\.ap-south-1\.amazonaws\.com\/mixed\//);
    const command = (send.mock.calls[0] as unknown as [{ input: Record<string, unknown> }])[0];
    expect(command.input).toMatchObject({
      Bucket: "prakriadirect",
      ContentType: "image/png",
      ACL: "public-read",
    });
  });

  it("names website code packages as .zip", async () => {
    resolveArtifactBinaryForTenant.mockResolvedValue({
      ok: true,
      value: { bytes: Buffer.from("zip"), contentType: "application/zip" },
    });
    const out = await copyArtifactToChatAttachment({
      artifactId: "art_webexport0_1",
      organizationId: "org_1",
      label: "Website code (ZIP) — Street Luxe",
    });
    expect(out?.fileName.endsWith(".zip")).toBe(true);
  });

  it("copies nothing when the artifact is not the sender's", async () => {
    resolveArtifactBinaryForTenant.mockResolvedValue({
      ok: false,
      error: new Error("Artifact not found"),
    });
    const out = await copyArtifactToChatAttachment({
      artifactId: "art_other_tenant",
      organizationId: "org_1",
    });
    expect(out).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
