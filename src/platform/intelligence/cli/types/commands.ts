/**
 * CLI command contracts. Scaffolding only — no implementations.
 */

export type IntelligenceCliCommandName =
  | "intelligence:create-provider"
  | "intelligence:create-capability"
  | "intelligence:create-agent"
  | "intelligence:create-workflow"
  | "intelligence:create-plugin";

export interface CliCommandDefinition {
  readonly name: IntelligenceCliCommandName;
  readonly description: string;
  readonly usage: string;
}

export interface ICliCommand {
  readonly definition: CliCommandDefinition;
  /**
   * Reserved for future implementation.
   * M0 commands must not perform side effects.
   */
  execute(args: readonly string[]): Promise<void>;
}
