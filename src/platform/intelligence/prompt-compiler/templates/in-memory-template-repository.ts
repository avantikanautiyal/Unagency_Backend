/**
 * In-memory prompt template repository.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptTemplate } from "../contracts/prompt-models";
import { PromptTemplateNotFoundError } from "../errors";
import type { IPromptTemplateRepository } from "../interfaces/prompt-ports";

export class InMemoryPromptTemplateRepository
  implements IPromptTemplateRepository
{
  private readonly templates = new Map<string, PromptTemplate>();

  constructor(seed: readonly PromptTemplate[] = defaultTemplates()) {
    for (const template of seed) {
      this.templates.set(keyOf(template.id, template.version), template);
    }
  }

  async get(
    templateId: string,
    version?: string
  ): Promise<Result<PromptTemplate>> {
    if (version) {
      const found = this.templates.get(keyOf(templateId, version));
      if (!found) {
        return failure(
          new PromptTemplateNotFoundError("Prompt template not found", {
            templateId,
            version,
          })
        );
      }
      return success(found);
    }

    const versions = [...this.templates.values()]
      .filter((t) => t.id === templateId && t.isActive)
      .sort((a, b) => b.version.localeCompare(a.version));

    const latest = versions[0];
    if (!latest) {
      return failure(
        new PromptTemplateNotFoundError("Prompt template not found", {
          templateId,
        })
      );
    }
    return success(latest);
  }

  async list(templateId?: string): Promise<Result<readonly PromptTemplate[]>> {
    const all = [...this.templates.values()];
    return success(
      templateId ? all.filter((t) => t.id === templateId) : all
    );
  }
}

function keyOf(id: string, version: string): string {
  return `${id}@${version}`;
}

export function defaultTemplates(): readonly PromptTemplate[] {
  return [
    {
      id: "default.capability",
      version: "1.0.0",
      name: "Default Capability Template",
      body: [
        "SYSTEM: You are an assistant for {{platform.name}}.",
        "IDENTITY: org={{identity.organizationId}} workspace={{identity.workspaceId}}",
        "BRAND: voice={{brand.voice}} tone={{brand.tone}}",
        "CAPABILITY: {{capability.id}} ({{capability.name}})",
        "KNOWLEDGE:",
        "{{knowledge.summary}}",
        "INSTRUCTIONS: Follow brand and security policies.",
        "USER: {{user.input}}",
        "OUTPUT: Respond according to capability requirements.",
      ].join("\n"),
      variables: [
        { name: "platform.name", path: "platform.platformName", required: true },
        {
          name: "identity.organizationId",
          path: "identity.organizationId",
          required: true,
        },
        {
          name: "identity.workspaceId",
          path: "identity.workspaceId",
          required: true,
        },
        { name: "brand.voice", path: "brand.voice", required: false, defaultValue: "neutral" },
        { name: "brand.tone", path: "brand.tone", required: false, defaultValue: "professional" },
        { name: "capability.id", path: "capability.capabilityId", required: true },
        { name: "capability.name", path: "capability.name", required: false, defaultValue: "" },
        { name: "knowledge.summary", path: "knowledge.summary", required: false, defaultValue: "" },
        { name: "user.input", path: "execution.inputHints", required: false, defaultValue: "" },
      ],
      constraints: [
        { id: "c1", kind: "required_section", value: "system" },
        { id: "c2", kind: "required_variable", value: "capability.id" },
        { id: "c3", kind: "max_sections", value: 20 },
      ],
      sections: [
        "system",
        "identity",
        "brand",
        "capability",
        "knowledge",
        "instructions",
        "user",
        "output",
      ],
      isActive: true,
    },
  ];
}
