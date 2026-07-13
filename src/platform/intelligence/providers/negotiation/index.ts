/**
 * Provider Negotiation Platform (M4.3) — public barrel.
 *
 * Decides whether a provider MAY execute a request. Produces a
 * NegotiatedExecution consumed directly by the Provider Runtime.
 *
 * Does NOT execute providers, authenticate providers, call SDKs, or route.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./errors";

export * from "./capability";
export * from "./provider";
export * from "./model";
export * from "./compatibility";
export * from "./features";
export * from "./constraints";
export * from "./preferences";
export * from "./policies";
export * from "./budgeting";
export * from "./quality";
export * from "./regional";
export * from "./negotiation";
export * from "./engine";
export * from "./builders";
export * from "./factories";
