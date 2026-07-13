/**
 * Platform registry ports.
 *
 * Purpose: Register intelligence platform components by descriptor.
 * Responsibilities: Module and future capability/provider/workflow/agent/plugin registries.
 * Usage: Kernel owns registries; modules register during bootstrap.
 * Future Extension: Persistent registries, tenant scoping.
 */

import type { Result } from "../../../shared/result";
import type {
  AgentDescriptor,
  CapabilityDescriptor,
  ModuleDescriptor,
  PluginDescriptor,
  ProviderDescriptor,
  WorkflowDescriptor,
} from "../contracts/descriptors";

/**
 * Generic registry port.
 *
 * Purpose: CRUD for typed descriptors.
 * Responsibilities: register, get, has, list, unregister.
 * Usage: Implemented by in-memory registries in M1.1.
 * Future Extension: Async persistence adapters.
 */
export interface IRegistry<TId, TDescriptor> {
  register(descriptor: TDescriptor): Result<void>;
  get(id: TId): Result<TDescriptor>;
  has(id: TId): boolean;
  list(): readonly TDescriptor[];
  unregister(id: TId): Result<void>;
}

/**
 * Module registry port.
 *
 * Purpose: Track intelligence modules registered with the kernel.
 * Responsibilities: register, unregister, has, resolve, list, validate, clear.
 * Usage: PlatformKernel.registerModule delegates here.
 * Future Extension: Module dependency graph visualization.
 */
export interface IModuleRegistry extends IRegistry<string, ModuleDescriptor> {
  resolve(id: string): Result<ModuleDescriptor>;
  validate(): Result<ModuleValidationReport>;
  clear(): void;
}

export interface ModuleValidationIssue {
  readonly moduleId: string;
  readonly message: string;
}

export interface ModuleValidationReport {
  readonly valid: boolean;
  readonly issues: readonly ModuleValidationIssue[];
}

export type ICapabilityRegistry = IRegistry<string, CapabilityDescriptor>;
export type IProviderRegistry = IRegistry<string, ProviderDescriptor>;
export type IWorkflowRegistry = IRegistry<string, WorkflowDescriptor>;
export type IAgentRegistry = IRegistry<string, AgentDescriptor>;
export type IPluginRegistry = IRegistry<string, PluginDescriptor>;

export interface IPlatformRegistries {
  readonly modules: IModuleRegistry;
  readonly capabilities: ICapabilityRegistry;
  readonly providers: IProviderRegistry;
  readonly workflows: IWorkflowRegistry;
  readonly agents: IAgentRegistry;
  readonly plugins: IPluginRegistry;
}
