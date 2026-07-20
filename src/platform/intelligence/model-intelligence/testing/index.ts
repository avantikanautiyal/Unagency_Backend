/**
 * Model Intelligence testing utilities.
 */

import { asCapabilityId } from "../../shared/identifiers";
import { ModelIntelligenceRequestBuilder } from "../builders/model-intelligence-request-builder";
import {
  createModelIntelligencePlatform,
  type CreateModelIntelligencePlatformOptions,
  type ModelIntelligencePlatform,
} from "../factories/create-model-intelligence-platform";

export function sampleCarouselRequest() {
  return ModelIntelligenceRequestBuilder.create()
    .withRequestId("mi_req_carousel")
    .withCapabilityId(asCapabilityId("content.create.carousel"))
    .withDepartment("social_media")
    .withTaskDescription("Generate Instagram Carousel")
    .withExpectedOutputTokens(800)
    .build();
}

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupModelIntelligencePlatform(
  options: CreateModelIntelligencePlatformOptions = {}
): ModelIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createModelIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
