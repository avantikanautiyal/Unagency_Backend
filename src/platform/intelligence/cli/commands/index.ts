import type { ICliCommand } from "../types/commands";
import { CreateAgentCommand } from "./create-agent";
import { CreateCapabilityCommand } from "./create-capability";
import { CreatePluginCommand } from "./create-plugin";
import { CreateProviderCommand } from "./create-provider";
import { CreateWorkflowCommand } from "./create-workflow";

export * from "./create-provider";
export * from "./create-capability";
export * from "./create-agent";
export * from "./create-workflow";
export * from "./create-plugin";

export const intelligenceCliCommands: readonly ICliCommand[] = [
  new CreateProviderCommand(),
  new CreateCapabilityCommand(),
  new CreateAgentCommand(),
  new CreateWorkflowCommand(),
  new CreatePluginCommand(),
];

export function listIntelligenceCliCommands(): readonly ICliCommand[] {
  return intelligenceCliCommands;
}
