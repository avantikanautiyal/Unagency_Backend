/**
 * Phase 7 — Adaptive next-question selection (deterministic decision tree).
 */

import type { FeedbackAnswer } from "../contracts/feedback-session";
import type {
  PresentedQuestion,
  RefinementQuestion,
} from "../contracts/refinement-question";
import { MAX_REFINEMENT_QUESTIONS, type RefinementOutputType } from "../contracts/refinement-request";
import { contextualizeQuestion, type RefinementQuestionBank } from "./question-bank";

function firstMatchingNext(
  question: RefinementQuestion,
  selectedOptionIds: readonly string[],
  bank: RefinementQuestionBank,
  answeredIds: ReadonlySet<string>
): string | undefined {
  for (const rule of question.nextQuestionRules ?? []) {
    if (rule.whenOptionIds.some((id) => selectedOptionIds.includes(id))) {
      const next = bank.get(rule.nextQuestionId);
      if (next && !answeredIds.has(next.questionId)) return next.questionId;
    }
  }
  return undefined;
}

export function selectNextQuestionId(
  current: RefinementQuestion,
  selectedOptionIds: readonly string[],
  bank: RefinementQuestionBank,
  answeredIds: ReadonlySet<string>,
  previousAnswers: readonly FeedbackAnswer[] = []
): string | undefined {
  const fromCurrent = firstMatchingNext(
    current,
    selectedOptionIds,
    bank,
    answeredIds
  );
  if (fromCurrent) return fromCurrent;

  for (const prev of previousAnswers) {
    const q = bank.get(prev.questionId);
    if (!q) continue;
    const fromPrev = firstMatchingNext(q, prev.optionIds, bank, answeredIds);
    if (fromPrev) return fromPrev;
  }

  const fallback = current.defaultNextQuestionId;
  if (fallback && !answeredIds.has(fallback) && bank.get(fallback)) return fallback;
  // Prefer preserve if not yet asked
  if (!answeredIds.has("q_preserve") && bank.get("q_preserve")) return "q_preserve";
  return undefined;
}

export function toPresentedQuestion(
  question: RefinementQuestion,
  questionNumber: number,
  answeredCount: number,
  outputType?: RefinementOutputType
): PresentedQuestion {
  const remaining = MAX_REFINEMENT_QUESTIONS - answeredCount;
  const contextual = outputType ? contextualizeQuestion(question, outputType) : question;
  return {
    question: contextual,
    questionNumber,
    maxQuestions: MAX_REFINEMENT_QUESTIONS,
    // Can complete early once at least one answer exists and next would exceed budget,
    // or when preserve answered / no more adaptive questions.
    canComplete: answeredCount >= 1 && remaining <= 1,
  };
}

export function answeredIdSet(answers: readonly FeedbackAnswer[]): Set<string> {
  return new Set(answers.map((a) => a.questionId));
}
