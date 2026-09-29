/**
 * CDF 2.0 M3B — Presentation artifact schemas.
 */

export * from "./keys";
export * from "./coordinates";
export * from "./types";
export * from "./validate";
export * from "./fixtures";
export {
  registerPresentationArtifactSchemas,
  ensurePresentationSchemasRegistered,
} from "./register";

// Side-effect: register into M3A schema registry
import "./register";
