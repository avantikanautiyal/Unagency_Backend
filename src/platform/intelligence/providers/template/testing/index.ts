/**
 * Template testing utilities.
 */

import { asProviderId } from "../../../shared/identifiers";
import { TemplateRequestBuilder } from "../builders/template-request-builder";
import {
  createTemplatePlatform,
  type CreateTemplatePlatformOptions,
  type TemplatePlatform,
} from "../factories/create-template-platform";

export const SKELETON_PROVIDER_ID = asProviderId("provider.acme");

export function sampleTemplateRequest() {
  return TemplateRequestBuilder.create()
    .withRequestId("tpl_req_1")
    .withProviderId(SKELETON_PROVIDER_ID)
    .withModelId("acme/model-alpha")
    .withInput({ messages: [{ role: "user", content: "Hello" }] })
    .build();
}

export function setupTemplatePlatform(
  options: CreateTemplatePlatformOptions = {}
): TemplatePlatform {
  return createTemplatePlatform(options);
}
