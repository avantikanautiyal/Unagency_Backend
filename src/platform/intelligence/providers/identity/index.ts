/**
 * Provider Identity & Trust Platform (M4.2) — public barrel.
 *
 * Owns every provider credential. Responsible for identity and trust.
 * NOT responsible for execution, provider SDKs, or networking.
 *
 * The Provider Runtime requests a credential session via IProviderIdentityEngine
 * and receives ONLY a validated, secret-free CredentialSession.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./errors";

export * from "./vault";
export * from "./credentials";
export * from "./authentication";
export * from "./authorization";
export * from "./trust";
export * from "./permissions";
export * from "./tenancy";
export * from "./rotation";
export * from "./validation";
export * from "./sessions";
export * from "./policies";
export * from "./masking";
export * from "./auditing";
export * from "./engine";
export * from "./builders";
export * from "./factories";
