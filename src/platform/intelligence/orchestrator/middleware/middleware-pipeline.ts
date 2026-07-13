/**
 * Middleware pipeline.
 *
 * Purpose: Compose orchestration middleware in order.
 * Responsibilities: Onion-model invoke chain.
 * Usage: IntelligenceOrchestrator wraps dispatch with this pipeline.
 * Future Extension: Conditional middleware, priorities.
 */

import type { Result } from "../../shared/result";
import type { OrchestratorContext } from "../contracts/orchestrator-context";
import type { OrchestrationResult } from "../contracts/orchestration-result";
import type {
  IMiddlewarePipeline,
  IOrchestrationMiddleware,
  MiddlewareNext,
} from "./middleware";

export class MiddlewarePipeline implements IMiddlewarePipeline {
  private readonly middlewares: IOrchestrationMiddleware[] = [];

  use(middleware: IOrchestrationMiddleware): void {
    this.middlewares.push(middleware);
  }

  async execute(
    context: OrchestratorContext,
    terminal: MiddlewareNext
  ): Promise<Result<OrchestrationResult>> {
    let index = -1;

    const dispatch = async (i: number): Promise<Result<OrchestrationResult>> => {
      if (i <= index) {
        throw new Error("Middleware next() called multiple times");
      }
      index = i;
      const middleware = this.middlewares[i];
      if (!middleware) {
        return terminal();
      }
      return middleware.invoke(context, () => dispatch(i + 1));
    };

    return dispatch(0);
  }
}
