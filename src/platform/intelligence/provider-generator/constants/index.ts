export const PROVIDER_GENERATOR_VERSION = "1.0.0";

export const CANONICAL_INTEGRATION_TARGETS = [
  "Provider Runtime",
  "Provider Mesh",
  "Provider Routing",
  "Negotiation",
  "Provider Certification",
  "Model Registry",
  "Model Intelligence",
  "Capability Intelligence",
  "Dynamic Evaluation",
  "Experience Intelligence",
  "Integration Layer",
] as const;

export const REQUIRED_ARTIFACT_KINDS = [
  "contracts",
  "authentication",
  "sdk",
  "adapter",
  "request_mapper",
  "response_mapper",
  "model_resolver",
  "capability_mapper",
  "discovery",
  "dispatcher",
  "health",
  "factory",
  "index",
  "readme",
  "constants",
  "observability",
  "certification",
  "unit_test",
] as const;
