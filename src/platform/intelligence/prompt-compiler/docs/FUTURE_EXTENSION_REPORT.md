# Future Extension Report — M2.3 Prompt Compiler

## Designed for later (not implemented)

| Extension | Port |
|-----------|------|
| OpenAI chat-completions renderer | `IPromptRenderer` (`target: "openai"`) |
| Anthropic messages renderer | `IPromptRenderer` (`target: "anthropic"`) |
| Gemini content renderer | `IPromptRenderer` (`target: "gemini"`) |
| Persistent template store | `IPromptTemplateRepository` |
| Asset store (S3/CDN) | `IPromptAssetProvider` |
| Advanced optimizers (token budget, dedupe) | `IPromptOptimizer` |
| Template marketplace versions | `IPromptVersionRegistry` |

## Explicitly not implemented

- Any provider SDK
- Vendor-specific message formatting beyond neutral messages
- Database-backed templates
- Prompt execution / LLM calls

## Stable contract chain (recommended)

```
CapabilityRequest
  → IntelligenceContext
  → KnowledgeSnapshot
  → CompiledPrompt
  → ProviderRequest
  → ProviderResponse
  → ExecutionResult
  → MemoryRecord
```

`ProviderRequest` / `ProviderResponse` / `MemoryRecord` remain future milestones.
