export const KERNEL_MODULE_NAME = "kernel" as const;

/** Logical foundation modules registered at bootstrap. */
export const FOUNDATION_MODULE_NAMES = [
  "kernel",
  "shared",
  "config",
  "events",
  "security",
  "telemetry",
  "runtime",
  "policies",
  "scheduler",
  "capability-catalog",
  "provider-capability-matrix",
  "execution-planner",
] as const;
