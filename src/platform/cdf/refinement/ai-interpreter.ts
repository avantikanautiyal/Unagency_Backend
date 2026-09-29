/**
 * Optional AI interpreter hook for refinement intent (M6).
 * Default path is deterministic parseRefinementInstruction.
 * AI MUST NOT rewrite DeckSpec — only propose structured intent.
 */

import type { ParsedRefinementIntent } from "./instruction-parser";
import { parseRefinementInstruction } from "./instruction-parser";
import { refinementError } from "./errors";

export type RefinementAiInterpreter = (input: {
  rawInstruction: string;
  mode: "intent_only";
}) => ParsedRefinementIntent;

const g = globalThis as typeof globalThis & {
  __cdfRefinementAiInterpreter?: RefinementAiInterpreter;
};

export function setCdfRefinementAiInterpreter(
  interpreter: RefinementAiInterpreter | undefined,
): void {
  g.__cdfRefinementAiInterpreter = interpreter;
}

export function resetCdfRefinementAiForTests(): void {
  g.__cdfRefinementAiInterpreter = undefined;
}

/**
 * Resolve structured intent. Never accepts a full DeckSpec from AI.
 */
export function interpretRefinementInstruction(
  rawInstruction: string,
): ParsedRefinementIntent {
  const ai = g.__cdfRefinementAiInterpreter;
  if (ai) {
    const intent = ai({ rawInstruction, mode: "intent_only" });
    if (
      intent &&
      typeof intent === "object" &&
      "slides" in (intent as object)
    ) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "AI must not return a full DeckSpec for refinement",
      );
    }
    return intent;
  }
  return parseRefinementInstruction(rawInstruction);
}
