import { NotImplementedError } from "../../shared/errors";
import type { CliCommandDefinition, ICliCommand } from "../types/commands";

export class CreateAgentCommand implements ICliCommand {
  readonly definition: CliCommandDefinition = {
    name: "intelligence:create-agent",
    description: "Scaffold a new agent module (not implemented in M0).",
    usage: "intelligence:create-agent --name <name>",
  };

  async execute(_args: readonly string[]): Promise<void> {
    throw new NotImplementedError(
      "intelligence:create-agent is reserved for a future milestone"
    );
  }
}
