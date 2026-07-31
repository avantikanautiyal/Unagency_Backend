import type { ProviderId } from "../../../shared/identifiers";
import type { IProviderDispatcher } from "../interfaces/provider-dispatcher";
import {
  isAsyncProviderDispatcher,
  type ProviderExecutionSemantics,
} from "../../async/interfaces/async-provider-dispatcher";

export type ProviderRuntimeLifecycleState =
  | "catalogued"
  | "registered"
  | "executable"
  | "healthy"
  | "available";

export interface ExecutableProviderEntry {
  readonly providerId: ProviderId;
  readonly dispatcher: IProviderDispatcher;
  readonly executionSemantics?: ProviderExecutionSemantics;
  /**
   * ProviderRuntime may call dispatcher.supportsStreaming() with a provider id
   * argument. Some leaf dispatchers use wire-provider ids internally.
   */
  readonly dispatcherSupportsStreamingProviderId?: ProviderId;
  readonly status: ProviderRuntimeLifecycleState;
  readonly capabilities: readonly string[];
}

export interface IProviderRuntimeRegistry {
  registerCatalogued(
    providerId: ProviderId,
    capabilities: readonly string[]
  ): void;

  registerExecutable(entry: {
    providerId: ProviderId;
    dispatcher: IProviderDispatcher;
    status?: ProviderRuntimeLifecycleState;
    capabilities: readonly string[];
    dispatcherSupportsStreamingProviderId?: ProviderId;
  }): void;

  setStatus(providerId: ProviderId, status: ProviderRuntimeLifecycleState): void;

  /**
   * Resolve a provider that is safe to execute. Catalogue providers MUST NOT
   * be returned here.
   */
  resolveAvailable(providerId: ProviderId): ExecutableProviderEntry | undefined;

  listAvailableProviderIds(): readonly ProviderId[];
}

export class InMemoryProviderRuntimeRegistry
  implements IProviderRuntimeRegistry
{
  private readonly entries = new Map<ProviderId, ExecutableProviderEntry>();

  registerCatalogued(
    providerId: ProviderId,
    capabilities: readonly string[]
  ): void {
    const existing = this.entries.get(providerId);
    if (existing) {
      this.entries.set(providerId, {
        ...existing,
        status: existing.status === "available" ? existing.status : "catalogued",
        capabilities,
      });
      return;
    }

    // Catalogue providers are not executable; stash capabilities if present.
    this.entries.set(providerId, {
      providerId,
      dispatcher: undefined as never,
      status: "catalogued",
      capabilities,
    });
  }

  registerExecutable(entry: {
    providerId: ProviderId;
    dispatcher: IProviderDispatcher;
    status?: ProviderRuntimeLifecycleState;
    capabilities: readonly string[];
    dispatcherSupportsStreamingProviderId?: ProviderId;
  }): void {
    this.entries.set(entry.providerId, {
      providerId: entry.providerId,
      dispatcher: entry.dispatcher,
      executionSemantics: isAsyncProviderDispatcher(entry.dispatcher)
        ? "async"
        : "sync",
      dispatcherSupportsStreamingProviderId:
        entry.dispatcherSupportsStreamingProviderId,
      capabilities: entry.capabilities,
      status: entry.status ?? "available",
    });
  }

  setStatus(providerId: ProviderId, status: ProviderRuntimeLifecycleState): void {
    const existing = this.entries.get(providerId);
    if (!existing) {
      // If someone tries to set status without registration, treat as catalogue.
      this.entries.set(providerId, {
        providerId,
        dispatcher: undefined as never,
        status,
        capabilities: [],
      });
      return;
    }

    this.entries.set(providerId, { ...existing, status });
  }

  resolveAvailable(providerId: ProviderId): ExecutableProviderEntry | undefined {
    const entry = this.entries.get(providerId);
    if (!entry) return undefined;
    if (
      entry.status !== "available" &&
      entry.status !== "healthy" &&
      entry.status !== "executable"
    ) {
      return undefined;
    }
    // Catalogue providers are never executable.
    if (!entry.dispatcher) return undefined;
    return entry;
  }

  listAvailableProviderIds(): readonly ProviderId[] {
    const ids: ProviderId[] = [];
    for (const [providerId, entry] of this.entries.entries()) {
      if (this.resolveAvailable(providerId)) ids.push(providerId);
      // eslint-disable-next-line no-unused-vars
    }
    return ids;
  }
}

