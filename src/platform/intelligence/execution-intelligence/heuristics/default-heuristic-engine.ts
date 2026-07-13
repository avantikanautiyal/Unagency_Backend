/**
 * Default heuristic engine — placeholder heuristics only.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionHeuristic } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IHeuristicEngine } from "../interfaces/execution-intelligence";

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class DefaultHeuristicEngine implements IHeuristicEngine {
  evaluate(request: ExecutionIntelligenceRequest): Result<readonly ExecutionHeuristic[]> {
    const promptText = request.compiledPrompt.messages
      .map((m) => m.content)
      .join("\n");
    const promptTokens = estimateTokens(promptText);
    const knowledgeChunks = request.knowledge.documents?.length ?? 0;
    const constraints = request.compiledPrompt.constraints.length;
    const sections = request.compiledPrompt.document.ast.sections.length;

    const heuristics: ExecutionHeuristic[] = [
      {
        kind: "complexity",
        score: Math.min(1, promptTokens / 8000),
        weight: 0.25,
        rationale: `Estimated prompt complexity from ${promptTokens} tokens`,
      },
      {
        kind: "ambiguity",
        score: promptText.includes("?") ? 0.4 : 0.15,
        weight: 0.15,
        rationale: "Heuristic ambiguity from question density",
      },
      {
        kind: "knowledge_density",
        score: Math.min(1, knowledgeChunks / 20),
        weight: 0.2,
        rationale: `${knowledgeChunks} knowledge documents available`,
      },
      {
        kind: "instruction_count",
        score: Math.min(1, sections / 10),
        weight: 0.15,
        rationale: `${sections} prompt sections detected`,
      },
      {
        kind: "constraint_count",
        score: Math.min(1, constraints / 5),
        weight: 0.15,
        rationale: `${constraints} constraints detected`,
      },
      {
        kind: "output_schema",
        score: request.compiledPrompt.constraints.some((c) => c.kind === "custom")
          ? 0.8
          : 0.3,
        weight: 0.1,
        rationale: "Schema strictness heuristic",
      },
    ];

    return success(heuristics);
  }
}
