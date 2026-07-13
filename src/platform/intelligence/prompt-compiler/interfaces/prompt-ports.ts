/**
 * Prompt Compiler ports.
 *
 * Purpose: Compile IntelligenceContext + KnowledgeSnapshot into CompiledPrompt.
 * Responsibilities: Parse, resolve templates, inject variables, validate, optimize, render.
 * Usage: Injected into PromptCompiler.
 * Future Extension: Vendor renderers (OpenAI/Claude/Gemini) behind IPromptRenderer.
 */

import type { Result } from "../../shared/result";
import type {
  CompiledPrompt,
  PromptAST,
  PromptAsset,
  PromptCompilationRequest,
  PromptCompilationResult,
  PromptDocument,
  PromptTemplate,
  PromptVersion,
} from "../contracts/prompt-models";

export interface IPromptTemplateRepository {
  get(templateId: string, version?: string): Promise<Result<PromptTemplate>>;
  list(templateId?: string): Promise<Result<readonly PromptTemplate[]>>;
}

export interface IPromptParser {
  parse(template: PromptTemplate): Promise<Result<PromptAST>>;
}

export interface IPromptOptimizer {
  optimize(document: PromptDocument): Promise<Result<PromptDocument>>;
}

export interface IPromptValidator {
  validate(document: PromptDocument): Promise<Result<PromptDocument>>;
}

/**
 * Provider-specific renderers — interfaces only in M2.3.
 * Do not implement OpenAI/Claude/Gemini renderers here.
 */
export interface IPromptRenderer {
  readonly name: string;
  readonly target: "neutral" | "openai" | "anthropic" | "gemini" | "custom";
  render(document: PromptDocument): Promise<Result<CompiledPromptMessageView>>;
}

export interface CompiledPromptMessageView {
  readonly format: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface IPromptAssetProvider {
  resolve(assetIds: readonly string[]): Promise<Result<readonly PromptAsset[]>>;
}

export interface IPromptVersionRegistry {
  get(templateId: string, version?: string): Promise<Result<PromptVersion>>;
  list(templateId: string): Promise<Result<readonly PromptVersion[]>>;
  latest(templateId: string): Promise<Result<PromptVersion>>;
}

export interface IPromptCompiler {
  compile(
    request: PromptCompilationRequest
  ): Promise<Result<PromptCompilationResult>>;
}
