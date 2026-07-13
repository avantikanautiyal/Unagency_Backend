# Scheduler Module

## Purpose

Scheduling future executions — delayed, retry, cron, resume, long-running, and timeout schedules.

## Responsibilities

- Define schedule contracts for delayed and cron execution
- Define retry and timeout scheduling ports
- Define workflow resume and long-running task schedule ports

## Inputs

Architecture contracts only (no runtime inputs in foundation phase).

## Outputs

Interfaces and contracts for future milestones.

## Dependencies

- shared (future)
- runtime (interfaces, future)

## Future Expansion

- BullMQ adapter
- Cron registry
- Durable schedule store

## What This Module MUST NOT Do

- Depend on BullMQ/Kafka/Redis in foundation phase
- Execute AI work
- Own orchestration logic
- Replace the events module
