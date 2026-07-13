/**
 * Platform bootstrap and shutdown entry points.
 *
 * Purpose: Start and stop the Intelligence Platform kernel.
 * Responsibilities: Create container/kernel, initialize lifecycle, graceful shutdown.
 * Usage: Call bootstrapIntelligencePlatform() once at process start (when adopted).
 * Future Extension: Bootstrap profiles, readiness gates.
 */

import type { IntelligencePlatformConfig } from "../../config";
import { CompositionRoot } from "../composition/composition-root";
import type { IPlatformKernel } from "../interfaces/kernel";

export interface BootstrapOptions {
  readonly config?: IntelligencePlatformConfig;
  readonly autoStart?: boolean;
}

/** Active kernel for process-level shutdown. Explicitly required by bootstrap API. */
let activeKernel: IPlatformKernel | undefined;

/**
 * Bootstrap the Intelligence Platform kernel.
 *
 * Creates the service container and kernel via CompositionRoot, registers
 * foundation modules, initializes lifecycle, and returns PlatformKernel.
 * Does not execute AI.
 */
export async function bootstrapIntelligencePlatform(
  options: BootstrapOptions = {}
): Promise<IPlatformKernel> {
  if (activeKernel?.isReady()) {
    return activeKernel;
  }

  const root = new CompositionRoot();
  const kernel = root.createKernel({ config: options.config });

  if (options.autoStart === false) {
    await kernel.initialize();
  } else {
    await kernel.bootstrap();
  }

  activeKernel = kernel;
  return kernel;
}

export function getActiveKernel(): IPlatformKernel | undefined {
  return activeKernel;
}

/**
 * Gracefully stop lifecycle, dispose services, clear registry.
 */
export async function shutdownIntelligencePlatform(): Promise<void> {
  if (!activeKernel) {
    return;
  }

  const kernel = activeKernel;
  activeKernel = undefined;
  await kernel.shutdown();
}
