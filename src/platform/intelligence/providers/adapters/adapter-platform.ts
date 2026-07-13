/**
 * Provider Adapter Platform (M4.4) — public surface.
 *
 * Defines HOW providers integrate with UNAGENCY (framework only).
 * Contains NO concrete providers, NO networking, NO vendor SDKs.
 *
 * Exposed from a dedicated entry (not `index.ts`) because the frozen M1 provider
 * architecture already owns `adapters/index.ts` with a minimal `IProviderAdapter`
 * stub used by the frozen provider factory. M4.4 supersedes that stub
 * functionally but does not modify it (freeze rules). Import the adapter
 * platform from `providers/adapters/adapter-platform`.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./errors";
export * from "./capabilities";
export * from "./models";
export * from "./manifests";
export * from "./builders";
export * from "./normalization";
export * from "./translators";
export * from "./validation";
export * from "./lifecycle";
export * from "./streaming";
export * from "./diagnostics";
export * from "./registry";
export * from "./engine";
export * from "./base";
export * from "./factories";
