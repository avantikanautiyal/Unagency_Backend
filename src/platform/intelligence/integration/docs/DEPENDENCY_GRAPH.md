# Dependency Graph

```
integration/
  ├── uses public factories/interfaces from:
  │     task-intelligence, capability-intelligence, agent-planning,
  │     workflow-intelligence, execution-governance, experience-injection,
  │     experience-intelligence, execution-intelligence, model-intelligence,
  │     providers/negotiation, providers/routing, providers/runtime,
  │     provider-consensus, evaluation, learning, execution-optimization
  ├── adapters map contracts only
  ├── bridges invoke engines only
  └── does NOT modify frozen modules

Runtime: ControllableDispatcher by default (no SDK / network)
```
