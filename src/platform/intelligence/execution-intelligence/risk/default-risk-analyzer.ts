/**
 * Risk analyzer — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionRisk } from "../contracts/risk";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IRiskAnalyzer } from "../interfaces/execution-intelligence";

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class DefaultRiskAnalyzer implements IRiskAnalyzer {
  analyze(request: ExecutionIntelligenceRequest): Result<readonly ExecutionRisk[]> {
    const promptText = request.compiledPrompt.messages.map((m) => m.content).join("\n");
    const tokens = estimateTokens(promptText);
    const maxBudget = request.preferences?.maxTokenBudget ?? 128000;
    const knowledgeEmpty = (request.knowledge.documents?.length ?? 0) === 0;
    const ambiguous = promptText.split("?").length > 3;
    const conflicting =
      request.compiledPrompt.constraints.length > 3 &&
      request.compiledPrompt.messages.length < 2;

    const risks: ExecutionRisk[] = [
      {
        id: "risk_ambiguity",
        category: "prompt_ambiguity",
        severity: ambiguous ? "medium" : "low",
        message: ambiguous
          ? "Prompt contains multiple unresolved questions"
          : "Prompt ambiguity within acceptable range",
        mitigation: ambiguous ? "Clarify task objectives before execution" : undefined,
        detected: ambiguous,
      },
      {
        id: "risk_context",
        category: "missing_context",
        severity: knowledgeEmpty ? "medium" : "low",
        message: knowledgeEmpty
          ? "No knowledge documents attached"
          : "Context coverage appears sufficient",
        mitigation: knowledgeEmpty ? "Attach relevant knowledge sources" : undefined,
        detected: knowledgeEmpty,
      },
      {
        id: "risk_knowledge",
        category: "knowledge_gap",
        severity: knowledgeEmpty ? "high" : "low",
        message: knowledgeEmpty
          ? "Knowledge gap may reduce output quality"
          : "Knowledge coverage adequate",
        detected: knowledgeEmpty,
      },
      {
        id: "risk_conflict",
        category: "conflicting_instructions",
        severity: conflicting ? "medium" : "low",
        message: conflicting
          ? "Multiple constraints with minimal instruction context"
          : "No conflicting instructions detected",
        detected: conflicting,
      },
      {
        id: "risk_tokens",
        category: "token_overflow",
        severity: tokens > maxBudget * 0.8 ? "high" : tokens > maxBudget * 0.6 ? "medium" : "low",
        message:
          tokens > maxBudget * 0.8
            ? "Estimated tokens approach maximum budget"
            : "Token budget within safe range",
        mitigation:
          tokens > maxBudget * 0.8 ? "Apply compression plan before execution" : undefined,
        detected: tokens > maxBudget * 0.6,
      },
      {
        id: "risk_policy",
        category: "policy_risk",
        severity: "low",
        message: "No elevated policy risks detected by heuristic scan",
        detected: false,
      },
    ];

    return success(risks);
  }
}
