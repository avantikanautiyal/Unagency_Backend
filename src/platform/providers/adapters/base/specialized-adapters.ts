/**
 * Specialized abstract adapters.
 *
 * Purpose: Modality-specialized reusable base classes future providers extend.
 * Responsibilities: Fix the AdapterCategory; add modality-specific helpers.
 * Usage: A concrete provider (M4.5) extends the matching base and implements
 *   translateRequest only.
 * Future Extension: New modality bases (e.g. video).
 */

import type { AdapterCategory } from "../contracts/enums";
import { AbstractProviderAdapter } from "./abstract-provider-adapter";

export abstract class AbstractTextProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "text";
}

export abstract class AbstractMultimodalProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "multimodal";
}

