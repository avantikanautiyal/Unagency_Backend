/**
 * Abstract provider factory — subclass to wire a complete provider.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type { IProviderAdapter, IProviderClient, IProviderSdk } from "../interfaces/provider-template";

export interface TemplateProviderComponents {
  readonly client: IProviderClient;
  readonly sdk: IProviderSdk;
  readonly adapter: IProviderAdapter;
}

export abstract class AbstractProviderFactory {
  abstract readonly providerId: ProviderId;

  abstract create(): Result<TemplateProviderComponents>;
}
