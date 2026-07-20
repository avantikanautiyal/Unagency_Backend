/**
 * Template diagnostics.
 */

import { success, type Result } from "../../../shared/result";
import { buildFeatureMatrix } from "../constants/feature-matrix";
import type { TemplateFeatureKind } from "../contracts/enums";
import type { TemplateFeatureMatrix } from "../contracts/features";
import type { IProviderDiagnostics } from "../interfaces/provider-template";

export class DefaultDiagnostics implements IProviderDiagnostics {
  constructor(
    private readonly supportedFeatures: Readonly<Set<TemplateFeatureKind>> = new Set([
      "text_generation",
      "streaming",
    ])
  ) {}

  inspect(): Result<Readonly<Record<string, unknown>>> {
    return success({
      template: "universal-provider-template",
      version: "1.0.0",
      architectureOnly: true,
    });
  }

  featureMatrix(): Result<TemplateFeatureMatrix> {
    return success(buildFeatureMatrix(this.supportedFeatures));
  }
}
