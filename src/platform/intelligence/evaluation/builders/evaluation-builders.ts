/**
 * Evaluation request and report builders.
 */

import { createHash, randomUUID } from "crypto";
import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { MemorySnapshot } from "../../memory/contracts/memory-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type {
  EvaluationIdentity,
  EvaluationReport,
  EvaluationRequest,
  EvaluationRubric,
  EvaluationSummary,
  JudgeResult,
} from "../contracts/evaluation-models";
import { EvaluationValidationError } from "../errors";
import type { IEvaluationReportBuilder } from "../interfaces/evaluation-ports";

export class EvaluationRequestBuilder {
  private requestId?: string;
  private identity?: EvaluationIdentity;
  private executionResult?: ExecutionResult;
  private compiledPrompt?: CompiledPrompt;
  private memorySnapshot?: MemorySnapshot;
  private rubricId?: string;
  private rubric?: EvaluationRubric;
  private attributes?: Readonly<Record<string, unknown>>;

  static create(): EvaluationRequestBuilder {
    return new EvaluationRequestBuilder();
  }

  withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  withIdentity(identity: EvaluationIdentity): this {
    this.identity = identity;
    return this;
  }

  withExecutionResult(executionResult: ExecutionResult): this {
    this.executionResult = executionResult;
    return this;
  }

  withCompiledPrompt(compiledPrompt?: CompiledPrompt): this {
    this.compiledPrompt = compiledPrompt;
    return this;
  }

  withMemorySnapshot(memorySnapshot?: MemorySnapshot): this {
    this.memorySnapshot = memorySnapshot;
    return this;
  }

  withRubricId(rubricId?: string): this {
    this.rubricId = rubricId;
    return this;
  }

  withRubric(rubric?: EvaluationRubric): this {
    this.rubric = rubric;
    return this;
  }

  withAttributes(attributes?: Readonly<Record<string, unknown>>): this {
    this.attributes = attributes;
    return this;
  }

  build(): EvaluationRequest {
    if (!this.identity || !this.executionResult) {
      throw new EvaluationValidationError("identity and executionResult are required");
    }
    return {
      requestId: this.requestId ?? `ereq_${randomUUID()}`,
      identity: this.identity,
      executionResult: this.executionResult,
      compiledPrompt: this.compiledPrompt,
      memorySnapshot: this.memorySnapshot,
      rubricId: this.rubricId,
      rubric: this.rubric,
      attributes: this.attributes,
    };
  }
}

export function evaluationIdentityFromIds(input: {
  organizationId: string;
  workspaceId: string;
  executionId: string;
  userId?: string;
  capabilityId?: string;
  correlationId?: string;
}): EvaluationIdentity {
  return {
    organizationId: asOrganizationId(input.organizationId),
    workspaceId: asWorkspaceId(input.workspaceId),
    executionId: asExecutionId(input.executionId),
    userId: input.userId ? asUserId(input.userId) : undefined,
    capabilityId: input.capabilityId ? asCapabilityId(input.capabilityId) : undefined,
    correlationId: input.correlationId,
  };
}

export class EvaluationReportBuilder implements IEvaluationReportBuilder {
  build(
    request: EvaluationRequest,
    rubric: EvaluationRubric,
    judgeResults: readonly JudgeResult[],
    summary: EvaluationSummary
  ): EvaluationReport {
    const generatedAt = new Date().toISOString();
    const payload = JSON.stringify({
      requestId: request.requestId,
      rubricId: rubric.id,
      judgeResults,
      summary,
      generatedAt,
    });
    const checksum = createHash("sha256").update(payload).digest("hex");

    return {
      reportId: `ereport_${randomUUID()}`,
      requestId: request.requestId,
      identity: request.identity,
      rubric,
      judgeResults,
      summary,
      generatedAt,
      checksum,
    };
  }
}
