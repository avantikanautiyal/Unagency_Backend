/**
 * Format & Production Spec catalog — all social platform field cards.
 */

import {
  FORMAT_PRODUCTION_SPEC_EDITION,
  FORMAT_PRODUCTION_SPEC_PROVENANCE,
  aspectRatioFromCanvas,
  getProductionRuleById,
  isProductionRuleReleasable,
  listProductionRules,
  listProductionRulesForPlatform,
  resolveProductionRule,
} from "../../../src/platform/config/format-production-spec";
import { formatOverlayRequirements } from "../../../src/platform/os/contracts/output-contracts/format-overlays";
import {
  extractSemanticSignals,
  resolveExecutionSpecification,
} from "../../../src/platform/collaboration/conversational-task-intelligence";

describe("format-production-spec catalog", () => {
  it("exposes edition provenance", () => {
    expect(FORMAT_PRODUCTION_SPEC_EDITION).toBe("1.0.0");
    expect(FORMAT_PRODUCTION_SPEC_PROVENANCE).toBe("format-spec@1.0.0");
  });

  it("covers all eight Spec platforms", () => {
    const platforms = new Set(
      listProductionRules().map((r) => r.platform).filter(Boolean),
    );
    expect([...platforms].sort()).toEqual([
      "facebook",
      "instagram",
      "linkedin",
      "snapchat",
      "tiktok",
      "whatsapp",
      "x",
      "youtube",
    ]);
  });

  it("resolves Instagram feed portrait by placement id", () => {
    const resolved = resolveProductionRule({
      placementId: "instagram.feed.portrait",
    });
    expect(resolved?.matchedBy).toBe("placementId");
    expect(resolved?.rule.canvas).toEqual({
      width: 1080,
      height: 1350,
      unit: "px",
    });
    expect(resolved?.rule.status).toBe("D");
    expect(isProductionRuleReleasable(resolved!.rule)).toBe(true);
  });

  it("maps Instagram C29 format ids to Spec masters", () => {
    const reels = resolveProductionRule({
      platform: "instagram",
      formatId: "reels",
    });
    expect(reels?.rule.id).toBe("instagram.reels");
    expect(reels?.rule.canvas).toEqual({
      width: 1080,
      height: 1920,
      unit: "px",
    });

    const carousel = resolveProductionRule({
      platform: "instagram",
      formatId: "carousel-post",
    });
    expect(carousel?.rule.canvas).toEqual({
      width: 1080,
      height: 1350,
      unit: "px",
    });

    const feed = resolveProductionRule({
      platform: "instagram",
      formatId: "feed-post",
    });
    expect(feed?.rule.id).toBe("instagram.feed.square");
    expect(feed?.rule.canvas).toEqual({
      width: 1080,
      height: 1080,
      unit: "px",
    });
  });

  it("maps Facebook C29 formats including Hold page-cover-video", () => {
    const cover = resolveProductionRule({
      platform: "facebook",
      formatId: "cover-photo",
    });
    expect(cover?.rule.canvas).toEqual({
      width: 1640,
      height: 624,
      unit: "px",
    });

    const reels = resolveProductionRule({
      platform: "facebook",
      formatId: "reels-2",
    });
    expect(reels?.rule.canvas).toEqual({
      width: 1080,
      height: 1920,
      unit: "px",
    });

    const hold = resolveProductionRule({
      platform: "facebook",
      formatId: "page-cover-video",
    });
    expect(hold?.rule.status).toBe("H");
    expect(isProductionRuleReleasable(hold!.rule)).toBe(false);
    expect(hold?.rule.canvas).toEqual({
      width: 820,
      height: 462,
      unit: "px",
    });
  });

  it("resolves LinkedIn verified ad sizes as V", () => {
    const ad = resolveProductionRule({
      placementId: "linkedin.ad.single-image.landscape",
    });
    expect(ad?.rule.status).toBe("V");
    expect(ad?.rule.sourceRef).toBe("[S3]");
    expect(ad?.rule.canvas).toEqual({
      width: 1200,
      height: 628,
      unit: "px",
    });
    expect(isProductionRuleReleasable(ad!.rule)).toBe(true);
  });

  it("maps LinkedIn C29 formats", () => {
    const cover = resolveProductionRule({
      platform: "linkedin",
      formatId: "company-cover-banner",
    });
    expect(cover?.rule.canvas).toEqual({
      width: 1128,
      height: 191,
      unit: "px",
    });

    const doc = resolveProductionRule({
      platform: "linkedin",
      formatId: "image-243",
    });
    expect(doc?.rule.id).toBe("linkedin.document-pages");
    expect(doc?.rule.canvas).toEqual({
      width: 1080,
      height: 1350,
      unit: "px",
    });
  });

  it("maps X / Twitter formats and verified app-install ad", () => {
    const header = resolveProductionRule({
      platform: "x",
      formatId: "header-cover-banner",
    });
    expect(header?.rule.canvas).toEqual({
      width: 1500,
      height: 500,
      unit: "px",
    });

    const poll = resolveProductionRule({
      platform: "twitter",
      formatId: "poll-graphic",
    });
    expect(poll?.rule.canvas).toEqual({
      width: 1600,
      height: 900,
      unit: "px",
    });

    const ad = resolveProductionRule({
      placementId: "x.ad.app-install",
    });
    expect(ad?.rule.status).toBe("V");
    expect(ad?.rule.sourceRef).toBe("[S4]");
    expect(ad?.rule.canvas).toEqual({
      width: 800,
      height: 418,
      unit: "px",
    });
  });

  it("maps YouTube to Spec masters (not legacy C29 artboards)", () => {
    const banner = resolveProductionRule({
      platform: "youtube",
      formatId: "channel-banner",
    });
    expect(banner?.rule.status).toBe("V");
    expect(banner?.rule.sourceRef).toBe("[S1]");
    expect(banner?.rule.canvas).toEqual({
      width: 2560,
      height: 1440,
      unit: "px",
    });

    const thumb = resolveProductionRule({
      platform: "youtube",
      formatId: "thumbnail",
    });
    expect(thumb?.rule.status).toBe("V");
    expect(thumb?.rule.canvas).toEqual({
      width: 3840,
      height: 2160,
      unit: "px",
    });

    const shorts = resolveProductionRule({
      platform: "youtube",
      formatId: "youtube-shorts-cover",
    });
    expect(shorts?.rule.id).toBe("youtube.shorts-thumbnail");
    expect(shorts?.rule.canvas).toEqual({
      width: 2160,
      height: 3840,
      unit: "px",
    });
  });

  it("maps TikTok including Hold profile cover and Review story", () => {
    const feed = resolveProductionRule({
      platform: "tiktok",
      formatId: "feed-video-vertical",
    });
    expect(feed?.rule.canvas).toEqual({
      width: 1080,
      height: 1920,
      unit: "px",
    });

    const cover = resolveProductionRule({
      platform: "tiktok",
      formatId: "profile-cover-photo",
    });
    expect(cover?.rule.status).toBe("H");
    expect(isProductionRuleReleasable(cover!.rule)).toBe(false);

    const story = resolveProductionRule({
      platform: "tiktok",
      formatId: "story",
    });
    expect(story?.rule.status).toBe("R");
    expect(isProductionRuleReleasable(story!.rule)).toBe(false);

    const spark = resolveProductionRule({
      platform: "tiktok",
      formatId: "spark-ads",
    });
    expect(spark?.rule.status).toBe("V");
    expect(spark?.rule.sourceRef).toBe("[S5]");
  });

  it("maps Snapchat house masters vs verified 720×1280 ads", () => {
    const story = resolveProductionRule({
      platform: "snapchat",
      formatId: "story-snap",
    });
    expect(story?.rule.status).toBe("D");
    expect(story?.rule.canvas).toEqual({
      width: 1080,
      height: 1920,
      unit: "px",
    });

    const ad = resolveProductionRule({
      platform: "snapchat",
      formatId: "commercial-ad",
    });
    expect(ad?.rule.status).toBe("V");
    expect(ad?.rule.sourceRef).toBe("[S6]");
    expect(ad?.rule.canvas).toEqual({
      width: 720,
      height: 1280,
      unit: "px",
    });

    const dynamic = resolveProductionRule({
      platform: "snapchat",
      formatId: "dynamic-product-ad",
    });
    expect(dynamic?.rule.status).toBe("R");
  });

  it("maps WhatsApp house presets (vertical status)", () => {
    const status = resolveProductionRule({
      platform: "whatsapp",
      formatId: "status",
    });
    expect(status?.rule.canvas).toEqual({
      width: 1080,
      height: 1920,
      unit: "px",
    });

    const catalog = resolveProductionRule({
      platform: "whatsapp",
      formatId: "catalog-product-image",
    });
    expect(catalog?.rule.canvas).toEqual({
      width: 800,
      height: 800,
      unit: "px",
    });

    const cover = resolveProductionRule({
      platform: "whatsapp",
      formatId: "public-profile-cover",
    });
    expect(cover?.rule.status).toBe("R");
  });

  it("lists rules per platform", () => {
    expect(listProductionRulesForPlatform("youtube").length).toBeGreaterThan(5);
    expect(
      listProductionRulesForPlatform("yt").every((r) => r.platform === "youtube"),
    ).toBe(true);
  });

  it("computes aspect ratios from canvas", () => {
    expect(aspectRatioFromCanvas(1080, 1350)).toBe("4:5");
    expect(aspectRatioFromCanvas(1080, 1080)).toBe("1:1");
    expect(aspectRatioFromCanvas(1080, 1920)).toBe("9:16");
    expect(aspectRatioFromCanvas(1200, 628)).toBe("300:157");
  });

  it("looks up rules by id", () => {
    expect(getProductionRuleById("linkedin.ad.single-image.square")?.canvas).toEqual({
      width: 1200,
      height: 1200,
      unit: "px",
    });
  });
});

describe("format overlays + production spec", () => {
  it("emits exact canvas requirement for Instagram reels", () => {
    const reqs = formatOverlayRequirements("reels", "instagram");
    const canvas = reqs.find((r) => r.id === "format.reels.production_canvas");
    expect(canvas?.evaluation.expectedResult).toBe("1080x1920");
    expect(canvas?.evaluation.blocksCompletion).toBe(false); // D
    expect(canvas?.description).toContain("format-spec@1.0.0");

    const ratio = reqs.find((r) => r.id === "format.reels.aspect_ratio");
    expect(ratio?.evaluation.expectedResult).toBe("9:16");
  });

  it("hard-blocks exact canvas for verified LinkedIn ad placement", () => {
    const reqs = formatOverlayRequirements(
      "linkedin.ad.single-image.landscape",
      "linkedin",
    );
    const canvas = reqs.find(
      (r) => r.id === "format.linkedin.ad.single-image.landscape.production_canvas",
    );
    expect(canvas?.evaluation.expectedResult).toBe("1200x628");
    expect(canvas?.evaluation.blocksCompletion).toBe(true); // V
    expect(canvas?.description).toContain("[S3]");
  });

  it("adds release hold for Facebook page-cover-video (H)", () => {
    const reqs = formatOverlayRequirements("page-cover-video", "facebook");
    const hold = reqs.find((r) => r.id === "format.page-cover-video.release_hold");
    expect(hold?.evaluation.blocksCompletion).toBe(true);
  });

  it("uses verified YouTube banner canvas from Spec", () => {
    const reqs = formatOverlayRequirements("channel-banner", "youtube");
    const canvas = reqs.find(
      (r) => r.id === "format.channel-banner.production_canvas",
    );
    expect(canvas?.evaluation.expectedResult).toBe("2560x1440");
    expect(canvas?.evaluation.blocksCompletion).toBe(true);
  });
});

describe("execution-spec prefill from production rule", () => {
  it("prefills Instagram reels canvas from Spec when brief omits size", () => {
    const message = "Create a short product reel for BloomSip.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "reels",
    });

    expect(spec.technical.width?.value).toBe(1080);
    expect(spec.technical.height?.value).toBe(1920);
    expect(spec.technical.width?.provenance.source).toBe("DEFAULT");
    expect(spec.technical.aspectRatio?.value).toBe("9:16");
    expect(spec.technical.resolution?.value).toBe("Rec.709");
    expect(spec.executionInstruction).toContain("1080×1920");
  });

  it("prefills LinkedIn organic square from feed-post-2", () => {
    const message = "Design a LinkedIn feed graphic.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "linkedin",
      format: "feed-post-2",
    });

    expect(spec.technical.width?.value).toBe(1080);
    expect(spec.technical.height?.value).toBe(1080);
    expect(spec.technical.resolution?.value).toBe("sRGB");
  });

  it("prefills YouTube channel banner from verified Spec size", () => {
    const message = "Create a YouTube channel banner.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "youtube",
      format: "channel-banner",
    });

    expect(spec.technical.width?.value).toBe(2560);
    expect(spec.technical.height?.value).toBe(1440);
  });

  it("prefills Snapchat commercial ad as verified 720×1280", () => {
    const message = "Create a Snapchat commercial.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "snapchat",
      format: "commercial-ad",
    });

    expect(spec.technical.width?.value).toBe(720);
    expect(spec.technical.height?.value).toBe(1280);
  });

  it("prefills WhatsApp status as vertical house master", () => {
    const message = "Create a WhatsApp status.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "whatsapp",
      format: "status",
    });

    expect(spec.technical.width?.value).toBe(1080);
    expect(spec.technical.height?.value).toBe(1920);
  });

  it("does not override explicit user dimensions", () => {
    const message = "Create the image as PNG at 1080×1350.";
    const spec = resolveExecutionSpecification({
      message,
      signals: extractSemanticSignals(message),
      action: "CREATE_NEW",
      requirements: [],
      service: "social",
      subtype: "content-design",
      platform: "instagram",
      format: "feed-post",
    });

    expect(spec.technical.width?.value).toBe(1080);
    expect(spec.technical.height?.value).toBe(1350);
    expect(spec.technical.width?.provenance.explicit).toBe(true);
  });
});
