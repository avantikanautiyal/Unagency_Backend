/**
 * Canonical provider and provider manifest contracts.
 */

import type { ProviderId } from "../../shared/identifiers";
import type { DepartmentKind, ModalityKind } from "./enums";
import type { ProviderManifestId } from "./identifiers";
import type { ModelLifecycleState } from "./enums";

export interface CanonicalProvider {
  readonly providerId: ProviderId;
  readonly vendor: string;
  readonly displayName: string;
  readonly description?: string;
  readonly departments: readonly DepartmentKind[];
  readonly modalities: readonly ModalityKind[];
  readonly supportedRegions: readonly string[];
  readonly lifecycleState: ModelLifecycleState;
  readonly websiteUrl?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderManifest {
  readonly manifestId: ProviderManifestId;
  readonly provider: CanonicalProvider;
  readonly modelIds: readonly string[];
  readonly defaultModelId?: string;
  readonly capabilities: readonly string[];
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
