/**
 * Factory for PromptCompiler with placeholder implementations.
 */

import { InMemoryPromptAssetProvider } from "../assets/prompt-asset-provider";
import { PromptCompiler } from "../compilation/prompt-compiler";
import type { IPromptCompiler, IPromptRenderer } from "../interfaces/prompt-ports";
import { PromptOptimizer } from "../optimization/prompt-optimizer";
import { PromptParser } from "../parser/prompt-parser";
import { OpenAIPromptRenderer } from "../renderers/openai-renderer";
import { InMemoryPromptTemplateRepository } from "../templates/in-memory-template-repository";
import type { PromptTemplate } from "../contracts/prompt-models";
import { PromptValidator } from "../validation/prompt-validator";
import { PromptVersionRegistry } from "../versioning/prompt-version-registry";

export interface CreatePromptCompilerOptions {
  /** Override renderer; defaults to OpenAIPromptRenderer. */
  readonly renderer?: IPromptRenderer;
  /** Seed templates in addition to / overriding the built-in defaults. */
  readonly templates?: readonly PromptTemplate[];
}

export function createPromptCompiler(
  options: CreatePromptCompilerOptions = {}
): IPromptCompiler {
  const templates = new InMemoryPromptTemplateRepository(options.templates);
  return new PromptCompiler({
    templates,
    parser: new PromptParser(),
    validator: new PromptValidator(),
    optimizer: new PromptOptimizer(),
    assets: new InMemoryPromptAssetProvider(),
    versions: new PromptVersionRegistry(templates),
    renderer: options.renderer ?? new OpenAIPromptRenderer(),
  });
}
