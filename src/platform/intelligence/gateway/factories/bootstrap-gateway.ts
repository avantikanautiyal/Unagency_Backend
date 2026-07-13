/**
 * Bootstrap the full Intelligence Platform Gateway.
 */

import type { IntelligencePlatformConfig } from "../../config";
import {
  createIntelligencePlatform,
  type IntelligencePlatform,
  type PlatformCompositionOptions,
} from "./platform-composition-root";

export interface GatewayBootstrapOptions extends PlatformCompositionOptions {
  readonly config?: IntelligencePlatformConfig;
  readonly autoStartKernel?: boolean;
}

let activePlatform: IntelligencePlatform | undefined;

/**
 * Bootstrap kernel + control plane and return the public gateway façade.
 */
export async function bootstrapIntelligenceGateway(
  options: GatewayBootstrapOptions = {}
): Promise<IntelligencePlatform> {
  if (activePlatform?.kernel.isReady()) {
    return activePlatform;
  }

  const platform = createIntelligencePlatform({
    config: options.config,
    registerMocks: options.registerMocks,
  });

  if (options.autoStartKernel !== false) {
    await platform.kernel.bootstrap();
  } else {
    await platform.kernel.initialize();
  }

  activePlatform = platform;
  return platform;
}

export function getActiveIntelligencePlatform():
  | IntelligencePlatform
  | undefined {
  return activePlatform;
}

export async function shutdownIntelligenceGateway(): Promise<void> {
  if (!activePlatform) {
    return;
  }
  const platform = activePlatform;
  activePlatform = undefined;
  await platform.harness.runtime.dispose();
  await platform.kernel.shutdown();
}
