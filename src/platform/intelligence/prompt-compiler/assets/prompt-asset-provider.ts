/**
 * Placeholder prompt asset provider.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptAsset } from "../contracts/prompt-models";
import type { IPromptAssetProvider } from "../interfaces/prompt-ports";

export class InMemoryPromptAssetProvider implements IPromptAssetProvider {
  constructor(private readonly assets: readonly PromptAsset[] = []) {}

  async resolve(
    assetIds: readonly string[]
  ): Promise<Result<readonly PromptAsset[]>> {
    if (assetIds.length === 0) {
      return success(this.assets);
    }
    const wanted = new Set(assetIds);
    return success(this.assets.filter((asset) => wanted.has(asset.id)));
  }
}
