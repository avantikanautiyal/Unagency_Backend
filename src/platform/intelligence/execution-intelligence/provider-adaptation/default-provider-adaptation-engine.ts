/**
 * Provider adaptation engine — hints only, no SDK logic.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderAdaptationHints } from "../contracts/provider-adaptation";
import type { ExecutionStrategy } from "../contracts/strategy";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import type { IProviderAdaptationEngine } from "../interfaces/execution-intelligence";

export class DefaultProviderAdaptationEngine implements IProviderAdaptationEngine {
  adapt(
    request: ExecutionIntelligenceRequest,
    strategy: ExecutionStrategy
  ): Result<ProviderAdaptationHints> {
    const structured =
      request.compiledPrompt.constraints.some((c) => c.kind === "custom") ||
      request.compiledPrompt.document.ast.sections.some((s) => s.role === "output");

    return success({
      providerId: request.preferences?.targetProviderId,
      preferredFormatting: structured ? "json_or_markdown" : "markdown",
      reasoningStyle: strategy.requiresReasoning ? "chain_of_thought" : "direct",
      structuredOutputPreference: structured,
      toolCallingPreference: false,
      streamingPreference: strategy.kind !== "consensus_generation",
      contextPreference: strategy.kind === "research_first" ? "knowledge_heavy" : "balanced",
      hints: [
        structured ? "prefer structured output when supported" : "free-form output acceptable",
        strategy.requiresReasoning
          ? "allocate reasoning tokens before final answer"
          : "minimize reasoning overhead",
        strategy.requiresVerification
          ? "enable self-check pass after generation"
          : "single-pass generation preferred",
      ],
    });
  }
}
