/**
 * Aggregate platform registries.
 *
 * Purpose: Group all kernel-owned registries behind one façade.
 * Responsibilities: Expose module/capability/provider/workflow/agent/plugin registries.
 * Usage: Constructed by CompositionRoot.
 * Future Extension: Lazy registry creation.
 */

import type {
  AgentDescriptor,
  CapabilityDescriptor,
  PluginDescriptor,
  ProviderDescriptor,
  WorkflowDescriptor,
} from "../contracts/descriptors";
import type {
  IAgentRegistry,
  ICapabilityRegistry,
  IModuleRegistry,
  IPlatformRegistries,
  IPluginRegistry,
  IProviderRegistry,
  IWorkflowRegistry,
} from "../interfaces/registries";
import { InMemoryRegistry } from "./in-memory-registry";
import { ModuleRegistry } from "./module-registry";

export class PlatformRegistries implements IPlatformRegistries {
  readonly modules: IModuleRegistry;
  readonly capabilities: ICapabilityRegistry;
  readonly providers: IProviderRegistry;
  readonly workflows: IWorkflowRegistry;
  readonly agents: IAgentRegistry;
  readonly plugins: IPluginRegistry;

  constructor(modules: IModuleRegistry = new ModuleRegistry()) {
    this.modules = modules;
    this.capabilities = new InMemoryRegistry<CapabilityDescriptor>("capability");
    this.providers = new InMemoryRegistry<ProviderDescriptor>("provider");
    this.workflows = new InMemoryRegistry<WorkflowDescriptor>("workflow");
    this.agents = new InMemoryRegistry<AgentDescriptor>("agent");
    this.plugins = new InMemoryRegistry<PluginDescriptor>("plugin");
  }
}
