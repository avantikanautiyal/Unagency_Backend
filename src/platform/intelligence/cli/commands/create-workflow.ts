import { NotImplementedError } from "../../shared/errors";
import type { CliCommandDefinition, ICliCommand } from "../types/commands";

export class CreateWorkflowCommand implements ICliCommand {
  readonly definition: CliCommandDefinition = {
    name: "intelligence:create-workflow",
    description: "Scaffold a new workflow module (not implemented in M0).",
    usage: "intelligence:create-workflow --name <name>",
  };

  async execute(_args: readonly string[]): Promise<void> {
    throw new NotImplementedError(
      "intelligence:create-workflow is reserved for a future milestone"
    );
  }
}
