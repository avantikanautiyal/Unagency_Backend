/**
 * Phase 7 — MCQ question contracts (machine-readable refinement signals).
 */

import type { RefinementOutputType } from "./refinement-request";

export type SelectionType = "single" | "multi";

export interface RefinementOption {
  readonly optionId: string;
  readonly label: string;
  readonly value: string;
  /** Machine-readable signal, e.g. visual_style.premium */
  readonly refinementSignal: string;
  /** Optional preserve hint when selecting this option */
  readonly preserveHint?: string;
}

export interface NextQuestionRule {
  readonly whenOptionIds: readonly string[];
  readonly nextQuestionId: string;
}

export interface RefinementQuestion {
  readonly questionId: string;
  readonly outputType: RefinementOutputType | "*";
  readonly dimension: string;
  readonly question: string;
  readonly options: readonly RefinementOption[];
  readonly required: boolean;
  readonly selectionType: SelectionType;
  readonly nextQuestionRules?: readonly NextQuestionRule[];
  /** Fallback next question when no rule matches */
  readonly defaultNextQuestionId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface PresentedQuestion {
  readonly question: RefinementQuestion;
  readonly questionNumber: number;
  readonly maxQuestions: number;
  readonly canComplete: boolean;
}
