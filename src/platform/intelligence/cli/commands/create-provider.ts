import { NotImplementedError } from "../../shared/errors";
import type { CliCommandDefinition, ICliCommand } from "../types/commands";

export class CreateProviderCommand implements ICliCommand {
  readonly definition: CliCommandDefinition = {
    name: "intelligence:create-provider",
    description: "Scaffold a new provider adapter module (not implemented in M0).",
    usage: "intelligence:create-provider --name <name>",
  };

  async execute(_args: readonly string[]): Promise<void> {
    throw new NotImplementedError(
      "intelligence:create-provider is reserved for a future milestone"
    );
  }
}
