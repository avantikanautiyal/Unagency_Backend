/**
 * Server-authoritative tool registry. Models cannot register tools.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ToolDefinition } from "../contracts/tool-contracts";
import { validateSchemaDocument } from "../schema/json-schema-validator";

export type ToolHandler = (input: {
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly executionId: string;
  readonly invocationKey: string;
}) => Promise<unknown> | unknown;

export interface RegisteredTool {
  readonly definition: ToolDefinition;
  readonly handler: ToolHandler;
}

export interface IToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): Result<true>;
  resolve(name: string): RegisteredTool | undefined;
  listDefinitions(): readonly ToolDefinition[];
  size(): number;
}

export class InMemoryToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, handler: ToolHandler): Result<true> {
    const name = definition.name?.trim();
    if (!name || !/^[a-zA-Z][a-zA-Z0-9_\-]{0,63}$/.test(name)) {
      return failure(new ValidationError("Invalid tool name"));
    }
    const schemaOk = validateSchemaDocument(definition.inputSchema);
    if (!schemaOk.ok) return schemaOk;
    if (this.tools.has(name)) {
      return failure(new ValidationError(`Tool '${name}' already registered`));
    }
    this.tools.set(
      name,
      Object.freeze({
        definition: Object.freeze({ ...definition, name }),
        handler,
      })
    );
    return success(true);
  }

  resolve(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  listDefinitions(): readonly ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  size(): number {
    return this.tools.size;
  }
}
