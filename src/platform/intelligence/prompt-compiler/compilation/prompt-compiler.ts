/**
 * Prompt Compiler.
 *
 * Purpose: Compile IntelligenceContext + KnowledgeSnapshot into CompiledPrompt.
 * Responsibilities: Template resolution, injection, validation, optimization, render selection.
 * Usage: createPromptCompiler().compile(request)
 * Future Extension: Vendor renderers behind IPromptRenderer.
 */

import { createHash, randomUUID } from "crypto";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  CompiledPrompt,
  CompiledPromptMessage,
  PromptCompilationRequest,
  PromptCompilationResult,
  PromptDocument,
  PromptNode,
  PromptSection,
} from "../contracts/prompt-models";
import { PromptCompilerError, PromptValidationError } from "../errors";
import type {
  IPromptAssetProvider,
  IPromptCompiler,
  IPromptOptimizer,
  IPromptParser,
  IPromptRenderer,
  IPromptTemplateRepository,
  IPromptValidator,
  IPromptVersionRegistry,
} from "../interfaces/prompt-ports";
import { VariableResolver } from "../variables/variable-resolver";

export interface PromptCompilerDependencies {
  readonly templates: IPromptTemplateRepository;
  readonly parser: IPromptParser;
  readonly validator: IPromptValidator;
  readonly optimizer: IPromptOptimizer;
  readonly assets: IPromptAssetProvider;
  readonly versions: IPromptVersionRegistry;
  readonly renderer: IPromptRenderer;
  readonly variableResolver?: VariableResolver;
  readonly nowIso?: () => string;
}

export class PromptCompiler implements IPromptCompiler {
  private readonly variables: VariableResolver;
  private readonly nowIso: () => string;

  constructor(private readonly deps: PromptCompilerDependencies) {
    this.variables = deps.variableResolver ?? new VariableResolver();
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  async compile(
    request: PromptCompilationRequest
  ): Promise<Result<PromptCompilationResult>> {
    // 1. Template resolution
    const template = await this.deps.templates.get(
      request.templateId,
      request.templateVersion
    );
    if (!template.ok) {
      return template;
    }

    const version = await this.deps.versions.get(
      template.value.id,
      template.value.version
    );
    if (!version.ok) {
      return version;
    }

    // 2. Parse → AST
    const ast = await this.deps.parser.parse(template.value);
    if (!ast.ok) {
      return ast;
    }

    // 3–4. Context + knowledge injection via variable resolution
    const resolved = this.variables.resolve({
      context: request.context,
      knowledge: request.knowledge,
      overrides: request.variables,
      variables: template.value.variables,
    });

    if (resolved.missing.length > 0) {
      return failure(
        new PromptValidationError("Missing required prompt variables", {
          missing: resolved.missing,
        })
      );
    }

    // Inject variables into AST nodes
    const injectedSections: PromptSection[] = ast.value.sections.map(
      (section) => ({
        ...section,
        nodes: section.nodes.map((node) => this.injectNode(node, resolved.values)),
      })
    );

    const assetsResult = await this.deps.assets.resolve(
      (request.assets ?? []).map((a) => a.id)
    );
    if (!assetsResult.ok) {
      return assetsResult;
    }

    let document: PromptDocument = {
      id: `pdoc_${randomUUID()}`,
      templateId: template.value.id,
      templateVersion: template.value.version,
      ast: {
        ...ast.value,
        sections: injectedSections,
        root: {
          ...ast.value.root,
          children: injectedSections.map((section) => ({
            id: section.id,
            kind: "section" as const,
            role: section.role,
            children: section.nodes,
          })),
        },
      },
      assets: [...(request.assets ?? []), ...assetsResult.value],
      metadata: request.attributes,
    };

    // 5. Constraint validation
    const validated = await this.deps.validator.validate(document);
    if (!validated.ok) {
      return validated;
    }
    document = validated.value;

    // 6. Optimization
    const optimized = await this.deps.optimizer.optimize(document);
    if (!optimized.ok) {
      return optimized;
    }
    document = optimized.value;

    // 7. Renderer selection (neutral only in M2.3)
    const rendered = await this.deps.renderer.render(document);
    if (!rendered.ok) {
      return rendered;
    }

    const messages = document.ast.sections.map<CompiledPromptMessage>(
      (section) => ({
        role: section.role,
        content: section.nodes.map((n) => n.text ?? "").join("\n").trim(),
        order: section.order,
      })
    );

    const compiledAt = this.nowIso();
    const compilationId = `pcomp_${randomUUID()}`;
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          compilationId,
          templateId: document.templateId,
          templateVersion: document.templateVersion,
          messages,
          compiledAt,
        })
      )
      .digest("hex")
      .slice(0, 16);

    const compiled: CompiledPrompt = {
      compilationId,
      templateId: document.templateId,
      templateVersion: document.templateVersion,
      document,
      messages,
      resolvedVariables: resolved.values,
      constraints: document.ast.constraints,
      checksum,
      compiledAt,
      metadata: {
        renderer: this.deps.renderer.name,
        renderFormat: rendered.value.format,
        versionStable: version.value.isStable,
      },
    };

    return success({
      compiled,
      warnings: [],
    });
  }

  private injectNode(
    node: PromptNode,
    values: Readonly<Record<string, string>>
  ): PromptNode {
    if (node.kind === "variable" && node.variableName) {
      return {
        ...node,
        kind: "text",
        text: values[node.variableName] ?? "",
      };
    }
    if (node.text) {
      return {
        ...node,
        text: this.variables.inject(node.text, values),
      };
    }
    return node;
  }
}
