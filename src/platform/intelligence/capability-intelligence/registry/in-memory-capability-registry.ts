/**
 * In-memory capability registry with discovery search.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityDiscoveryHints } from "../contracts/request";
import type { ICapabilityRegistry } from "../interfaces/capability-intelligence";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1);
}

export class InMemoryCapabilityRegistry implements ICapabilityRegistry {
  private readonly byId = new Map<string, CapabilityDefinitionRecord>();

  constructor(seed: readonly CapabilityDefinitionRecord[] = []) {
    for (const def of seed) {
      this.byId.set(def.capabilityId, def);
    }
  }

  register(def: CapabilityDefinitionRecord): Result<CapabilityDefinitionRecord> {
    this.byId.set(def.capabilityId, def);
    return success(def);
  }

  get(capabilityId: string): Result<CapabilityDefinitionRecord | undefined> {
    return success(this.byId.get(capabilityId));
  }

  list(): Result<readonly CapabilityDefinitionRecord[]> {
    return success([...this.byId.values()]);
  }

  search(
    hints: CapabilityDiscoveryHints,
    objective: string
  ): Result<readonly CapabilityDefinitionRecord[]> {
    const tokens = new Set([
      ...tokenize(objective),
      ...(hints.keywords ?? []).flatMap(tokenize),
      ...(hints.taskHints ?? []).flatMap(tokenize),
      ...(hints.workflowHints ?? []).flatMap(tokenize),
      ...(hints.industry ? tokenize(hints.industry) : []),
    ]);

    const scored = [...this.byId.values()]
      .map((cap) => ({ cap, score: scoreCapability(cap, hints, tokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.cap);

    return success(scored);
  }
}

function scoreCapability(
  cap: CapabilityDefinitionRecord,
  hints: CapabilityDiscoveryHints,
  tokens: Set<string>
): number {
  let score = 0;

  if (hints.department && cap.department === hints.department) score += 5;
  if (hints.complexity && cap.complexity === hints.complexity) score += 2;
  if (hints.industry && cap.industryTags.some((t) => t.toLowerCase() === hints.industry!.toLowerCase())) {
    score += 3;
  }

  if (hints.providerSupport?.length) {
    const hit = hints.providerSupport.some((p) =>
      cap.supportedProviders.map((x) => x.toLowerCase()).includes(p.toLowerCase())
    );
    // Empty supportedProviders means provider-agnostic — still eligible.
    if (cap.supportedProviders.length === 0 || hit) score += 1;
  }

  if (hints.modelSupport?.length) {
    const hit = hints.modelSupport.some((m) =>
      cap.supportedModels.map((x) => x.toLowerCase()).includes(m.toLowerCase())
    );
    if (cap.supportedModels.length === 0 || hit) score += 1;
  }

  const haystack = [
    cap.capabilityId,
    cap.name,
    cap.description,
    ...cap.keywords,
    ...cap.industryTags,
    cap.department,
    cap.category,
  ]
    .join(" ")
    .toLowerCase();

  for (const t of tokens) {
    if (haystack.includes(t)) score += 2;
    if (cap.capabilityId.includes(t)) score += 3;
  }

  // Soft bias toward mature capabilities when ties exist later.
  if (cap.maturity === "enterprise" || cap.maturity === "stable") score += 0.5;
  if (cap.maturity === "deprecated") score -= 5;

  return score;
}
