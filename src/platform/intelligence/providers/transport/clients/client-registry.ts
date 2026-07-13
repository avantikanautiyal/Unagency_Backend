/**
 * In-memory transport client registry.
 *
 * Purpose: Own transport clients keyed by protocol.
 * Responsibilities: register/resolve/has/list.
 * Usage: Injected into the dispatcher.
 * Future Extension: Multiple clients per protocol with selection policy.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError, ProviderError } from "../../../shared/errors";
import type { TransportProtocol } from "../contracts/enums";
import type { ITransportClient, ITransportClientRegistry } from "../interfaces/clients";

export class InMemoryTransportClientRegistry
  implements ITransportClientRegistry
{
  private readonly clients = new Map<TransportProtocol, ITransportClient>();

  register(client: ITransportClient): Result<void> {
    if (this.clients.has(client.protocol)) {
      return failure(
        new ProviderError("transport client already registered", {
          protocol: client.protocol,
        })
      );
    }
    this.clients.set(client.protocol, client);
    return success(undefined);
  }

  resolve(protocol: TransportProtocol): Result<ITransportClient> {
    const client = this.clients.get(protocol);
    if (!client) {
      return failure(
        new NotFoundError("no transport client for protocol", { protocol })
      );
    }
    return success(client);
  }

  has(protocol: TransportProtocol): boolean {
    return this.clients.has(protocol);
  }

  list(): readonly TransportProtocol[] {
    return [...this.clients.keys()];
  }
}
