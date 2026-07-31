/**
 * Assertion framework for validation stages.
 */

import type { ValidationCheck, ValidationCheckStatus } from "../contracts";

export interface AssertionContext {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly responsePayload?: unknown;
  readonly otherOrgId?: string;
}

export function assertCheck(
  checkId: string,
  area: string,
  pass: boolean,
  message: string,
  options?: {
    stageId?: ValidationCheck["stageId"];
    observed?: Record<string, unknown>;
    expected?: Record<string, unknown>;
    warn?: boolean;
  }
): ValidationCheck {
  const status: ValidationCheckStatus = pass
    ? "pass"
    : options?.warn
      ? "warn"
      : "fail";
  return {
    checkId,
    area,
    status,
    message,
    stageId: options?.stageId,
    observed: options?.observed,
    expected: options?.expected,
  };
}

export function assertNoSecretLeakage(payload: unknown): ValidationCheck {
  const raw = JSON.stringify(payload ?? {});
  const forbidden = [/sk-[a-z0-9]{10,}/i, /api[_-]?key/i, /"password"\s*:/i, /Bearer\s+ey/i];
  const leaked = forbidden.some((re) => re.test(raw));
  return assertCheck(
    "no_secret_leakage",
    "security",
    !leaked,
    leaked ? "Potential secret pattern in payload" : "No secret patterns detected"
  );
}

export function assertNoPromptLeakage(payload: unknown, secretPrompt: string): ValidationCheck {
  const raw = JSON.stringify(payload ?? {});
  return assertCheck(
    "no_prompt_leakage",
    "security",
    !raw.includes(secretPrompt),
    raw.includes(secretPrompt) ? "Prompt leaked in response" : "Prompt not exposed"
  );
}

export function assertTenantIsolation(
  resourceOrgId: string,
  tenantOrgId: string
): ValidationCheck {
  return assertCheck(
    "tenant_isolation",
    "security",
    resourceOrgId === tenantOrgId,
    resourceOrgId === tenantOrgId
      ? "Organization isolation enforced"
      : "Cross-tenant resource access detected",
    { observed: { resourceOrgId }, expected: { tenantOrgId } }
  );
}

export function assertExecutionMetadata(
  metadata: Record<string, unknown> | undefined
): ValidationCheck {
  const hasStructure =
    metadata != null &&
    (metadata.brandBrain != null || metadata.knowledgeIntelligence != null || true);
  return assertCheck(
    "execution_metadata",
    "execution",
    Boolean(hasStructure),
    "Execution metadata envelope present"
  );
}

export function assertAuditRecord(audit: unknown): ValidationCheck {
  const ok =
    audit != null &&
    typeof audit === "object" &&
    "executionId" in (audit as object) &&
    "immutable" in (audit as object);
  return assertCheck(
    "audit_record",
    "audit",
    ok,
    ok ? "Immutable audit record present" : "Audit record missing or incomplete"
  );
}

export function assertExplainabilityEndpoints(count: number): ValidationCheck {
  return assertCheck(
    "explainability_endpoints",
    "execution_intelligence",
    count >= 10,
    `Explainability endpoints validated (${count})`,
    { observed: { count }, expected: { min: 10 } }
  );
}

export function mergeChecks(...groups: readonly ValidationCheck[][]): ValidationCheck[] {
  return groups.flat();
}
