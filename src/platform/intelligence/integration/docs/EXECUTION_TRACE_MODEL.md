# Execution Trace Model

## IntegrationExecutionTrace

| Field | Purpose |
|-------|---------|
| `traceId` | Unique trace identifier |
| `correlationId` | End-to-end correlation |
| `requestId` | Business request id |
| `stages` | Per-stage timing + status + message |
| `bridges` | Per-bridge observability records |
| `completedStages` | Ordered success list |
| `failedStage` | First failure (if any) |

## BridgeObservabilityRecord

| Field | Purpose |
|-------|---------|
| `invocationId` | Bridge call id |
| `bridgeName` | Interface name |
| `fromStage` / `toStage` | Hop |
| `durationMs` | Timing |
| `inputSummary` / `outputSummary` | Compact I/O |
| `artifactRefs` | Artifact references |
| `status` / `errorMessage` | Outcome |

Helpers: `summarizeTrace`, `isCompleteFullPipeline`, `collectBridgeFailures`.
