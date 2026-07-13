import { NotImplementedError } from "../../shared/errors";
import type { CliCommandDefinition, ICliCommand } from "../types/commands";

export class CreatePluginCommand implements ICliCommand {
  readonly definition: CliCommandDefinition = {
    name: "intelligence:create-plugin",
    description: "Scaffold a new plugin module (not implemented in M0).",
    usage: "intelligence:create-plugin --name <name>",
  };

  async execute(_args: readonly string[]): Promise<void> {
    throw new NotImplementedError(
      "intelligence:create-plugin is reserved for a future milestone"
    );
  }
}
