/**
 * CDF 2.0 M9A — Social Media canonical artifact model.
 */

export * from "./keys";
export * from "./coordinates";
export * from "./types";
export * from "./schemas";
export * from "./validate";
export * from "./fixtures";
export * from "./contract";
export {
  registerSocialMediaArtifactSchemas,
  ensureSocialMediaSchemasRegistered,
} from "./register";

import "./register";
