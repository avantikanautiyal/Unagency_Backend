/**
 * Immutable Social Media → Instagram → Feed Post certification fixture.
 * Deterministic local inputs only — no live providers.
 */

import { createHash } from "crypto";
import { PNG } from "pngjs";
import {
  resolveDeliverableCompositionContract,
} from "../../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type {
  CommunicationCompositionInput,
  CompositionCanvasSpec,
  VisualGenerationResult,
} from "../../../cdf/deterministic-composition";

export const CERT_FIXTURE_ID =
  "unagency.certification.fixture.social_media.instagram.feed_post.v1" as const;

export const CERT_PRIMARY_MESSAGE =
  "Sunflower is your trusted education partner, helping students from Classes 1-12 grow, learn, and shine with confidence";

export const CERT_CANVAS: CompositionCanvasSpec = Object.freeze({
  widthPx: 1080,
  heightPx: 1080,
  aspectRatio: "1:1",
  colourSpace: "sRGB",
  preferredMimeType: "image/png",
  safeArea: Object.freeze({
    top: 72,
    right: 72,
    bottom: 72,
    left: 72,
  }),
});

/** Fixed visual plate: warm gradient with a solid subject block (not text). */
export function buildFixtureVisualPlate(): Buffer {
  const w = 1024;
  const h = 1024;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (w * y + x) << 2;
      png.data[idx] = Math.floor(180 + (x / w) * 40);
      png.data[idx + 1] = Math.floor(140 + (y / h) * 50);
      png.data[idx + 2] = 60;
      png.data[idx + 3] = 255;
    }
  }
  // Subject block (visual interest, not communication).
  for (let y = 280; y < 720; y++) {
    for (let x = 300; x < 720; x++) {
      const idx = (w * y + x) << 2;
      png.data[idx] = 90;
      png.data[idx + 1] = 140;
      png.data[idx + 2] = 200;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Fixed brand mark: simple sunflower-like mark (circle + petals), not wordmark-as-message. */
export function buildFixtureBrandLogo(): Buffer {
  const w = 256;
  const h = 256;
  const png = new PNG({ width: w, height: h });
  // Transparent background
  for (let i = 0; i < w * h * 4; i++) png.data[i] = 0;

  const cx = 128;
  const cy = 128;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (w * y + x) << 2;
      if (dist < 36) {
        png.data[idx] = 180;
        png.data[idx + 1] = 90;
        png.data[idx + 2] = 20;
        png.data[idx + 3] = 255;
      } else if (dist < 78) {
        const angle = Math.atan2(dy, dx);
        const petal = Math.abs(Math.sin(angle * 4)) > 0.35;
        if (petal) {
          png.data[idx] = 240;
          png.data[idx + 1] = 190;
          png.data[idx + 2] = 40;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
  return PNG.sync.write(png);
}

export type InstagramFeedPostCertFixture = {
  readonly fixtureId: typeof CERT_FIXTURE_ID;
  readonly version: "1.0.0";
  readonly service: "social-media";
  readonly platform: "instagram";
  readonly deliverable: "feed-post";
  readonly brand: {
    readonly brandId: string;
    readonly brandName: string;
  };
  readonly activeBrief: {
    readonly instruction: string;
  };
  readonly selectedCreativeDirection: {
    readonly primaryMessage: string;
    readonly visualConcept: string;
    readonly routeArtifactKey: string;
    readonly routeVersion: number;
  };
  readonly primaryMessage: string;
  readonly canvas: CompositionCanvasSpec;
  readonly visualBytes: Buffer;
  readonly visualHash: string;
  readonly logoBytes: Buffer;
  readonly logoHash: string;
  readonly compositionInput: CommunicationCompositionInput;
};

function hashBuf(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

export function buildInstagramFeedPostCertFixture(): InstagramFeedPostCertFixture {
  const contract = resolveDeliverableCompositionContract("social_creative");
  if (!contract) {
    throw new Error("social_creative composition contract missing");
  }

  const visualBytes = buildFixtureVisualPlate();
  const logoBytes = buildFixtureBrandLogo();
  const visual: VisualGenerationResult = {
    bytes: visualBytes,
    mimeType: "image/png",
    widthPx: 1024,
    heightPx: 1024,
    provenance: "fixture",
    generationMeta: {
      note: "local deterministic fixture — not a live provider result",
    },
  };

  const compositionInput: CommunicationCompositionInput = {
    contract,
    visual,
    canvas: CERT_CANVAS,
    primaryMessage: CERT_PRIMARY_MESSAGE,
    brandMark: {
      bytes: logoBytes,
      mimeType: "image/png",
      assetId: "fixture_brand_logo_v1",
      provenance: "fixture_brand_asset",
    },
    brandContext: {
      brandId: "brand_sunflower_cert_v1",
      brandName: "Sunflower",
    },
    provenance: {
      fixtureId: CERT_FIXTURE_ID,
    },
  };

  return {
    fixtureId: CERT_FIXTURE_ID,
    version: "1.0.0",
    service: "social-media",
    platform: "instagram",
    deliverable: "feed-post",
    brand: {
      brandId: "brand_sunflower_cert_v1",
      brandName: "Sunflower",
    },
    activeBrief: {
      instruction:
        "Create an Instagram feed post introducing Sunflower as a trusted education partner for Classes 1-12.",
    },
    selectedCreativeDirection: {
      primaryMessage: CERT_PRIMARY_MESSAGE,
      visualConcept:
        "Warm educational atmosphere with a clear human/subject focal point",
      routeArtifactKey: "social-media.routes",
      routeVersion: 1,
    },
    primaryMessage: CERT_PRIMARY_MESSAGE,
    canvas: CERT_CANVAS,
    visualBytes,
    visualHash: hashBuf(visualBytes),
    logoBytes,
    logoHash: hashBuf(logoBytes),
    compositionInput,
  };
}
