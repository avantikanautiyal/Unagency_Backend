/**
 * Sync index of memory records → experiences for injection retriever.
 * Updated when MemoryIntelligenceEngine writes records.
 */

import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { MemoryRecord } from "../contracts/memory-models";
import { memoryRecordToExperience } from "./memory-record-to-experience";

const INDEX = new Map<string, Experience[]>();

function indexKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}|${workspaceId}`;
}

function upsertExperience(experience: Experience): void {
  const org = experience.organizationId ?? "";
  const ws = experience.workspaceId ?? "";
  if (!org || !ws) return;
  const key = indexKey(org, ws);
  const existing = INDEX.get(key) ?? [];
  const without = existing.filter(
    (exp) => String(exp.experienceId) !== String(experience.experienceId)
  );
  INDEX.set(key, [...without, experience]);
}

export function indexMemoryRecord(record: MemoryRecord): void {
  const experience = memoryRecordToExperience(record);
  if (!experience) return;
  upsertExperience(experience);
}

export function indexExperienceForInjection(experience: Experience): void {
  upsertExperience(experience);
}

export function listIndexedMemoryExperiences(input: {
  readonly organizationId?: string;
  readonly workspaceId?: string;
}): readonly Experience[] {
  if (!input.organizationId || !input.workspaceId) return [];
  return INDEX.get(indexKey(input.organizationId, input.workspaceId)) ?? [];
}

/** Test helper */
export function clearMemoryExperienceIndex(): void {
  INDEX.clear();
}
