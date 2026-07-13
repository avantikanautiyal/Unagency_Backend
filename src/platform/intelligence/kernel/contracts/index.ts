import type { PlatformLifecyclePhase } from "../../shared/enums";

export interface KernelBootstrapContract {
  readonly autoStart: boolean;
  readonly registerFoundationModules: boolean;
}

export interface KernelStatusContract {
  readonly phase: PlatformLifecyclePhase;
  readonly ready: boolean;
}
