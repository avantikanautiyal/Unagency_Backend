/**
 * Model compatibility contracts.
 */

import type { InputTypeKind, ModalityKind, OutputTypeKind } from "./enums";
import type { ModelCapabilityFlags } from "./capabilities";

export interface ModelCompatibilityProfile {
  readonly modalities: readonly ModalityKind[];
  readonly inputTypes: readonly InputTypeKind[];
  readonly outputTypes: readonly OutputTypeKind[];
  readonly flags: ModelCapabilityFlags;
  readonly compatibleCapabilities: readonly string[];
}
