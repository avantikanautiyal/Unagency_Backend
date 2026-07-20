# M5.1.1 Universal Provider Template — Architecture Review

## Mission

Define the canonical provider blueprint so every future provider shares identical internal architecture.

## Position

```
Model Registry (M5.1) → Provider Template (M5.1.1) → Future Provider Implementations
                                                   ⇏ Frozen Adapter/SDK/Transport
```

## Standard lifecycle

```
Initialize → Authenticate → Validate → Health Check → Load Models → Ready → Execute → Stream → Shutdown
```

Template `bootstrap()` runs through: initializing → authenticating → validating → health_checking → loading_models → ready.

## Dependencies

```
template → shared, events, telemetry
template → provider adapter contracts (read-only)
template → model registry contracts (read-only)
template ⇏ SDK, runtime, transport, execution, business modules, networking
```

## Success criteria

Implementing any future provider requires only SDK wrapper, mappers, and manifest registration — no shared architecture changes.
