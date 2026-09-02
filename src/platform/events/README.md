# Events Module

## Purpose

Event-driven communication foundation for the Intelligence Platform.

## Responsibilities

- Define `IEventBus`, `IEventPublisher`, `IEventSubscriber`
- Define `EventEnvelope` and `EventMetadata`
- Catalog well-known `IntelligenceEventTypes`
- Provide an in-memory bus implementation (M0)
- Provide `EventFactory` for consistent envelope creation

## Inputs

`EventEnvelope` instances published by platform modules.

## Outputs

Delivered events to subscribed handlers.

## Dependencies

- `shared` (identifiers, clock, id generator)

## Future Expansion

- BullMQ adapter
- Kafka adapter
- Outbox pattern
- Event versioning

## What This Module MUST NOT Do

- Depend on Kafka or BullMQ in M0
- Execute AI logic
- Contain business workflows
- Persist events (deferred)
