/**
 * In-memory experience repository.
 */

import { success, failure, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import { asExperienceSnapshotId } from "../contracts/identifiers";
import type { Experience } from "../contracts/experience";
import type { ExperienceSnapshot } from "../contracts/snapshot";
import type { ExperienceSearchQuery, ExperienceSearchResult } from "../contracts/search";
import type { IExperienceRepository } from "../interfaces/experience-intelligence";
import { EXPERIENCE_INTELLIGENCE_VERSION } from "../constants";

export class InMemoryExperienceRepository implements IExperienceRepository {
  private readonly store = new Map<string, Experience>();
  private readonly relationships = new Map<string, readonly string[]>();

  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) => `${p}_${Date.now()}`
  ) {}

  save(experience: Experience): Result<Experience> {
    this.store.set(String(experience.experienceId), experience);
    return success(experience);
  }

  saveMany(experiences: readonly Experience[]): Result<readonly Experience[]> {
    for (const exp of experiences) {
      this.store.set(String(exp.experienceId), exp);
    }
    return success(experiences);
  }

  findById(id: string): Result<Experience | undefined> {
    return success(this.store.get(id));
  }

  findAll(): Result<readonly Experience[]> {
    return success([...this.store.values()]);
  }

  search(query: ExperienceSearchQuery): Result<ExperienceSearchResult> {
    let matches = [...this.store.values()];

    if (query.capabilityId) {
      matches = matches.filter((e) => e.capabilityId === query.capabilityId);
    }
    if (query.department) {
      matches = matches.filter((e) => e.department === query.department);
    }
    if (query.workflowId) {
      matches = matches.filter((e) => e.workflowId === query.workflowId);
    }
    if (query.providerId) {
      matches = matches.filter((e) => e.providerId === query.providerId);
    }
    if (query.modelId) {
      matches = matches.filter((e) => e.modelId === query.modelId);
    }
    if (query.taskType) {
      matches = matches.filter((e) => e.taskType === query.taskType);
    }
    if (query.language) {
      matches = matches.filter((e) => e.language === query.language);
    }
    if (query.organizationId) {
      matches = matches.filter((e) => e.organizationId === query.organizationId);
    }
    if (query.workspaceId) {
      matches = matches.filter((e) => e.workspaceId === query.workspaceId);
    }
    if (query.promptTemplateId) {
      matches = matches.filter((e) => e.promptTemplateId === query.promptTemplateId);
    }
    if (query.category) {
      matches = matches.filter((e) => e.category === query.category);
    }
    if (query.correctionKind) {
      matches = matches.filter((e) => e.correctionStrategy.kind === query.correctionKind);
    }
    if (query.similarTo) {
      const ref = this.store.get(query.similarTo);
      if (ref) {
        matches = matches.filter(
          (e) =>
            e.category === ref.category ||
            e.rootCause.kind === ref.rootCause.kind ||
            e.taskType === ref.taskType
        );
      }
    }

    const limit = query.limit ?? 50;
    const limited = matches.slice(0, limit);

    return success({
      queryId: query.queryId,
      experiences: limited,
      totalMatches: matches.length,
      searchedAt: this.nowIso(),
    });
  }

  snapshot(): Result<ExperienceSnapshot> {
    const experiences = [...this.store.values()];
    return success({
      snapshotId: asExperienceSnapshotId(this.createId("snap")),
      experiences,
      experienceCount: experiences.length,
      capturedAt: this.nowIso(),
      version: EXPERIENCE_INTELLIGENCE_VERSION,
    });
  }

  count(): Result<number> {
    return success(this.store.size);
  }

  link(sourceId: string, relatedIds: readonly string[]): Result<void> {
    if (!this.store.has(sourceId)) {
      return failure(new NotFoundError(`experience ${sourceId} not found`));
    }
    this.relationships.set(sourceId, relatedIds);
    return success(undefined);
  }
}
