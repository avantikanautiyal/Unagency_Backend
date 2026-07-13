# Prompt Compiler (M2.3)

## Purpose

Compile `IntelligenceContext` + `KnowledgeSnapshot` + `PromptTemplate` into a provider-independent `CompiledPrompt`.

This is a **compiler**, not a prompt builder and not an AI executor.

## Pipeline

```
PromptCompilationRequest
  → Template Resolution
  → AST Parse
  → Context Injection
  → Knowledge Injection
  → Variable Resolution
  → Constraint Validation
  → Optimization
  → Renderer Selection (neutral)
  → CompiledPrompt
```

## Stable contract chain (platform)

```
CapabilityRequest
  → IntelligenceContext
  → KnowledgeSnapshot
  → CompiledPrompt
  → ProviderRequest (future)
  → ProviderResponse (future)
  → ExecutionResult
  → MemoryRecord (future)
```

## Usage

```typescript
import { createPromptCompiler } from "./platform/intelligence/prompt-compiler";

const compiler = createPromptCompiler();
const result = await compiler.compile({
  templateId: "default.capability",
  context,
  knowledge,
});
```

## Boundaries / MUST NOT

- Call providers or import SDKs
- Implement OpenAI/Claude/Gemini renderers
- Access databases or HTTP
- Execute AI
- Modify frozen milestones
