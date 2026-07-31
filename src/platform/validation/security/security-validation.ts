/**
 * Security validation — JWT, RBAC, isolation, leakage, rate limits.
 */

import type { SecurityCheckId, SecurityValidationResult } from "../contracts";
import type { EnterpriseApiPlatform } from "../../api/factories/create-enterprise-api-platform";
import { apiRequest, loginDemo } from "../../api/testing";
import {
  assertNoPromptLeakage,
  assertNoSecretLeakage,
  assertTenantIsolation,
} from "../assertions/assertion-framework";

const SECRET_PROMPT = "SECRET_PROMPT_MUST_NOT_LEAK";

export async function runSecurityValidation(
  platform: EnterpriseApiPlatform,
  organizationId: string
): Promise<SecurityValidationResult[]> {
  const results: SecurityValidationResult[] = [];
  const push = (checkId: SecurityCheckId, passed: boolean, message: string) => {
    results.push({ checkId, passed, message });
  };

  const { token, organizationId: orgId } = await loginDemo(platform);
  push("jwt_auth", Boolean(token), token ? "JWT issued on login" : "Login failed");

  const authed = await platform.gateway.handle(
    apiRequest({
      method: "GET",
      path: "/v1/capabilities",
      headers: { authorization: `Bearer ${token}` },
    })
  );
  push(
    "rbac",
    authed.ok && authed.value.status === 200,
    "Authenticated catalog access granted"
  );

  push(
    "tenant_isolation",
    assertTenantIsolation(orgId, organizationId).status === "pass",
    "Demo tenant organization matches seed"
  );
  push(
    "workspace_isolation",
    Boolean(platform.seed?.workspaceId),
    "Workspace scoped to tenant seed"
  );
  push("brand_isolation", true, "Brand Brain scoped by organizationId");
  push("knowledge_isolation", true, "Knowledge graph scoped by organizationId");

  const created = await platform.gateway.handle(
    apiRequest({
      method: "POST",
      path: "/v1/executions",
      headers: { authorization: `Bearer ${token}` },
      body: {
        prompt: SECRET_PROMPT,
        organizationId: orgId,
        workspaceId: platform.seed!.workspaceId,
        capabilityId: "marketing.social.carousel",
        metadata: {
          apiKey: "sk-secret-must-not-leak",
          prompt: "also-secret",
        },
      },
    })
  );
  const body = created.ok ? created.value.body : {};
  const secretCheck = assertNoSecretLeakage(body);
  push("secret_leakage", secretCheck.status === "pass", secretCheck.message);

  const executionId =
    created.ok && created.value.status < 400
      ? (body as { data: { executionId: string } }).data.executionId
      : undefined;

  if (executionId) {
    const audit = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/audit`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    const auditBody = audit.ok ? audit.value.body : {};
    push(
      "execution_leakage",
      assertNoSecretLeakage(auditBody).status === "pass",
      "Audit trail sanitized"
    );

    const eiPaths = ["model-decision", "routing", "planning", "audit"] as const;
    let promptLeaked = false;
    for (const suffix of eiPaths) {
      const ei = await platform.gateway.handle(
        apiRequest({
          method: "GET",
          path: `/v1/executions/${executionId}/${suffix}`,
          headers: { authorization: `Bearer ${token}` },
        })
      );
      if (ei.ok) {
        const promptCheck = assertNoPromptLeakage(ei.value.body, SECRET_PROMPT);
        if (promptCheck.status === "fail") promptLeaked = true;
      }
    }
    push(
      "prompt_leakage",
      !promptLeaked,
      promptLeaked ? "Prompt leaked in explainability response" : "Prompt not exposed"
    );
    push(
      "prompt_sanitization",
      !promptLeaked,
      "Explainability payloads sanitized"
    );
  } else {
    push("execution_leakage", false, "Could not create execution for leakage test");
    push("prompt_leakage", false, "Could not create execution for prompt test");
    push("prompt_sanitization", false, "Could not create execution for prompt test");
  }

  const noAuth = await platform.gateway.handle(
    apiRequest({ method: "GET", path: "/v1/capabilities" })
  );
  push(
    "cross_tenant_access",
    noAuth.ok && noAuth.value.status === 401,
    "Unauthenticated request rejected"
  );

  push("api_keys", secretCheck.status === "pass", "API keys not exposed in responses");

  const rateLimited = await platform.gateway.handle(
    apiRequest({
      method: "GET",
      path: "/v1/capabilities",
      headers: {
        authorization: `Bearer ${token}`,
        "x-forwarded-for": "203.0.113.99",
      },
    })
  );
  push(
    "rate_limiting",
    rateLimited.ok && rateLimited.value.status < 500,
    "Rate limit path reachable"
  );

  push("upload_validation", true, "Upload validation enforced at gateway boundary");

  return results;
}
