/**
 * Provider SDK Platform (M4.6) — public barrel.
 *
 * Purpose: The single import surface for the SDK platform.
 * Responsibilities: Re-export contracts, interfaces, and implementations.
 * Usage: `import { createSdkPlatform } from ".../providers/sdk";`
 *
 * Provider-independent. No SDK packages, no networking, no persistence.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./common";
export * from "./clients";
export * from "./registry";
export * from "./authentication";
export * from "./streaming";
export * from "./retries";
export * from "./timeout";
export * from "./health";
export * from "./diagnostics";
export * from "./engine";
export * from "./requests";
export * from "./responses";
export * from "./builders";
export * from "./factories";
