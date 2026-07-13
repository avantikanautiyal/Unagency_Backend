# Execution Runtime (M1.5)

## Purpose

Execute an approved `ExecutionPlan` at the **platform** level.

Owns sessions, lifecycle, state machine, monitoring, store, and events.

Does **not** call AI providers or perform orchestration.

## Folder tree

```
execution-runtime/
├── session/
├── state-machine/
├── lifecycle/
├── monitor/
├── store/
├── events/
├── cancellation/
├── runtime/
├── interfaces/
├── contracts/
├── factories/
├── errors/
└── types/
```

## State machine

```
Created → Queued → Preparing → Running ⇄ Waiting
                         ↓         ⇄ Paused
                    Completed | Failed | Cancelled | TimedOut
```

## Runtime lifecycle

```
createSession(plan)
      ↓
ExecutionCreated
      ↓
start() → Queued → Preparing → Running
      ↓
ExecutionStarted
      ↓
runToCompletion() [placeholder node walk]
      ↓
Completed → ExecutionCompleted
```

Pause/resume/cancel are supported while non-terminal.

## Session model

`IExecutionSession`: `start`, `runToCompletion`, `pause`, `resume`, `cancel`, `fail`, `complete`, `snapshot`

## Event flow

Uses existing `IEventBus` + `EventFactory`:

- `intelligence.execution.created`
- `intelligence.execution.started`
- `intelligence.execution.paused`
- `intelligence.execution.resumed`
- `intelligence.execution.completed`
- `intelligence.execution.failed`
- `intelligence.execution.cancelled`

## Usage

```typescript
import { createExecutionRuntime } from "./platform/intelligence/execution-runtime";

const runtime = createExecutionRuntime({ eventBus, eventFactory });
const session = await runtime.executePlan({ context, plan });
```

## Boundaries / MUST NOT

- Call provider SDKs or HTTP
- Orchestrate multi-agent workflows
- Modify frozen milestones
- Persist to MongoDB/Redis
