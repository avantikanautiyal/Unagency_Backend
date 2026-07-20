# Universal Provider Template Framework (M5.1.1)

Architecture-only blueprint for every provider integration. **No vendor logic, SDKs, networking, or execution.**

## Adding a new provider

1. Copy `examples/skeleton-provider/`
2. Rename provider (e.g. `Acme` → your vendor)
3. Register manifest via Model Registry (M5.1)
4. Implement SDK wrapper + request/response mappers

## Request flow

```
Capability Request → Canonical Request → Request Mapper → SDK → Response Mapper → Canonical Response
```

See [`docs/`](./docs) for full specification.
