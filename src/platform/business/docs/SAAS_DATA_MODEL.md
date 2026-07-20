# SaaS Data Model

In-memory repositories in `BusinessPlatformEngine` (no Mongo coupling in this milestone).

Key identifiers: `organizationId`, `workspaceId`, `projectId`, `brandId`,
`campaignId`, `businessExecutionId`, `gatewayExecutionId`.

Immutable-after-create records with `createdAt` / `updatedAt` where mutable.
Knowledge documents carry monotonic `version`.
Campaigns carry lifecycle timestamps (`scheduledAt`, `startedAt`, `completedAt`).
