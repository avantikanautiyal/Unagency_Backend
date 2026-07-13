/**
 * Lifecycle manager.
 *
 * Purpose: Drive registered participants through a consistent lifecycle.
 * Responsibilities: initialize, start, ready, stop, dispose.
 * Usage: Owned by PlatformKernel; participants registered during composition.
 * Future Extension: Phase timeouts, parallel start, restart policies.
 */

import { KernelError } from "../../shared/errors";
import type { ILogger } from "../../shared/interfaces";
import type {
  ILifecycle,
  ILifecycleManager,
  LifecyclePhase,
} from "../interfaces/lifecycle";

export class LifecycleManager implements ILifecycleManager {
  private readonly participants: ILifecycle[] = [];
  private currentPhase: LifecyclePhase = "created";

  constructor(private readonly logger: ILogger) {}

  get phase(): LifecyclePhase {
    return this.currentPhase;
  }

  register(participant: ILifecycle): void {
    if (this.participants.some((p) => p.name === participant.name)) {
      throw new KernelError("Lifecycle participant already registered", {
        name: participant.name,
      });
    }
    this.participants.push(participant);
  }

  async initialize(): Promise<void> {
    this.assertPhase("created", "stopped", "disposed");
    this.currentPhase = "initializing";
    await this.runPhase("initialize");
    this.currentPhase = "initialized";
    this.logger.info("intelligence.lifecycle.initialized");
  }

  async start(): Promise<void> {
    this.assertPhase("initialized", "created");
    if (this.currentPhase === "created") {
      await this.initialize();
    }
    this.currentPhase = "starting";
    await this.runPhase("start");
    this.currentPhase = "started";
    this.logger.info("intelligence.lifecycle.started");
  }

  async ready(): Promise<void> {
    this.assertPhase("started");
    this.currentPhase = "ready";
    await this.runPhase("ready");
    this.logger.info("intelligence.lifecycle.ready");
  }

  async stop(): Promise<void> {
    if (
      this.currentPhase === "stopped" ||
      this.currentPhase === "disposing" ||
      this.currentPhase === "disposed" ||
      this.currentPhase === "created"
    ) {
      return;
    }

    this.currentPhase = "stopping";
    await this.runPhaseReverse("stop");
    this.currentPhase = "stopped";
    this.logger.info("intelligence.lifecycle.stopped");
  }

  async dispose(): Promise<void> {
    if (this.currentPhase === "disposed") {
      return;
    }

    if (
      this.currentPhase !== "stopped" &&
      this.currentPhase !== "created" &&
      this.currentPhase !== "failed"
    ) {
      await this.stop();
    }

    this.currentPhase = "disposing";
    await this.runPhaseReverse("dispose");
    this.currentPhase = "disposed";
    this.participants.length = 0;
    this.logger.info("intelligence.lifecycle.disposed");
  }

  private async runPhase(
    method: "initialize" | "start" | "ready"
  ): Promise<void> {
    for (const participant of this.participants) {
      const handler = participant[method];
      if (handler) {
        await handler.call(participant);
      }
    }
  }

  private async runPhaseReverse(
    method: "stop" | "dispose"
  ): Promise<void> {
    for (let i = this.participants.length - 1; i >= 0; i -= 1) {
      const participant = this.participants[i];
      if (!participant) continue;
      const handler = participant[method];
      if (handler) {
        await handler.call(participant);
      }
    }
  }

  private assertPhase(...allowed: LifecyclePhase[]): void {
    if (!allowed.includes(this.currentPhase)) {
      throw new KernelError("Invalid lifecycle transition", {
        phase: this.currentPhase,
        allowed,
      });
    }
  }
}
