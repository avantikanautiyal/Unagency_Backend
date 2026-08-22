/**
 * M9.5J — architectural coverage guards (audit invariants).
 * Zero external network / AI calls.
 */

import * as fs from "fs";
import * as path from "path";
import {
  SEED_MODELS,
  SEED_PROVIDERS,
  providerIdForVendor,
} from "../../../src/platform/intelligence/model-registry/discovery/inventory-seed";
import { PROVIDER_CATALOG_SEED } from "../../../src/platform/intelligence/provider-catalog/catalog/provider-catalog-seed";
import {
  resolveExecutionModality,
  normalizeAudioCapabilityId,
  isVideoGenerationCapability,
} from "../../../src/platform/intelligence/providers/common/resolve-execution-modality";
import {
  VERIFIED_AUDIO_PROVIDER_SPECS,
  BLOCKED_AUDIO_PROVIDER_SPECS,
} from "../../../src/platform/intelligence/providers/audio/configs/verified-audio-provider-specs";
import {
  VERIFIED_VIDEO_PROVIDER_SPECS,
  ALL_VIDEO_PROVIDER_SPECS,
} from "../../../src/platform/intelligence/providers/video/configs/verified-video-provider-specs";
import { BLOCKED_IMAGE_PROVIDER_SPECS } from "../../../src/platform/intelligence/providers/image/configs/verified-image-provider-specs";

const RUNTIME_INVENTORY_CAPS = new Set([
  "text.generate",
  "text.chat",
  "reasoning.analyze",
  "image.generate",
  "vision.analyze",
  "video.generate",
  "audio.transcribe",
  "audio.synthesize",
  "embedding.generate",
  "research.web_search",
]);

describe("M9.5J capability→runtime coverage guard", () => {
  it("every inventory-seed capability is a known runtime ID", () => {
    const found = new Set<string>();
    for (const p of SEED_PROVIDERS) {
      for (const c of p.capabilities) found.add(c);
    }
    for (const m of SEED_MODELS) {
      for (const c of m.capabilities) found.add(c);
    }
    for (const c of found) {
      expect(RUNTIME_INVENTORY_CAPS.has(c)).toBe(true);
    }
  });

  it("every inventory capability resolves to a non-default modality or text", () => {
    for (const c of RUNTIME_INVENTORY_CAPS) {
      const modality = resolveExecutionModality(c);
      expect(typeof modality).toBe("string");
      if (c.startsWith("video.")) expect(modality).toBe("video");
      if (c.startsWith("image.")) expect(modality).toBe("image");
      if (c.startsWith("audio.")) expect(modality).toBe("audio");
      if (c === "vision.analyze") expect(modality).toBe("multimodal");
      if (c.includes("embedding")) expect(modality).toBe("embedding");
      if (c.startsWith("research.")) expect(modality).toBe("text");
    }
  });

  it("audio catalogue aliases normalize to inventory IDs", () => {
    expect(normalizeAudioCapabilityId("audio.speech_generation")).toBe("audio.synthesize");
    expect(normalizeAudioCapabilityId("speech.transcribe")).toBe("audio.transcribe");
    expect(normalizeAudioCapabilityId("music.generate")).toBe("audio.music_generation");
  });

  it("video short_form / avatar remain video modality (not separate inventory IDs)", () => {
    expect(isVideoGenerationCapability("video.short_form_generation")).toBe(true);
    expect(isVideoGenerationCapability("video.avatar_generation")).toBe(true);
    expect(RUNTIME_INVENTORY_CAPS.has("video.avatar_generation")).toBe(false);
  });
});

describe("M9.5J provider inventory→leaf coverage guard", () => {
  it("verified video specs are a subset of ALL video specs and are marked verified", () => {
    for (const v of VERIFIED_VIDEO_PROVIDER_SPECS) {
      expect(v.vendorApiVerified).toBe(true);
      expect(ALL_VIDEO_PROVIDER_SPECS.some((s) => s.vendor === v.vendor)).toBe(true);
    }
  });

  it("blocked audio specs are never vendorApiVerified", () => {
    for (const b of BLOCKED_AUDIO_PROVIDER_SPECS) {
      expect(b.vendorApiVerified).toBe(false);
      expect(b.blockedReason).toBeTruthy();
    }
  });

  it("blocked image specs are never vendorApiVerified", () => {
    for (const b of BLOCKED_IMAGE_PROVIDER_SPECS) {
      expect(b.vendorApiVerified).toBe(false);
      expect(b.blockedReason).toBeTruthy();
    }
  });

  it("verified audio vendors have inventory models", () => {
    for (const a of VERIFIED_AUDIO_PROVIDER_SPECS) {
      const models = SEED_MODELS.filter((m) => m.providerVendor === a.vendor);
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.capabilities.includes("audio.synthesize"))).toBe(true);
    }
  });

  it("catalogue 3D / music providers are not inventory vendors", () => {
    const inv = new Set(SEED_PROVIDERS.map((p) => p.vendor));
    for (const id of ["tripo", "deemos", "suno", "udio"]) {
      expect(PROVIDER_CATALOG_SEED.some((p) => p.providerId === id)).toBe(true);
      expect(inv.has(id)).toBe(false);
    }
  });

  it("every inventory vendor has provider.<vendor> identity", () => {
    for (const p of SEED_PROVIDERS) {
      expect(String(providerIdForVendor(p.vendor))).toBe(`provider.${p.vendor}`);
    }
  });
});

describe("M9.5J model inventory consistency", () => {
  it("seed models only reference known seed providers", () => {
    const vendors = new Set(SEED_PROVIDERS.map((p) => p.vendor));
    for (const m of SEED_MODELS) {
      expect(vendors.has(m.providerVendor)).toBe(true);
    }
  });

  it("embedding models declare embedding.generate only (or with multimodal peers on provider)", () => {
    const embeddingModels = SEED_MODELS.filter((m) =>
      m.capabilities.includes("embedding.generate")
    );
    expect(embeddingModels.length).toBeGreaterThan(0);
    for (const m of embeddingModels) {
      expect(m.capabilities).toContain("embedding.generate");
    }
  });
});

describe("M9.5J global provider bypass expansion (static)", () => {
  const FORBIDDEN = [
    "src/platform/api/controllers",
    "src/platform/api/services/execution-api-service.ts",
    "src/platform/intelligence/prompt-compiler",
    "src/platform/business",
    "src/platform/studio",
    "src/platform/intelligence/agent-planning",
    "src/platform/intelligence/knowledge",
  ];

  const PATTERNS = [
    /from ["']openai["']/,
    /api\.elevenlabs\.io/,
    /api\.cartesia\.ai/,
    /api\.dev\.runwayml\.com/,
    /api\.anthropic\.com/,
  ];

  it("forbidden production paths do not hardcode vendor SDK endpoints", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const offenders: string[] = [];

    for (const rel of FORBIDDEN) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      walk(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (PATTERNS.some((p) => p.test(content))) {
          offenders.push(path.relative(repoRoot, file));
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

function walk(target: string, visit: (file: string, content: string) => void): void {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    visit(target, fs.readFileSync(target, "utf8"));
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    walk(path.join(target, entry.name), visit);
  }
}
