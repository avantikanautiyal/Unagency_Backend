/**
 * Mongo-backed experience repository with synchronous interface.
 *
 * IExperienceRepository is synchronous (returns Result, not Promise).
 * To support durable storage, we:
 *  - keep an in-memory repository as the authoritative sync read-path
 *  - hydrate from Mongo in the background (best-effort)
 *  - persist new experiences to Mongo in the background (never blocks)
 */

import type { Result } from "../../shared/result";
import type { ExperienceSearchQuery, ExperienceSearchResult } from "../contracts/search";
import type { Experience } from "../contracts/experience";
import type { ExperienceSnapshot } from "../contracts/snapshot";
import type { IExperienceRepository } from "../interfaces/experience-intelligence";
import { success } from "../../shared/result";
import { InMemoryExperienceRepository } from "./in-memory-experience-repository";
import type { Document } from "mongoose";
import { EnterpriseExperience } from "../../../infrastructure/durability/mongo/models/enterprise-experience.model";

export interface MongoExperienceRepositoryDeps {
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class MongoExperienceRepository implements IExperienceRepository {
  private readonly memory: InMemoryExperienceRepository;
  private hydrationStarted = false;

  constructor(deps: MongoExperienceRepositoryDeps = {}) {
    this.memory = new InMemoryExperienceRepository(
      deps.nowIso,
      deps.createId
    );

    // Best-effort async hydration into in-memory store.
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
    if (this.hydrationStarted) return;
    this.hydrationStarted = true;
    try {
      const docs = await EnterpriseExperience.find({})
        .lean()
        .exec();
      const experiences: Experience[] = (docs as Array<
        Document & { experience?: Experience; experienceId?: string }
      >)
        .map((d) => d.experience)
        .filter(Boolean) as Experience[];
      if (experiences.length > 0) {
        // Synchronous in-memory saveMany.
        this.memory.saveMany(experiences);
      }
    } catch {
      // Non-fatal; repository will behave like a fresh empty in-memory store.
    }
  }

  save(experience: Experience): Result<Experience> {
    const res = this.memory.save(experience);
    // Persist best-effort; does not block.
    void EnterpriseExperience.updateOne(
      { experienceId: String(experience.experienceId) },
      {
        $set: {
          experience,
          organizationId: experience.organizationId,
          workspaceId: experience.workspaceId,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    ).catch(() => {});
    return res;
  }

  saveMany(experiences: readonly Experience[]): Result<readonly Experience[]> {
    const res = this.memory.saveMany(experiences);
    void Promise.all(
      experiences.map((experience) =>
        EnterpriseExperience.updateOne(
          { experienceId: String(experience.experienceId) },
          {
            $set: {
              experience,
              organizationId: experience.organizationId,
              workspaceId: experience.workspaceId,
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        ).catch(() => {})
      )
    ).catch(() => {});
    return res;
  }

  findById(id: string): Result<Experience | undefined> {
    return this.memory.findById(id);
  }

  findAll(): Result<readonly Experience[]> {
    return this.memory.findAll();
  }

  search(query: ExperienceSearchQuery): Result<ExperienceSearchResult> {
    return this.memory.search(query);
  }

  snapshot(): Result<ExperienceSnapshot> {
    return this.memory.snapshot();
  }

  count(): Result<number> {
    return this.memory.count();
  }
}

