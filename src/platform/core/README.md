# Shared Module

## Purpose

Cross-cutting foundation types, errors, identifiers, and result pattern for the Intelligence Platform.

## Responsibilities

- Branded identifier types
- `Result` / `Success` / `Failure` pattern
- Error hierarchy (`IntelligenceError` and subclasses)
- `BaseMetadata` and pagination contracts
- Shared enums, utility types, value objects
- Primitive interfaces (`IClock`, `IIdGenerator`, `ILogger`) and default implementations

## Inputs

None at runtime (declarative + small utilities).

## Outputs

Types, contracts, errors, and utilities consumed by all foundation modules.

## Dependencies

None.

## Future Expansion

- Schema registry types
- Policy annotation types
- Internationalization catalogs

## What This Module MUST NOT Do

- Depend on other intelligence modules
- Read `process.env`
- Call AI providers
- Contain business domain logic
- Persist data
