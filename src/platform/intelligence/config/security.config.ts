export interface SecurityConfig {
  readonly auditEnabled: boolean;
  readonly strictAuthorization: boolean;
  readonly defaultClassification: "public" | "internal" | "confidential" | "restricted" | "pii";
}

export function loadSecurityConfig(): SecurityConfig {
  const classification = (process.env.INTELLIGENCE_DEFAULT_CLASSIFICATION ??
    "internal") as SecurityConfig["defaultClassification"];

  return {
    auditEnabled:
      (process.env.INTELLIGENCE_AUDIT_ENABLED ?? "true").toLowerCase() !==
      "false",
    strictAuthorization:
      (process.env.INTELLIGENCE_STRICT_AUTHZ ?? "false").toLowerCase() ===
      "true",
    defaultClassification: [
      "public",
      "internal",
      "confidential",
      "restricted",
      "pii",
    ].includes(classification)
      ? classification
      : "internal",
  };
}
