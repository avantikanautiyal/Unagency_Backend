/**
 * Factory for PromptCompiler with placeholder implementations.
 */

import { InMemoryPromptAssetProvider } from "../assets/prompt-asset-provider";
import { PromptCompiler } from "../compilation/prompt-compiler";
import type { IPromptCompiler } from "../interfaces/prompt-ports";
import { PromptOptimizer } from "../optimization/prompt-optimizer";
import { PromptParser } from "../parser/prompt-parser";
import { NeutralPromptRenderer } from "../renderers/neutral-renderer";
import { InMemoryPromptTemplateRepository } from "../templates/in-memory-template-repository";
import { PromptValidator } from "../validation/prompt-validator";
import { PromptVersionRegistry } from "../versioning/prompt-version-registry";

export function createPromptCompiler(): IPromptCompiler {
  const templates = new InMemoryPromptTemplateRepository();
  return new PromptCompiler({
    templates,
    parser: new PromptParser(),
    validator: new PromptValidator(),
    optimizer: new PromptOptimizer(),
    assets: new InMemoryPromptAssetProvider(),
    versions: new PromptVersionRegistry(templates),
    renderer: new NeutralPromptRenderer(),
  });
}
