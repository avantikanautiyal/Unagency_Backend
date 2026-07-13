# Coding Standards

## Principles

- SOLID and Clean Architecture
- Program to interfaces
- Dependency inversion
- No `any` in public contracts
- Prefer `readonly` on public fields
- Expected failures use `Result<T>`; reserve throws for programmer/invariant errors

## Module Layout

Each module should expose:

- `interfaces/` — ports
- `contracts/` — request/response/event shapes
- `types/`, `errors/`, `constants/`
- `implementations/` — adapters (when needed)
- `index.ts` — public surface
- `README.md` — purpose and boundaries

## Imports

- Prefer `import type` for types-only imports
- No intelligence module may read `process.env` except `config`
- No business module (`src/controllers`, `src/models`, …) may import intelligence internals except an approved gateway (future)
- No AI SDKs in foundation modules

## Errors

- Extend `IntelligenceError`
- Include `code`, `message`, `metadata`, `timestamp`

## Identifiers

- Use branded IDs (`OrganizationId`, `ExecutionId`, …)
- Never use plain strings for domain IDs in public interfaces
