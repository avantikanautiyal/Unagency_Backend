import { NotImplementedError } from "../../shared/errors";
import type { CliCommandDefinition, ICliCommand } from "../types/commands";

export class CreateCapabilityCommand implements ICliCommand {
  readonly definition: CliCommandDefinition = {
    name: "intelligence:create-capability",
    description: "Scaffold a new capability module (not implemented in M0).",
    usage: "intelligence:create-capability --name <name>",
  };

  async execute(_args: readonly string[]): Promise<void> {
    throw new NotImplementedError(
      "intelligence:create-capability is reserved for a future milestone"
    );
  }
}
