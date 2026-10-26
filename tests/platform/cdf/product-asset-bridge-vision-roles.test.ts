/**
 * Attached images get their role from what they show: a logo among product
 * photos is the logo, the photos are the product — whatever the brief says.
 */

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const remembered: Array<[string, string]> = [];

jest.mock("../../../src/services/product-asset-service", () => ({
  productAssetService: {
    resolveProviderInputAsset: jest.fn(
      async (input: { assetId: string; organizationId: string }) => ({
        // Distinct bytes per asset so references are not de-duplicated.
        url: `data:image/png;base64,${TINY_PNG}${input.assetId}`,
        mimeType: "image/png",
        organizationId: input.organizationId,
        assetId: input.assetId,
        ...(input.assetId === "cached_logo" ? { attachmentRole: "logo" } : {}),
      }),
    ),
    rememberAttachmentRole: jest.fn(async (assetId: string, role: string) => {
      remembered.push([assetId, role]);
    }),
  },
}));

const classify = jest.fn();
jest.mock("../../../src/services/attachment-role-classifier", () => ({
  classifyAttachmentRoles: (...args: unknown[]) => classify(...args),
}));

import { attachProductAssetsToExecutionMetadata } from "../../../src/services/product-asset-input-bridge";
const { parseAttachmentRoles } = jest.requireActual(
  "../../../src/services/attachment-role-classifier",
) as typeof import("../../../src/services/attachment-role-classifier");

function rolesById(meta: Record<string, unknown>): Record<string, unknown> {
  const assets = meta.assets as Array<Record<string, unknown>>;
  return Object.fromEntries(assets.map((a) => [a.assetId, a.semanticReferenceRole]));
}

describe("product-asset-input-bridge — vision attachment roles", () => {
  beforeEach(() => {
    classify.mockReset();
    remembered.length = 0;
  });

  it("finds the unlabelled logo among product photos", async () => {
    classify.mockResolvedValue(
      new Map([
        ["ring_1", "product"],
        ["anyka_logo", "logo"],
        ["ring_2", "product"],
      ]),
    );
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      brief: "Luxury product shots for our new ring collection",
      metadata: { assetIds: ["ring_1", "anyka_logo", "ring_2"] },
    });
    expect(rolesById(meta)).toEqual({
      ring_1: "product_reference",
      anyka_logo: "identity_mark",
      ring_2: "product_reference",
    });
    expect(classify).toHaveBeenCalledWith(
      expect.objectContaining({ brief: "Luxury product shots for our new ring collection" }),
    );
    await new Promise((r) => setImmediate(r));
    expect(remembered).toEqual(
      expect.arrayContaining([["anyka_logo", "logo"], ["ring_1", "product"]]),
    );
  });

  it("uses a cached verdict without asking again", async () => {
    classify.mockResolvedValue(new Map([["photo", "product"]]));
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["cached_logo", "photo"] },
    });
    expect(rolesById(meta)).toEqual({
      cached_logo: "identity_mark",
      photo: "product_reference",
    });
    const asked = classify.mock.calls[0]?.[0] as { attachments: { assetId: string }[] };
    expect(asked.attachments.map((a) => a.assetId)).toEqual(["photo"]);
  });

  it("falls back to product when the vision check has no answer", async () => {
    classify.mockResolvedValue(new Map());
    const meta = await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["unknown"] },
    });
    expect(rolesById(meta)).toEqual({ unknown: "product_reference" });
  });

  it("does not re-check the bound logo", async () => {
    classify.mockResolvedValue(new Map());
    await attachProductAssetsToExecutionMetadata({
      userId: "u1",
      organizationId: "org_1",
      metadata: { assetIds: ["bound_logo"], logoAssetId: "bound_logo" },
    });
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("parseAttachmentRoles", () => {
  it("reads roles by position and ignores junk", () => {
    expect(
      parseAttachmentRoles(
        '```json\n{"images":[{"index":2,"role":"logo"},{"index":1,"role":"product"},{"index":9,"role":"logo"},{"index":3,"role":"banana"}]}\n```',
        3,
      ),
    ).toEqual(["product", "logo", undefined]);
    expect(parseAttachmentRoles("not json", 2)).toBeNull();
  });
});
