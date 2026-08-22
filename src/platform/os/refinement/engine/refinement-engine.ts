/**
 * Phase 7 — Canonical refinement engine (request → MCQ → spec → re-execution provenance).
 * Does NOT call providers. Re-enters Execution Intelligence via replan + TaskGraphExecutor.
 */

import { RefinementError } from "../contracts/errors";
import type { FeedbackSession } from "../contracts/feedback-session";
import type { PresentedQuestion } from "../contracts/refinement-question";
import {
  OS_REFINEMENT_VERSION,
  type RefinementMode,
  type RefinementOutputType,
  type RefinementRequest,
  type RefinementRequestStatus,
} from "../contracts/refinement-request";
import type { RefinementSpecification } from "../contracts/refinement-specification";
import {
  createFeedbackSessionEngine,
  FeedbackSessionEngine,
  InMemoryFeedbackSessionStore,
  type IFeedbackSessionStore,
} from "./feedback-session-engine";
import { buildRefinementSpecification } from "./refinement-spec-builder";
import { inferOutputType } from "../questions/question-bank";
import { logOsExecutionEvent } from "../../observability/execution-log";
import type { IBrandBrainEngine } from "../../../business/brand-brain/interfaces";
import { learnFromRefinement } from "../../../business/brand-brain/learning/refinement-signal-learner";

export interface IRefinementStore {
  save(req: RefinementRequest): Promise<RefinementRequest>;
  get(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementRequest | undefined>;
  saveSpec(spec: RefinementSpecification): Promise<RefinementSpecification>;
  getSpec(
    specificationId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined>;
  getSpecByRefinement(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined>;
}

export class InMemoryRefinementStore implements IRefinementStore {
  private readonly byId = new Map<string, RefinementRequest>();
  private readonly specs = new Map<string, RefinementSpecification>();

  clear(): void {
    this.byId.clear();
    this.specs.clear();
  }

  async save(req: RefinementRequest): Promise<RefinementRequest> {
    this.byId.set(req.refinementId, req);
    return req;
  }

  async get(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementRequest | undefined> {
    const r = this.byId.get(refinementId);
    if (!r || r.organizationId !== organizationId) return undefined;
    return r;
  }

  async saveSpec(spec: RefinementSpecification): Promise<RefinementSpecification> {
    this.specs.set(spec.specificationId, spec);
    return spec;
  }

  async getSpec(
    specificationId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined> {
    const s = this.specs.get(specificationId);
    if (!s || s.organizationId !== organizationId) return undefined;
    return s;
  }

  async getSpecByRefinement(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined> {
    return [...this.specs.values()].find(
      (s) =>
        s.refinementId === refinementId && s.organizationId === organizationId
    );
  }
}

export interface CreateRefinementInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly sourceOutputId: string;
  readonly sourceVersion: number;
  readonly sourcePreview?: string;
  readonly mode: RefinementMode;
  readonly outputType?: RefinementOutputType;
  readonly outputContractId?: string;
  readonly taskType?: string;
  readonly taskKey?: string;
  readonly productService?: string;
  readonly planId?: string;
  readonly planVersion?: number;
  readonly sourceApprovalStatus?: string;
  readonly brandTone?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  /** Product brand to dual-write refinement preferences into. */
  readonly brandId?: string;
  readonly requireSourceApproved?: boolean;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class RefinementEngine {
  readonly implementationStatus = "implemented" as const;
  readonly runtimeVersion = OS_REFINEMENT_VERSION;

  private readonly store: IRefinementStore;
  private readonly feedback: FeedbackSessionEngine;
  private readonly feedbackStore: IFeedbackSessionStore;
  private readonly brandBrainEngine?: IBrandBrainEngine;

  constructor(
    deps: {
      readonly store?: IRefinementStore;
      readonly feedback?: FeedbackSessionEngine;
      readonly feedbackStore?: IFeedbackSessionStore;
      readonly brandBrainEngine?: IBrandBrainEngine;
    } = {}
  ) {
    this.store = deps.store ?? new InMemoryRefinementStore();
    this.feedbackStore = deps.feedbackStore ?? new InMemoryFeedbackSessionStore();
    this.feedback =
      deps.feedback ??
      createFeedbackSessionEngine({ store: this.feedbackStore });
    this.brandBrainEngine = deps.brandBrainEngine;
  }

  getStore(): IRefinementStore {
    return this.store;
  }

  getFeedbackEngine(): FeedbackSessionEngine {
    return this.feedback;
  }

  async requestRefinement(
    input: CreateRefinementInput
  ): Promise<{
    request: RefinementRequest;
    presented: PresentedQuestion;
    session: FeedbackSession;
  }> {
    if (!input.organizationId?.trim()) {
      throw new RefinementError("TENANT_VIOLATION", "organizationId required");
    }
    if (input.mode !== "AI" && input.mode !== "HYBRID") {
      throw new RefinementError(
        "MODE_NOT_SUPPORTED",
        "Structured refinement is for AI/HYBRID modes only"
      );
    }
    if (
      input.requireSourceApproved !== false &&
      input.sourceApprovalStatus &&
      input.sourceApprovalStatus !== "APPROVED"
    ) {
      throw new RefinementError(
        "SOURCE_NOT_APPROVED",
        "Only approved outputs may enter structured refinement by default"
      );
    }

    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p) => `${p}_${Date.now()}`);
    const at = nowIso();
    const outputType =
      input.outputType ??
      inferOutputType({
        outputContractId: input.outputContractId,
        taskType: input.taskType,
        taskKey: input.taskKey,
        productService: input.productService,
      });

    const refinementId = createId("refn");
    const sessionId = createId("fsess");
    const request: RefinementRequest = {
      refinementId,
      organizationId: input.organizationId,
      executionId: input.executionId,
      sourceOutputId: input.sourceOutputId,
      sourceVersion: input.sourceVersion,
      sourcePreview: input.sourcePreview,
      outputType,
      outputContractId: input.outputContractId,
      mode: input.mode,
      status: "FEEDBACK_IN_PROGRESS",
      feedbackSessionId: sessionId,
      refinementVersion: input.sourceVersion + 1,
      planId: input.planId,
      planVersion: input.planVersion,
      sourceApprovalStatus: input.sourceApprovalStatus,
      brandTone: input.brandTone,
      brandAvoidTerms: input.brandAvoidTerms,
      prohibitedPatterns: input.prohibitedPatterns,
      ...(input.brandId?.trim() ? { brandId: input.brandId.trim() } : {}),
      requestedAt: at,
      updatedAt: at,
    };
    await this.store.save(request);

    logOsExecutionEvent("refinement.requested", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: "FEEDBACK_IN_PROGRESS",
      planId: input.planId,
      planVersion: input.planVersion,
    });

    const started = await this.feedback.startSession({
      sessionId,
      refinementId,
      organizationId: input.organizationId,
      executionId: input.executionId,
      outputType,
      nowIso,
    });

    return { request, presented: started.presented, session: started.session };
  }

  async getNextQuestion(input: {
    readonly refinementId: string;
    readonly organizationId: string;
  }): Promise<PresentedQuestion | undefined> {
    const req = await this.requireRequest(input.refinementId, input.organizationId);
    if (!req.feedbackSessionId) return undefined;
    return this.feedback.getCurrentQuestion({
      sessionId: req.feedbackSessionId,
      organizationId: input.organizationId,
    });
  }

  async submitAnswer(input: {
    readonly refinementId: string;
    readonly organizationId: string;
    readonly questionId: string;
    readonly optionIds: readonly string[];
    readonly otherText?: string;
    readonly nowIso?: () => string;
  }): Promise<{
    request: RefinementRequest;
    next?: PresentedQuestion;
    completed: boolean;
    specification?: RefinementSpecification;
  }> {
    const req = await this.requireRequest(input.refinementId, input.organizationId);
    if (!req.feedbackSessionId) {
      throw new RefinementError("SESSION_NOT_FOUND", "No feedback session");
    }
    const result = await this.feedback.submitAnswer({
      sessionId: req.feedbackSessionId,
      organizationId: input.organizationId,
      questionId: input.questionId,
      optionIds: input.optionIds,
      otherText: input.otherText,
      nowIso: input.nowIso,
    });

    if (!result.completed) {
      return { request: req, next: result.next, completed: false };
    }

    return this.finalizeFromSession(req, result.session, input.nowIso);
  }

  async completeFeedback(input: {
    readonly refinementId: string;
    readonly organizationId: string;
    readonly nowIso?: () => string;
  }): Promise<{
    request: RefinementRequest;
    specification: RefinementSpecification;
  }> {
    const req = await this.requireRequest(input.refinementId, input.organizationId);
    if (!req.feedbackSessionId) {
      throw new RefinementError("SESSION_NOT_FOUND", "No feedback session");
    }
    const session = await this.feedback.completeEarly({
      sessionId: req.feedbackSessionId,
      organizationId: input.organizationId,
      nowIso: input.nowIso,
    });
    const finalized = await this.finalizeFromSession(req, session, input.nowIso);
    return {
      request: finalized.request,
      specification: finalized.specification!,
    };
  }

  async markExecuting(
    refinementId: string,
    organizationId: string,
    nowIso?: () => string
  ): Promise<RefinementRequest> {
    const req = await this.requireRequest(refinementId, organizationId);
    const at = (nowIso ?? (() => new Date().toISOString()))();
    const next: RefinementRequest = {
      ...req,
      status: "EXECUTING",
      updatedAt: at,
    };
    await this.store.save(next);
    logOsExecutionEvent("refinement.execution.started", {
      requestId: req.executionId,
      executionId: req.executionId,
      organizationId,
      status: "EXECUTING",
      planId: req.planId,
      planVersion: req.planVersion,
    });
    return next;
  }

  async markCompleted(
    refinementId: string,
    organizationId: string,
    status: Extract<
      RefinementRequestStatus,
      "COMPLETED" | "FAILED" | "BLOCKED_CONFLICT"
    > = "COMPLETED",
    nowIso?: () => string
  ): Promise<RefinementRequest> {
    const req = await this.requireRequest(refinementId, organizationId);
    const at = (nowIso ?? (() => new Date().toISOString()))();
    const next: RefinementRequest = {
      ...req,
      status,
      updatedAt: at,
      completedAt: at,
    };
    await this.store.save(next);
    logOsExecutionEvent("refinement.execution.completed", {
      requestId: req.executionId,
      executionId: req.executionId,
      organizationId,
      status,
      planId: req.planId,
      planVersion: req.planVersion,
    });
    return next;
  }

  private async finalizeFromSession(
    req: RefinementRequest,
    session: FeedbackSession,
    nowIsoFn?: () => string
  ): Promise<{
    request: RefinementRequest;
    next?: PresentedQuestion;
    completed: true;
    specification: RefinementSpecification;
  }> {
    const nowIso = nowIsoFn ?? (() => new Date().toISOString());
    const spec = buildRefinementSpecification({
      request: req,
      answers: session.answered,
      nowIso,
    });
    await this.store.saveSpec(spec);

    // Persist brand learning signals — best-effort, never blocks finalization
    if (this.brandBrainEngine) {
      void learnFromRefinement(spec, session.answered, {
        brandBrainEngine: this.brandBrainEngine,
      });
    }

    const blocking = spec.conflicts.some(
      (c) => c.resolution === "rejected" && c.code === "BRAND_OVERRIDE_DENIED"
    );
    // Brand conflicts don't block the whole refinement — they strip the change.
    // Only mark BLOCKED_CONFLICT if ALL changes were rejected and none remain.
    const status: RefinementRequestStatus =
      blocking && spec.requestedChanges.length === 0
        ? "BLOCKED_CONFLICT"
        : "SPEC_READY";

    const at = nowIso();
    const nextReq: RefinementRequest = {
      ...req,
      status,
      updatedAt: at,
    };
    await this.store.save(nextReq);

    logOsExecutionEvent("refinement.specification.created", {
      requestId: req.executionId,
      executionId: req.executionId,
      organizationId: req.organizationId,
      status,
      planId: req.planId,
      planVersion: req.planVersion,
    });

    return {
      request: nextReq,
      completed: true,
      specification: spec,
    };
  }

  private async requireRequest(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementRequest> {
    const req = await this.store.get(refinementId, organizationId);
    if (!req) {
      throw new RefinementError("REFINEMENT_NOT_FOUND", "Refinement not found");
    }
    return req;
  }
}

export function createRefinementEngine(deps?: {
  readonly store?: IRefinementStore;
  readonly feedback?: FeedbackSessionEngine;
  readonly feedbackStore?: IFeedbackSessionStore;
  readonly brandBrainEngine?: IBrandBrainEngine;
}): RefinementEngine {
  return new RefinementEngine(deps);
}
