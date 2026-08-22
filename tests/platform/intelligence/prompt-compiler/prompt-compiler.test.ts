import { createPromptCompiler } from "../../../../src/platform/intelligence/prompt-compiler/factories/create-prompt-compiler";
import { sampleCompilationRequest } from "../../../../src/platform/intelligence/prompt-compiler/testing";
import { PromptParser } from "../../../../src/platform/intelligence/prompt-compiler/parser/prompt-parser";
import { InMemoryPromptTemplateRepository } from "../../../../src/platform/intelligence/prompt-compiler/templates/in-memory-template-repository";
import { PromptValidator } from "../../../../src/platform/intelligence/prompt-compiler/validation/prompt-validator";
import { PromptOptimizer } from "../../../../src/platform/intelligence/prompt-compiler/optimization/prompt-optimizer";
import { PromptVersionRegistry } from "../../../../src/platform/intelligence/prompt-compiler/versioning/prompt-version-registry";
import { VariableResolver } from "../../../../src/platform/intelligence/prompt-compiler/variables/variable-resolver";

describe("PromptCompiler", () => {
  it("compiles context and knowledge into CompiledPrompt", async () => {
    const compiler = createPromptCompiler();
    const request = await sampleCompilationRequest();
    const result = await compiler.compile(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.compiled.templateId).toBe("default.capability");
    expect(result.value.compiled.messages.length).toBeGreaterThan(0);
    expect(result.value.compiled.checksum).toBeTruthy();
    expect(result.value.compiled.resolvedVariables["capability.id"]).toBe(
      "echo"
    );
    expect(result.value.compiled.messages.some((m) => m.content.includes("org_1"))).toBe(
      true
    );
    expect(
      result.value.compiled.messages.some((m) =>
        m.content.includes("name=Acme Studio")
      )
    ).toBe(true);
  });

  it("injects knowledge summary", async () => {
    const compiler = createPromptCompiler();
    const request = await sampleCompilationRequest();
    const result = await compiler.compile(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const knowledgeMessage = result.value.compiled.messages.find(
      (m) => m.role === "knowledge"
    );
    expect(knowledgeMessage?.content.length).toBeGreaterThan(0);
  });
});

describe("Prompt pipeline components", () => {
  it("parses template into AST sections", async () => {
    const templates = new InMemoryPromptTemplateRepository();
    const template = await templates.get("default.capability");
    expect(template.ok).toBe(true);
    if (!template.ok) return;

    const ast = await new PromptParser().parse(template.value);
    expect(ast.ok).toBe(true);
    if (!ast.ok) return;
    expect(ast.value.sections.length).toBeGreaterThan(0);
    expect(ast.value.variables.length).toBeGreaterThan(0);
  });

  it("resolves variables from context", async () => {
    const request = await sampleCompilationRequest();
    const templates = new InMemoryPromptTemplateRepository();
    const template = await templates.get("default.capability");
    expect(template.ok).toBe(true);
    if (!template.ok) return;

    const resolved = new VariableResolver().resolve({
      context: request.context,
      knowledge: request.knowledge,
      variables: template.value.variables,
      overrides: request.variables,
    });

    expect(resolved.missing).toHaveLength(0);
    expect(resolved.values["identity.organizationId"]).toBe("org_1");
  });

  it("validates required sections", async () => {
    const request = await sampleCompilationRequest();
    const compiler = createPromptCompiler();
    const compiled = await compiler.compile(request);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const validated = await new PromptValidator().validate(
      compiled.value.compiled.document
    );
    expect(validated.ok).toBe(true);
  });

  it("optimizes empty text nodes", async () => {
    const request = await sampleCompilationRequest();
    const compiler = createPromptCompiler();
    const compiled = await compiler.compile(request);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const optimized = await new PromptOptimizer().optimize(
      compiled.value.compiled.document
    );
    expect(optimized.ok).toBe(true);
  });

  it("resolves template versions", async () => {
    const templates = new InMemoryPromptTemplateRepository();
    const versions = new PromptVersionRegistry(templates);
    const latest = await versions.latest("default.capability");
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      expect(latest.value.version).toBe("1.0.0");
      expect(latest.value.isStable).toBe(true);
    }
  });
});
