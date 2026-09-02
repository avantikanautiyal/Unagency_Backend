/**
 * Distributed Execution Platform — enterprise job infrastructure.
 * Consumes Intelligence Integration Layer; does not own Intelligence.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { DistributedExecutionEngine } from "./engine/distributed-execution-engine";
export { InMemoryJobStore } from "./persistence/in-memory-job-store";
export { QueueRegistry } from "./queues/queue-registry";
export {
  StubJobExecutor,
  IntegrationLayerJobExecutor,
} from "./workers/job-executors";
export { EnqueueJobInputBuilder } from "./builders/enqueue-job-input-builder";
export {
  createDistributedExecutionPlatform,
  type DistributedExecutionPlatform,
  type CreateDistributedExecutionOptions,
} from "./factories/create-distributed-execution-platform";
