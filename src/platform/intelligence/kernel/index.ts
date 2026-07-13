/**
 * Intelligence Kernel — platform lifecycle, DI, composition, health, registries.
 *
 * Public API:
 * - bootstrapIntelligencePlatform / shutdownIntelligencePlatform
 * - IPlatformKernel / PlatformKernel
 * - ServiceContainer, ModuleRegistry, LifecycleManager, HealthManager
 */

export * from "./interfaces";
export * from "./contracts";
export * from "./types";
export * from "./errors";
export * from "./constants";
export * from "./factories";
export * from "./metadata";
export * from "./di";
export * from "./composition";
export * from "./bootstrap";
export * from "./lifecycle";
export * from "./registry";
export * from "./health";
