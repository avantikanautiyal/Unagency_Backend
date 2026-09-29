/**
 * CDF 2.0 M8A — Packaging canonical artifact model.
 */

export * from "./keys";
export * from "./coordinates";
export * from "./types";
export * from "./schemas";
export * from "./validate";
export * from "./fixtures";
export * from "./contract";
export {
  registerPackagingArtifactSchemas,
  ensurePackagingSchemasRegistered,
} from "./register";

import "./register";
