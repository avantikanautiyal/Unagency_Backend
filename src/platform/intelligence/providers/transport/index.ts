/**
 * Provider Transport Platform (M4.5) — public barrel.
 *
 * Purpose: The single import surface for the transport platform.
 * Responsibilities: Re-export contracts, interfaces, and implementations.
 * Usage: `import { createTransportPlatform } from ".../providers/transport";`
 *
 * Provider-independent. No networking, no SDKs, no persistence.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./protocols";
export * from "./serializers";
export * from "./deserializers";
export * from "./compression";
export * from "./connection";
export * from "./pooling";
export * from "./clients";
export * from "./retry";
export * from "./timeout";
export * from "./streaming";
export * from "./health";
export * from "./middleware";
export * from "./dispatcher";
export * from "./pipeline";
export * from "./engine";
export * from "./diagnostics";
export * from "./builders";
export * from "./factories";
