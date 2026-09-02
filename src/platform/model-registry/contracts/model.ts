/**
 * Canonical model and model manifest contracts.
 */

import type { ProviderId } from "../../core/identifiers";
import type {
  AvailabilityState,
  DepartmentKind,
  InputTypeKind,
  LatencyTier,
  ModalityKind,
  OutputTypeKind,
  QualityTier,
} from "./enums";
import type { CanonicalModelId, ModelManifestId } from "./identifiers";
import type { ModelCapability, ModelCapabilityFlags } from "./capabilities";
import type { ModelCompatibilityProfile } from "./compatibility";
import type { ModelLifecycle } from "./lifecycle";
import type { ModelLimits } from "./limits";
import type { ModelPricing } from "./pricing";
import type { ModelRegion } from "./regions";

export interface CanonicalModel {
  readonly modelId: CanonicalModelId;
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly version: string;
  readonly modalities: readonly ModalityKind[];
  readonly capabilities: readonly ModelCapability[];
  readonly inputTypes: readonly InputTypeKind[];
  readonly outputTypes: readonly OutputTypeKind[];
  readonly flags: ModelCapabilityFlags;
  readonly limits: ModelLimits;
  readonly pricing: ModelPricing;
  readonly latencyTier: LatencyTier;
  readonly qualityTier: QualityTier;
  readonly availability: AvailabilityState;
  readonly regions: readonly ModelRegion[];
  readonly lifecycle: ModelLifecycle;
  readonly departments: readonly DepartmentKind[];
  readonly compatibility: ModelCompatibilityProfile;
  readonly aliases?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ModelManifest {
  readonly manifestId: ModelManifestId;
  readonly model: CanonicalModel;
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
