# CLI Module

## Purpose

Command-line scaffolding for generating intelligence platform artifacts.

## Responsibilities

- Define CLI command contracts
- Register command names and usage strings
- Reserve command entry points for future milestones

## Inputs

CLI arguments (future).

## Outputs

Command definitions; M0 throws `NotImplementedError` on execute.

## Dependencies

- `shared` (errors)

## Future Expansion

- Code generators for providers, capabilities, agents, workflows, plugins
- Integration with npm scripts

## What This Module MUST NOT Do

- Implement generators in M0
- Call AI providers
- Modify business modules
- Persist data
