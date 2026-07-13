# Module Guidelines

## Single Responsibility

Each module owns one concern. Do not mix event transport with authorization, or config loading with registries.

## Public Surface

Export only through `index.ts`. Internal files may be imported within the module; other modules should use the public surface.

## README Requirements

Every module README must document:

1. Purpose
2. Responsibilities
3. Inputs
4. Outputs
5. Dependencies
6. Future Expansion
7. What the module MUST NOT do

## Implementations

- Prefer interfaces in `interfaces/`
- Place adapters in `implementations/`
- Name adapters by transport/backend (`InMemoryEventBus`, `ConsoleTelemetry`)

## Testing

- Contract tests live under `testing/contracts`
- Integration tests under `testing/integration`
- Mocks under `testing/mocks`
- Do not put production logic in testing utilities
