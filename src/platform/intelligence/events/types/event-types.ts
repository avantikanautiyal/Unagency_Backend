/**
 * Well-known platform event types.
 * Extensible by future modules without changing the bus implementation.
 */

export const IntelligenceEventTypes = {
  PLATFORM_BOOTSTRAPPED: "intelligence.platform.bootstrapped",
  PLATFORM_READY: "intelligence.platform.ready",
  PLATFORM_SHUTDOWN: "intelligence.platform.shutdown",
  PLATFORM_HEALTH_CHANGED: "intelligence.platform.health_changed",
  MODULE_REGISTERED: "intelligence.module.registered",
  REGISTRY_ITEM_REGISTERED: "intelligence.registry.item_registered",
  AUDIT_RECORDED: "intelligence.security.audit_recorded",
  // Reserved for M1+
  EXECUTION_STARTED: "intelligence.execution.started",
  EXECUTION_COMPLETED: "intelligence.execution.completed",
  EXECUTION_FAILED: "intelligence.execution.failed",
} as const;

export type IntelligenceEventType =
  (typeof IntelligenceEventTypes)[keyof typeof IntelligenceEventTypes] | string;
