/**
 * Prompt version registry — in-memory placeholder.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { PromptVersion } from "../contracts/prompt-models";
import { PromptTemplateNotFoundError } from "../errors";
import type { IPromptVersionRegistry } from "../interfaces/prompt-ports";
import type { IPromptTemplateRepository } from "../interfaces/prompt-ports";

export class PromptVersionRegistry implements IPromptVersionRegistry {
  constructor(private readonly templates: IPromptTemplateRepository) {}

  async get(
    templateId: string,
    version?: string
  ): Promise<Result<PromptVersion>> {
    const template = await this.templates.get(templateId, version);
    if (!template.ok) {
      return template;
    }
    return success({
      templateId: template.value.id,
      version: template.value.version,
      createdAt: "2026-01-01T00:00:00.000Z",
      isStable: true,
    });
  }

  async list(templateId: string): Promise<Result<readonly PromptVersion[]>> {
    const listed = await this.templates.list(templateId);
    if (!listed.ok) {
      return listed;
    }
    return success(
      listed.value.map((template) => ({
        templateId: template.id,
        version: template.version,
        createdAt: "2026-01-01T00:00:00.000Z",
        isStable: template.isActive,
      }))
    );
  }

  async latest(templateId: string): Promise<Result<PromptVersion>> {
    const result = await this.get(templateId);
    if (!result.ok) {
      return failure(
        new PromptTemplateNotFoundError("No versions for template", {
          templateId,
        })
      );
    }
    return result;
  }
}
