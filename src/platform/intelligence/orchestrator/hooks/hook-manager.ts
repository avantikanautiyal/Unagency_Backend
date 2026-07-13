/**
 * Hook manager for orchestration lifecycle events.
 */

import type {
  IHookManager,
  OrchestrationHookHandler,
  OrchestrationHookName,
  OrchestrationHookPayload,
} from "./hooks";

export class HookManager implements IHookManager {
  private readonly handlers = new Map<
    OrchestrationHookName,
    OrchestrationHookHandler[]
  >();

  register(name: OrchestrationHookName, handler: OrchestrationHookHandler): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
  }

  async emit(
    name: OrchestrationHookName,
    payload: OrchestrationHookPayload
  ): Promise<void> {
    const list = this.handlers.get(name) ?? [];
    for (const handler of list) {
      await handler(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
