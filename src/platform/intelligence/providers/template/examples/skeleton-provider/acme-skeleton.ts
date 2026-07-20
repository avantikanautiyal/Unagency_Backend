/**
 * Example skeleton provider — copy this to implement a real provider.
 * Uses generic "acme" vendor naming only.
 */

import { success, type Result } from "../../../../shared/result";
import { asProviderId } from "../../../../shared/identifiers";
import { AbstractProviderAdapter } from "../../adapters/abstract-provider-adapter";
import { AbstractProviderFactory } from "../../factories/abstract-provider-factory";
import { AbstractProviderSdk } from "../../sdk/abstract-provider-sdk";
import { AbstractRequestMapper } from "../../requests/abstract-request-mapper";
import { AbstractResponseMapper } from "../../responses/abstract-response-mapper";
import type { TemplateCanonicalRequest, TemplateCanonicalResponse } from "../../contracts/request-response";
import type { TemplateWirePayload } from "../../contracts/wire";
import type { IProviderClient, TemplateProviderComponents } from "../../interfaces/provider-template";
import type { TemplateLifecycleState } from "../../contracts/lifecycle";

const ACME_PROVIDER_ID = asProviderId("provider.acme");

class AcmeRequestMapper extends AbstractRequestMapper {
  protected map(request: TemplateCanonicalRequest): Result<TemplateWirePayload> {
    return success({
      model: request.modelId,
      input: request.input,
      parameters: request.parameters,
    });
  }
}

class AcmeResponseMapper extends AbstractResponseMapper {
  protected map(
    request: TemplateCanonicalRequest,
    wire: TemplateWirePayload
  ): Result<TemplateCanonicalResponse> {
    return success(
      this.baseResponse(request, { content: wire.output ?? wire.text ?? "" }, wire)
    );
  }
}

class AcmeSdk extends AbstractProviderSdk {
  constructor() {
    super(ACME_PROVIDER_ID);
  }

  protected async dispatch(wire: TemplateWirePayload): Promise<Result<TemplateWirePayload>> {
    return success({ ...wire, output: wire.input, simulated: true });
  }
}

class AcmeClient implements IProviderClient {
  readonly providerId = ACME_PROVIDER_ID;
  private ready = false;

  async initialize(): Promise<Result<void>> {
    this.ready = true;
    return success(undefined);
  }

  async shutdown(): Promise<Result<void>> {
    this.ready = false;
    return success(undefined);
  }

  getLifecycle(): TemplateLifecycleState {
    return {
      currentPhase: this.ready ? "ready" : "uninitialized",
      history: [],
      ready: this.ready,
    };
  }
}

export class AcmeProviderFactory extends AbstractProviderFactory {
  readonly providerId = ACME_PROVIDER_ID;

  create(): Result<TemplateProviderComponents> {
    const client = new AcmeClient();
    const sdk = new AcmeSdk();
    const adapter = new AbstractProviderAdapter(
      this.providerId,
      new AcmeRequestMapper(),
      new AcmeResponseMapper(),
      sdk
    );
    return success({ client, sdk, adapter });
  }
}
