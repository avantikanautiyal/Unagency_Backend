/**
 * Kernel factories.
 *
 * Purpose: Construct PlatformKernel via CompositionRoot.
 * Responsibilities: IPlatformKernelFactory implementation.
 * Usage: Prefer bootstrapIntelligencePlatform for process entry.
 * Future Extension: Test-specific factories.
 */

import type { IntelligencePlatformConfig } from "../../config";
import { CompositionRoot } from "../composition/composition-root";
import type { IPlatformKernel } from "../interfaces/kernel";

export interface IPlatformKernelFactory {
  create(config?: IntelligencePlatformConfig): IPlatformKernel;
}

export class PlatformKernelFactory implements IPlatformKernelFactory {
  create(config?: IntelligencePlatformConfig): IPlatformKernel {
    return new CompositionRoot().createKernel({ config });
  }
}

/** @deprecated Prefer PlatformKernelFactory */
export type IIntelligenceKernelFactory = IPlatformKernelFactory;

/** @deprecated Prefer PlatformKernelFactory */
export class IntelligenceKernelFactory extends PlatformKernelFactory {}
