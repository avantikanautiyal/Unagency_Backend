/**
 * Mocked fanout → composition → acceptance integration (no live providers).
 */

import {
  resolveSharedCompositionAuthority,
  runIndependentFanoutCompositionGroup,
} from "../../../../src/platform/cdf/deterministic-composition";
import {
  buildInstagramFeedPostCertFixture,
  CERT_PRIMARY_MESSAGE,
  buildFixtureVisualPlate,
} from "../../../../src/platform/certification/fixtures/social-media-instagram-feed-post";
import { createHash } from "crypto";
import { PNG } from "pngjs";

function tintVisual(seed: number): Buffer {
  const base = PNG.sync.read(buildFixtureVisualPlate());
  for (let i = 0; i < base.data.length; i += 4) {
    base.data[i] = Math.min(255, (base.data[i]! + seed * 40) % 256);
    base.data[i + 1] = Math.min(255, (base.data[i + 1]! + seed * 20) % 256);
  }
  return PNG.sync.write(base);
}

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("Mocked three-leaf fanout composition integration", () => {
  it("one selected route → three independent composed AVAILABLE leaves", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const authority = resolveSharedCompositionAuthority({
      contract: fixture.compositionInput.contract,
      canvas: fixture.canvas,
      primaryMessage: fixture.primaryMessage,
      brandMark: fixture.compositionInput.brandMark!,
      brandContext: fixture.compositionInput.brandContext,
      selectedRoute: {
        artifactId: "cdfart_routes_shared",
        artifactVersion: 1,
        artifactKey: "social-media.routes",
      },
      provenance: { fixtureId: fixture.fixtureId },
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;

    const visualA = tintVisual(1);
    const visualB = tintVisual(2);
    const visualC = tintVisual(3);
    expect(sha(visualA)).not.toBe(sha(visualB));
    expect(sha(visualB)).not.toBe(sha(visualC));

    const group = runIndependentFanoutCompositionGroup({
      fanoutGroupId: "fanout_group_cert_mock_1",
      authority: authority.authority,
      leaves: [
        {
          identity: {
            executionId: "exec_a",
            fanoutGroupId: "fanout_group_cert_mock_1",
            fanoutTargetId: "fanout_0_openai",
            providerId: "provider.openai",
            modelId: "gpt-image-2",
          },
          visualBytes: visualA,
          mimeType: "image/png",
        },
        {
          identity: {
            executionId: "exec_b",
            fanoutGroupId: "fanout_group_cert_mock_1",
            fanoutTargetId: "fanout_1_google",
            providerId: "provider.google",
            modelId: "gemini-3.1-flash-image",
          },
          visualBytes: visualB,
          mimeType: "image/png",
        },
        {
          identity: {
            executionId: "exec_c",
            fanoutGroupId: "fanout_group_cert_mock_1",
            fanoutTargetId: "fanout_2_ideogram",
            providerId: "provider.ideogram",
            modelId: "ideogram-3",
          },
          visualBytes: visualC,
          mimeType: "image/png",
        },
      ],
    });

    expect(group.leafCount).toBe(3);
    expect(group.availableCount).toBe(3);
    expect(group.rejectedCount).toBe(0);
    expect(group.failedCount).toBe(0);
    expect(group.providerFailureCount).toBe(0);
    expect(group.crossLeafFallbackOccurred).toBe(false);
    expect(group.selectedRoute?.artifactId).toBe("cdfart_routes_shared");
    expect(group.selectedRoute?.artifactVersion).toBe(1);
    expect(group.sharedPrimaryMessage).toBe(CERT_PRIMARY_MESSAGE);

    const hashes = new Set<string>();
    for (const leaf of group.leaves) {
      expect(leaf.leafStatus).toBe("AVAILABLE");
      if (leaf.leafStatus !== "AVAILABLE") continue;
      expect(leaf.acceptance.composed.widthPx).toBe(1080);
      expect(leaf.acceptance.composed.heightPx).toBe(1080);
      expect(leaf.acceptance.structural.status).toBe("COMPLIANT");
      expect(
        leaf.acceptance.composed.layers.some(
          (l) =>
            l.element === "primary_message_surface" &&
            l.text === CERT_PRIMARY_MESSAGE,
        ),
      ).toBe(true);
      expect(
        leaf.acceptance.composed.layers.some(
          (l) =>
            l.element === "brand_signature" && l.source === "brand_asset",
        ),
      ).toBe(true);
      expect(leaf.acceptance.composed.contentHash).not.toBe(
        leaf.acceptance.composed.sourceVisualHash,
      );
      hashes.add(leaf.acceptance.composed.contentHash);
      expect(leaf.acceptance.identity.providerId).toBeTruthy();
      expect(leaf.acceptance.identity.modelId).toBeTruthy();
      expect(leaf.acceptance.identity.executionId).toBeTruthy();
    }
    // Distinct visual plates → distinct composed outputs
    expect(hashes.size).toBe(3);
  });
});

describe("Mixed fanout outcomes (no cross-leaf fallback)", () => {
  it("provider fail + AVAILABLE + REJECTED isolates leaves", () => {
    const fixture = buildInstagramFeedPostCertFixture();
    const authority = resolveSharedCompositionAuthority({
      contract: fixture.compositionInput.contract,
      canvas: fixture.canvas,
      primaryMessage: fixture.primaryMessage,
      brandMark: fixture.compositionInput.brandMark!,
      selectedRoute: {
        artifactId: "cdfart_routes_shared",
        artifactVersion: 1,
        artifactKey: "social-media.routes",
      },
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;

    const group = runIndependentFanoutCompositionGroup({
      fanoutGroupId: "fanout_group_mixed_1",
      authority: authority.authority,
      leaves: [
        {
          identity: {
            executionId: "exec_fail",
            fanoutGroupId: "fanout_group_mixed_1",
            fanoutTargetId: "fanout_0_openai",
            providerId: "provider.openai",
            modelId: "gpt-image-2",
          },
          providerFailed: true,
          providerFailureReason: "quota_exceeded",
        },
        {
          identity: {
            executionId: "exec_ok",
            fanoutGroupId: "fanout_group_mixed_1",
            fanoutTargetId: "fanout_1_google",
            providerId: "provider.google",
            modelId: "gemini-3.1-flash-image",
          },
          visualBytes: tintVisual(5),
          mimeType: "image/png",
        },
        {
          identity: {
            executionId: "exec_reject",
            fanoutGroupId: "fanout_group_mixed_1",
            fanoutTargetId: "fanout_2_ideogram",
            providerId: "provider.ideogram",
            modelId: "ideogram-3",
          },
          visualBytes: tintVisual(6),
          mimeType: "image/png",
          forcedRenderedTextProof: {
            extractedText: "WRONG MESSAGE ON PIXELS",
            source: "ocr",
            outcome: "ok",
          },
        },
      ],
    });

    expect(group.availableCount).toBe(1);
    expect(group.rejectedCount).toBe(1);
    expect(group.providerFailureCount).toBe(1);
    expect(group.crossLeafFallbackOccurred).toBe(false);

    const available = group.leaves.find((l) => l.leafStatus === "AVAILABLE");
    expect(available?.leafStatus).toBe("AVAILABLE");
    if (available?.leafStatus === "AVAILABLE") {
      expect(available.acceptance.identity.providerId).toBe("provider.google");
      expect(available.acceptance.structural.status).toBe("COMPLIANT");
    }

    const rejected = group.leaves.find((l) => l.leafStatus === "REJECTED");
    expect(rejected?.leafStatus).toBe("REJECTED");

    const failed = group.leaves.find(
      (l) => l.leafStatus === "PROVIDER_OPERATIONAL_FAILURE",
    );
    expect(failed?.leafStatus).toBe("PROVIDER_OPERATIONAL_FAILURE");
  });
});
