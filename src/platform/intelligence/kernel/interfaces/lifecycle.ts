/**
 * Module lifecycle ports.
 *
 * Purpose: Provide a consistent lifecycle for intelligence modules.
 * Responsibilities: Define initialize → start → ready → stop → dispose phases.
 * Usage: LifecycleManager coordinates registered ILifecycle participants.
 * Future Extension: Parallel start, health-gated ready, restart policies.
 */

export type LifecyclePhase =
  | "created"
  | "initializing"
  | "initialized"
  | "starting"
  | "started"
  | "ready"
  | "stopping"
  | "stopped"
  | "disposing"
  | "disposed"
  | "failed";

/**
 * Lifecycle participant.
 *
 * Purpose: Allow modules to hook platform lifecycle transitions.
 * Responsibilities: Implement phase handlers relevant to the module.
 * Usage: Register with LifecycleManager during composition/bootstrap.
 * Future Extension: Priority ordering, dependencies between participants.
 */
export interface ILifecycle {
  readonly name: string;
  initialize?(): Promise<void> | void;
  start?(): Promise<void> | void;
  ready?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

/**
 * Lifecycle coordinator.
 *
 * Purpose: Drive all registered participants through lifecycle phases.
 * Responsibilities: initialize, start, ready, stop, dispose in order.
 * Usage: Owned by PlatformKernel.
 * Future Extension: Timeouts per phase, partial failure policies.
 */
export interface ILifecycleManager {
  readonly phase: LifecyclePhase;
  register(participant: ILifecycle): void;
  initialize(): Promise<void>;
  start(): Promise<void>;
  ready(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
