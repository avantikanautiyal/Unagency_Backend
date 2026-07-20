/**
 * Delegates AI execution ONLY through Enterprise API Gateway.
 * Never calls Intelligence OS / Runtime / Providers directly.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { IApiGateway } from "../../api/interfaces";
import type { ApiRequest } from "../../api/contracts";

export interface GatewayExecutionResult {
  readonly gatewayExecutionId: string;
  readonly status: string;
  readonly correlationId?: string;
  readonly cost?: number;
  readonly evaluationScore?: number;
  readonly outputs?: Readonly<Record<string, unknown>>;
}

export class GatewayExecutionClient {
  constructor(
    private readonly gateway: IApiGateway,
    private readonly createId: (prefix: string) => string
  ) {}

  async createExecution(input: {
    prompt: string;
    organizationId: string;
    /** Only pass when the workspace exists in Enterprise API tenants. */
    apiWorkspaceId?: string;
    accessToken: string;
    /** Optional Brand Brain / business metadata — never OS internals. */
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<Result<GatewayExecutionResult>> {
    if (!input.accessToken?.trim()) {
      return failure(
        new ValidationError("gatewayAccessToken required — Business Platform cannot bypass Enterprise API")
      );
    }

    const request: ApiRequest = {
      requestId: this.createId("biz_api"),
      method: "POST",
      path: "/v1/executions",
      version: "v1",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: {
        prompt: input.prompt,
        organizationId: input.organizationId,
        ...(input.apiWorkspaceId ? { workspaceId: input.apiWorkspaceId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      correlationId: this.createId("biz_corr"),
    };

    const res = await this.gateway.handle(request);
    if (!res.ok) return res;
    if (res.value.status >= 400) {
      const err = res.value.body as { error?: { message?: string; code?: string } };
      return failure(
        new ValidationError(err.error?.message ?? "gateway execution failed", {
          status: res.value.status,
          code: err.error?.code,
        })
      );
    }

    const data = (res.value.body as { data: Record<string, unknown> }).data;
    return success({
      gatewayExecutionId: String(data.executionId),
      status: String(data.status ?? "unknown"),
      correlationId: data.correlationId ? String(data.correlationId) : undefined,
      cost: data.cost != null ? Number(data.cost) : undefined,
      evaluationScore:
        data.evaluationScore != null ? Number(data.evaluationScore) : undefined,
      outputs: {
        promptPreview: data.promptPreview,
        status: data.status,
      },
    });
  }
}
