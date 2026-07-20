# M5.1.1 Provider Template Specification

## Folder structure

```
template/
├── adapters/          AbstractProviderAdapter
├── sdk/               AbstractProviderSdk
├── transport/         (contract hooks only — no implementation)
├── authentication/    Placeholder
├── registry/          TemplateProviderRegistry
├── models/            Model + capability mappers
├── requests/          AbstractRequestMapper
├── responses/         AbstractResponseMapper + error/usage mappers
├── streaming/         AbstractStreamingEngine
├── reasoning|vision|image|video|audio|embeddings|moderation|assistants|tools|function-calling/
├── diagnostics/       DefaultDiagnostics
├── metrics/           DefaultMetricsCollector
├── health/            DefaultHealthEngine
├── engine/            TemplateProviderEngine (lifecycle)
├── builders/          TemplateRequestBuilder
├── factories/         AbstractProviderFactory, createTemplatePlatform
├── examples/skeleton-provider/   Acme skeleton
└── contracts|interfaces|constants|testing|docs
```

## Request mapping

`TemplateCanonicalRequest` → `IProviderRequestMapper.toWireRequest()` → `TemplateWirePayload`

## Response mapping

`TemplateWirePayload` → `IProviderResponseMapper.toCanonicalResponse()` → `TemplateCanonicalResponse`

## Error mapping

All errors → `TemplateProviderError` → `CanonicalErrorKind` (shared taxonomy)

## Feature matrix

18 standard features exposed via `TemplateFeatureMatrix`

## Health model

`healthy | degraded | maintenance | offline | disabled | deprecated`

## Metrics

Latency, TTFB, tokens, retries, streaming time, tool/function calls, cost, success/failure rates
