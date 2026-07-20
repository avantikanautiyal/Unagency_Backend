/**
 * Experience retriever — queries ExperienceRepository by context dimensions.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { IExperienceRepository } from "../../experience-intelligence/interfaces/experience-intelligence";
import type { ExperienceInjectionContext } from "../contracts/request";
import type { IExperienceRetriever } from "../interfaces/experience-injection";

export class DefaultExperienceRetriever implements IExperienceRetriever {
  retrieve(
    repository: IExperienceRepository,
    context: ExperienceInjectionContext
  ): Result<readonly Experience[]> {
    // Broad retrieval: get all, then filter — search is compositional
    const all = repository.findAll();
    if (!all.ok) return all;

    const capabilityFiltered = context.capabilityId
      ? all.value.filter(
          (e) =>
            !e.capabilityId ||
            e.capabilityId === String(context.capabilityId) ||
            e.applicableConditions.capabilityId === context.capabilityId
        )
      : all.value;

    // Prefer non-archived / non-deprecated
    const active = capabilityFiltered.filter(
      (e) => e.lifecycle !== "archived" && e.lifecycle !== "deprecated"
    );

    return success(active.length > 0 ? active : capabilityFiltered);
  }
}
