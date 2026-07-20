# Benchmark Model

## Overview

13 standard benchmark scenarios verify interface compatibility — never execute real providers.

## Scenarios

| Kind | Required Features |
|------|-------------------|
| creative_writing | text.generate |
| code_generation | text.generate, reasoning |
| reasoning | reasoning |
| research | text.generate, tool_calling |
| translation | text.generate |
| vision | vision |
| image_generation | image.generate |
| audio | audio |
| video | video |
| long_context | text.generate, long_context |
| json_extraction | json_mode, structured_outputs |
| tool_calling | tool_calling |
| agent_collaboration | tool_calling, reasoning |

## Schema

```typescript
interface BenchmarkScenario {
  readonly scenarioId: string;
  readonly kind: BenchmarkScenarioKind;
  readonly name: string;
  readonly requiredFeatures: readonly string[];
  readonly compatible: boolean;
}
```

## Assessment

`assessBenchmarkCompatibility()` checks adapter `supportedFeatures` against each scenario's
required features. Results feed `PerformanceMatrix` and `ProviderQualityReport`.

## Location

`scenarios/benchmark-catalog.ts`, `contracts/benchmarks.ts`
