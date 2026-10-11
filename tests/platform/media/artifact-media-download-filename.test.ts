import { BlobAccessService } from "../../../src/platform/media/blob/blob-access-service";
import { BlobOwnershipRegistry } from "../../../src/platform/media/blob/blob-ownership-registry";
import { MediaDeliveryService } from "../../../src/platform/media/delivery/media-delivery-service";
import { RecordingS3BlobStorage } from "../../../src/platform/persistence/storage/s3-blob-storage";
import type { IArtifactRepository } from "../../../src/platform/infrastructure/durability/interfaces/execution-store-ports";

const ORG = "org_1";

async function setup(artifactId: string, key: string, mimeType: string) {
  const storage = new RecordingS3BlobStorage();
  await storage.put(key, "bytes", mimeType);
  const registry = new BlobOwnershipRegistry();
  registry.register({
    storageKey: key,
    organizationId: ORG,
    mimeType,
    createdAt: new Date().toISOString(),
  });
  const artifacts = {
    get: async (id: string) =>
      id === artifactId
        ? { organizationId: ORG, artifact: { label: `blob:${key}` } }
        : undefined,
  } as unknown as IArtifactRepository;
  const spy = jest.spyOn(storage, "createSignedGetUrl");
  const service = new MediaDeliveryService(
    artifacts,
    new BlobAccessService(registry, storage),
    storage
  );
  return { service, spy };
}

describe("artifact media download filename", () => {
  it("serves website codebase ZIPs as an attachment with a .zip filename", async () => {
    const { service, spy } = await setup("art_zip", "tenant/org_1/a/0", "application/zip");
    const res = await service.resolveArtifactMediaUrl("art_zip", ORG);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith("tenant/org_1/a/0", expect.any(Number), {
      disposition: "attachment",
      filename: "art_zip.zip",
    });
  });

  it("keeps HTML previews inline but with a .html filename", async () => {
    const { service, spy } = await setup("art_html", "tenant/org_1/b/0", "text/html");
    const res = await service.resolveArtifactMediaUrl("art_html", ORG);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith("tenant/org_1/b/0", expect.any(Number), {
      filename: "art_html.html",
    });
  });
});
