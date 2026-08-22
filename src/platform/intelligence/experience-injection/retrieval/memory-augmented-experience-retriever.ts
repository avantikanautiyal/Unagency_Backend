/**
 * Augments experience retrieval with indexed Memory Intelligence records.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { IExperienceRepository } from "../../experience-intelligence/interfaces/experience-intelligence";
import type { ExperienceInjectionContext } from "../contracts/request";
import type { IExperienceRetriever } from "../interfaces/experience-injection";
import { DefaultExperienceRetriever } from "./experience-retriever";
import { listIndexedMemoryExperiences } from "./sync-memory-experience-index";

export class MemoryAugmentedExperienceRetriever implements IExperienceRetriever {
  private readonly base = new DefaultExperienceRetriever();

  retrieve(
    repository: IExperienceRepository,
    context: ExperienceInjectionContext
  ): Result<readonly Experience[]> {
    const base = this.base.retrieve(repository, context);
    if (!base.ok) return base;

    const fromMemory = listIndexedMemoryExperiences({
      organizationId: context.organizationId
        ? String(context.organizationId)
        : undefined,
      workspaceId: context.workspaceId ? String(context.workspaceId) : undefined,
    });

    if (!fromMemory.length) return base;

    const merged = new Map<string, Experience>();
    for (const exp of base.value) {
      merged.set(String(exp.experienceId), exp);
    }
    for (const exp of fromMemory) {
      merged.set(String(exp.experienceId), exp);
    }
    return success([...merged.values()]);
  }
}
