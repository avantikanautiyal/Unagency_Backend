/**
 * @deprecated Prefer PlatformKernel.
 */
export { PlatformKernel as IntelligenceKernel } from "./platform-kernel";

import type { IServiceContainer } from "../interfaces/di";
import type { IPlatformKernel } from "../interfaces/kernel";
import { Tokens } from "../composition/tokens";

/** Resolve kernel from the service container after composition. */
export function resolveKernel(services: IServiceContainer): IPlatformKernel {
  return services.resolve(Tokens.Kernel);
}
