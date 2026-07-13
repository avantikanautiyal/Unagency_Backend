/**
 * Shared module — cross-cutting types, errors, result pattern, identifiers.
 * All foundation modules may depend on shared.
 * Shared must never depend on any other intelligence module.
 */

export * from "./identifiers";
export * from "./result";
export * from "./errors";
export * from "./contracts";
export * from "./enums";
export * from "./interfaces";
export * from "./types";
export * from "./utils";
export * from "./value-objects";
