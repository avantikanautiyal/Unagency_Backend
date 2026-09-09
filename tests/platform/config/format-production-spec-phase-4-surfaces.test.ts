/**
 * Phase 4 — Spec surfaces: Admin QC + FE pixel register stay in sync with catalog.
 */

import {
  UNIVERSAL_QC_CHECKLIST_LABELS,
  resolveQcChecklistItems,
  resolveQcChecklistLabels,
} from "../../../src/platform/config/format-production-spec/qc-checklist";
import {
  buildFormatSpecSurfacesSnapshot,
  buildServiceQcLabelCatalog,
  listSpecPixelMasters,
} from "../../../src/platform/config/format-production-spec/format-spec-surfaces";
import { listFormatToRuleIdEntries } from "../../../src/platform/config/format-production-spec/resolve-production-rule";
import { ExportDeliveryAdapter } from "../../../src/platform/os/delivery/adapters/export-delivery-adapter";

describe("format-production-spec phase 4 surfaces", () => {
  it("lists Spec pixel masters for every mapped C29 format with px canvas", () => {
    const pixels = listSpecPixelMasters();
    expect(pixels.length).toBeGreaterThanOrEqual(50);
    const feed = pixels.find((p) => p.formatId === "feed-post");
    expect(feed).toMatchObject({ width: 1080, height: 1080, platform: "instagram" });
    const reels = pixels.find((p) => p.formatId === "reels");
    expect(reels).toMatchObject({ width: 1080, height: 1920 });
  });

  it("builds QC catalog for all 15 Hygiene Reference services", () => {
    const catalog = buildServiceQcLabelCatalog();
    const services = catalog.map((c) => c.service).sort();
    expect(services).toEqual(
      [
        "ads",
        "branding",
        "email",
        "event",
        "illustration",
        "merchandise",
        "packaging",
        "photography",
        "pos",
        "presentations",
        "print",
        "social",
        "strategy",
        "video",
        "website",
      ].sort(),
    );
    for (const entry of catalog) {
      expect(entry.labels.some((l) => l.startsWith("[Gate]"))).toBe(true);
    }
  });

  it("resolveQcChecklistItems includes Gate hygiene lines", () => {
    const items = resolveQcChecklistItems({
      service: "social",
      subtype: "content-design",
    });
    const gates = items.filter((i) => i.label.startsWith("[Gate]"));
    expect(gates.length).toBeGreaterThan(0);
    expect(items.some((i) => i.source === "universal")).toBe(true);
  });

  it("snapshot universal QC matches UNIVERSAL_QC_CHECKLIST_LABELS", () => {
    const snap = buildFormatSpecSurfacesSnapshot();
    expect([...snap.universalQc]).toEqual([...UNIVERSAL_QC_CHECKLIST_LABELS]);
    expect(snap.pixels.length).toBe(listSpecPixelMasters().length);
    expect(listFormatToRuleIdEntries().length).toBeGreaterThan(snap.pixels.length);
  });

  it("social resolved labels include Gate prefix from Spec", () => {
    const labels = resolveQcChecklistLabels({
      service: "social",
      subtype: "content-design",
    });
    expect(labels.some((l) => l.includes("placement"))).toBe(true);
    expect(labels.some((l) => l.startsWith("[Gate]"))).toBe(true);
  });

  it("export adapter embeds suggestedFilename in externalReference", async () => {
    const adapter = new ExportDeliveryAdapter();
    const result = await adapter.deliver({
      organizationId: "org1",
      artifactId: "art1",
      artifactVersion: 2,
      checksum: "abc",
      idempotencyKey: "idem-phase4-fn",
      suggestedFilename: "Brand_IG_Feed_1080x1080_v1.png",
    });
    expect(result.ok).toBe(true);
    expect(result.externalReference).toContain(
      encodeURIComponent("Brand_IG_Feed_1080x1080_v1.png"),
    );
  });
});
