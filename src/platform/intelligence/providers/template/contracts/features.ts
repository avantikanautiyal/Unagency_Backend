/**
 * Feature matrix contracts.
 */

import type { TemplateFeatureKind } from "./enums";

export interface TemplateFeatureDescriptor {
  readonly kind: TemplateFeatureKind;
  readonly supported: boolean;
  readonly label: string;
  readonly description?: string;
}

export interface TemplateFeatureMatrix {
  readonly features: readonly TemplateFeatureDescriptor[];
  readonly supportedCount: number;
  readonly computedAt: string;
}
