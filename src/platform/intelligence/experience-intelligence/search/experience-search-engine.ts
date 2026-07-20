/**
 * Experience search engine.
 */

import { success, type Result } from "../../shared/result";
import type { ExperienceSearchQuery, ExperienceSearchResult } from "../contracts/search";
import type { IExperienceRepository, IExperienceSearchEngine } from "../interfaces/experience-intelligence";

export class DefaultExperienceSearchEngine implements IExperienceSearchEngine {
  search(repository: IExperienceRepository, query: ExperienceSearchQuery): Result<ExperienceSearchResult> {
    return repository.search(query);
  }
}
