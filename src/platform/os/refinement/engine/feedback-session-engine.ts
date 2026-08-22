/**
 * Phase 7 — Feedback session engine (server-side max 5 MCQs).
 */

import { RefinementError } from "../contracts/errors";
import type {
  FeedbackAnswer,
  FeedbackSession,
} from "../contracts/feedback-session";
import type { PresentedQuestion } from "../contracts/refinement-question";
import {
  MAX_REFINEMENT_QUESTIONS,
  type RefinementOutputType,
} from "../contracts/refinement-request";
import {
  answeredIdSet,
  selectNextQuestionId,
  toPresentedQuestion,
} from "../questions/adaptive-selector";
import {
  createDefaultQuestionBank,
  type RefinementQuestionBank,
} from "../questions/question-bank";
import { logOsExecutionEvent } from "../../observability/execution-log";

const MAX_OTHER_TEXT = 280;

export interface IFeedbackSessionStore {
  save(session: FeedbackSession): Promise<FeedbackSession>;
  get(
    sessionId: string,
    organizationId: string
  ): Promise<FeedbackSession | undefined>;
}

export class InMemoryFeedbackSessionStore implements IFeedbackSessionStore {
  private readonly byId = new Map<string, FeedbackSession>();

  clear(): void {
    this.byId.clear();
  }

  async save(session: FeedbackSession): Promise<FeedbackSession> {
    this.byId.set(session.sessionId, session);
    return session;
  }

  async get(
    sessionId: string,
    organizationId: string
  ): Promise<FeedbackSession | undefined> {
    const s = this.byId.get(sessionId);
    if (!s || s.organizationId !== organizationId) return undefined;
    return s;
  }
}

export class FeedbackSessionEngine {
  private readonly storeInst: IFeedbackSessionStore;
  private readonly bankInst: RefinementQuestionBank;

  constructor(
    deps: {
      readonly store?: IFeedbackSessionStore;
      readonly bank?: RefinementQuestionBank;
    } = {}
  ) {
    this.storeInst = deps.store ?? new InMemoryFeedbackSessionStore();
    this.bankInst = deps.bank ?? createDefaultQuestionBank();
  }

  private get store(): IFeedbackSessionStore {
    return this.storeInst;
  }

  private get bank(): RefinementQuestionBank {
    return this.bankInst;
  }

  getStore(): IFeedbackSessionStore {
    return this.storeInst;
  }

  getBank(): RefinementQuestionBank {
    return this.bankInst;
  }

  async startSession(input: {
    readonly sessionId: string;
    readonly refinementId: string;
    readonly organizationId: string;
    readonly executionId: string;
    readonly outputType: RefinementOutputType;
    readonly nowIso?: () => string;
  }): Promise<{ session: FeedbackSession; presented: PresentedQuestion }> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const root = this.bank.rootFor(input.outputType);
    const at = nowIso();
    const session: FeedbackSession = {
      sessionId: input.sessionId,
      refinementId: input.refinementId,
      organizationId: input.organizationId,
      executionId: input.executionId,
      outputType: input.outputType,
      status: "ACTIVE",
      currentQuestionId: root.questionId,
      answered: [],
      questionCount: 0,
      maxQuestions: MAX_REFINEMENT_QUESTIONS,
      createdAt: at,
      updatedAt: at,
    };
    await this.store.save(session);
    logOsExecutionEvent("refinement.question.presented", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: root.questionId,
      planId: input.refinementId,
    });
    return {
      session,
      presented: toPresentedQuestion(root, 1, 0, input.outputType),
    };
  }

  async getCurrentQuestion(input: {
    readonly sessionId: string;
    readonly organizationId: string;
  }): Promise<PresentedQuestion | undefined> {
    const session = await this.store.get(input.sessionId, input.organizationId);
    if (!session || session.status !== "ACTIVE" || !session.currentQuestionId) {
      return undefined;
    }
    const q = this.bank.get(session.currentQuestionId);
    if (!q) return undefined;
    return toPresentedQuestion(q, session.questionCount + 1, session.questionCount, session.outputType);
  }

  async submitAnswer(input: {
    readonly sessionId: string;
    readonly organizationId: string;
    readonly questionId: string;
    readonly optionIds: readonly string[];
    readonly otherText?: string;
    readonly nowIso?: () => string;
  }): Promise<{
    session: FeedbackSession;
    next?: PresentedQuestion;
    completed: boolean;
  }> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const session = await this.store.get(input.sessionId, input.organizationId);
    if (!session) {
      throw new RefinementError("SESSION_NOT_FOUND", "Feedback session not found");
    }
    if (session.organizationId !== input.organizationId) {
      throw new RefinementError("TENANT_VIOLATION", "tenant isolation violation");
    }
    if (session.status !== "ACTIVE") {
      throw new RefinementError("SESSION_NOT_ACTIVE", "Session is not active");
    }
    if (session.questionCount >= MAX_REFINEMENT_QUESTIONS) {
      throw new RefinementError(
        "MAX_QUESTIONS_EXCEEDED",
        `Maximum ${MAX_REFINEMENT_QUESTIONS} questions already answered`
      );
    }
    if (session.currentQuestionId !== input.questionId) {
      throw new RefinementError(
        "INVALID_QUESTION",
        "Client cannot dictate arbitrary question IDs"
      );
    }
    if (session.answered.some((a) => a.questionId === input.questionId)) {
      throw new RefinementError("DUPLICATE_ANSWER", "Question already answered");
    }

    const question = this.bank.get(input.questionId);
    if (!question) {
      throw new RefinementError("INVALID_QUESTION", "Unknown question");
    }
    if (!input.optionIds.length) {
      throw new RefinementError("INVALID_OPTION", "At least one option required");
    }
    if (question.selectionType === "single" && input.optionIds.length !== 1) {
      throw new RefinementError("INVALID_OPTION", "Single selection required");
    }

    const selected = question.options.filter((o) =>
      input.optionIds.includes(o.optionId)
    );
    if (selected.length !== input.optionIds.length) {
      throw new RefinementError("INVALID_OPTION", "Invalid option for question");
    }

    const otherSelected = selected.some((o) => o.value === "other");
    const otherText =
      otherSelected && input.otherText
        ? input.otherText.trim().slice(0, MAX_OTHER_TEXT)
        : undefined;

    const answer: FeedbackAnswer = {
      questionId: question.questionId,
      dimension: question.dimension,
      optionIds: selected.map((o) => o.optionId),
      values: selected.map((o) => o.value),
      refinementSignals: selected.map((o) => o.refinementSignal),
      otherText,
      answeredAt: nowIso(),
    };

    const answered = [...session.answered, answer];
    const questionCount = answered.length;

    logOsExecutionEvent("refinement.answer.recorded", {
      requestId: session.executionId,
      executionId: session.executionId,
      organizationId: session.organizationId,
      status: question.questionId,
      planId: session.refinementId,
    });

    const ids = answeredIdSet(answered);
    let nextId =
      questionCount < MAX_REFINEMENT_QUESTIONS
        ? selectNextQuestionId(
            question,
            input.optionIds,
            this.bank,
            ids,
            answered
          )
        : undefined;

    // At question 5, force completion (no 6th)
    if (questionCount >= MAX_REFINEMENT_QUESTIONS) {
      nextId = undefined;
    }

    const at = nowIso();
    if (!nextId) {
      const completed: FeedbackSession = {
        ...session,
        status: "COMPLETED",
        currentQuestionId: undefined,
        answered,
        questionCount,
        updatedAt: at,
        completedAt: at,
      };
      await this.store.save(completed);
      logOsExecutionEvent("refinement.completed", {
        requestId: session.executionId,
        executionId: session.executionId,
        organizationId: session.organizationId,
        status: "COMPLETED",
        planId: session.refinementId,
        taskCount: questionCount,
      });
      return { session: completed, completed: true };
    }

    const nextQ = this.bank.get(nextId)!;
    const nextSession: FeedbackSession = {
      ...session,
      currentQuestionId: nextId,
      answered,
      questionCount,
      updatedAt: at,
    };
    await this.store.save(nextSession);
    logOsExecutionEvent("refinement.question.presented", {
      requestId: session.executionId,
      executionId: session.executionId,
      organizationId: session.organizationId,
      status: nextId,
      planId: session.refinementId,
    });
    return {
      session: nextSession,
      next: toPresentedQuestion(nextQ, questionCount + 1, questionCount, session.outputType),
      completed: false,
    };
  }

  /** Early complete when enough answers and under max */
  async completeEarly(input: {
    readonly sessionId: string;
    readonly organizationId: string;
    readonly nowIso?: () => string;
  }): Promise<FeedbackSession> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const session = await this.store.get(input.sessionId, input.organizationId);
    if (!session) {
      throw new RefinementError("SESSION_NOT_FOUND", "Feedback session not found");
    }
    if (session.status === "COMPLETED") return session;
    if (session.answered.length < 1) {
      throw new RefinementError(
        "SESSION_NOT_ACTIVE",
        "At least one answer required to complete"
      );
    }
    const at = nowIso();
    const completed: FeedbackSession = {
      ...session,
      status: "COMPLETED",
      currentQuestionId: undefined,
      updatedAt: at,
      completedAt: at,
    };
    await this.store.save(completed);
    return completed;
  }
}

export function createFeedbackSessionEngine(deps?: {
  readonly store?: IFeedbackSessionStore;
  readonly bank?: RefinementQuestionBank;
}): FeedbackSessionEngine {
  return new FeedbackSessionEngine(deps);
}
