/**
 * Step 11 — Promotion governance (never auto-approves; explicit human action required).
 */

import type { ShadowDecision } from "../shadow/shadow-decision-contract";
import type {
  PromotionCandidate,
  PromotionCandidateLifecycle,
} from "./promotion-candidate-contract";
import type { IPromotionCandidateStore } from "./promotion-governance-store";
import { defaultPromotionCandidateStore } from "./promotion-governance-store";

export type PromotionGovernanceService = {
  registerFromShadowDecision(input: {
    readonly shadowDecision: ShadowDecision;
    readonly scope: { readonly service: string; readonly subtype?: string; readonly industry?: string };
    readonly createId: (prefix: string) => string;
    readonly nowIso: () => string;
  }): Promise<PromotionCandidate>;
  submitForReview(candidateId: string): Promise<PromotionCandidate>;
  approveCandidate(input: {
    readonly candidateId: string;
    readonly approvedBy: string;
    readonly nowIso: () => string;
    readonly expiresAt?: string;
  }): Promise<PromotionCandidate>;
  rejectCandidate(input: {
    readonly candidateId: string;
    readonly rejectedBy: string;
    readonly nowIso: () => string;
  }): Promise<PromotionCandidate>;
  getCandidate(candidateId: string): Promise<PromotionCandidate | undefined>;
  listCandidates(lifecycle?: PromotionCandidateLifecycle): Promise<readonly PromotionCandidate[]>;
  isApproved(candidateId: string, nowIso?: () => string): Promise<boolean>;
};

export function createPromotionGovernanceService(deps?: {
  readonly store?: IPromotionCandidateStore;
}): PromotionGovernanceService {
  const store = deps?.store ?? defaultPromotionCandidateStore;

  async function requireCandidate(candidateId: string): Promise<PromotionCandidate> {
    const c = await store.get(candidateId);
    if (!c) throw new Error(`Promotion candidate not found: ${candidateId}`);
    return c;
  }

  return Object.freeze({
    registerFromShadowDecision: async (input) => {
      const sd = input.shadowDecision;
      const candidate: PromotionCandidate = Object.freeze({
        candidateId: input.createId("promo"),
        candidateVersion: "1.0.0",
        lifecycle: "DRAFT",
        candidate: sd.recommended ?? sd.actual,
        scope: Object.freeze(input.scope),
        readinessStatus: sd.promotionReadiness,
        evidenceCount: sd.evidenceCount,
        validComparisonSamples: sd.validComparisonSamples,
        confidence: sd.confidenceTier,
        observedAdvantage: sd.observedAdvantage,
        shadowDecisionId: sd.shadowDecisionId,
        createdAt: input.nowIso(),
      });
      await store.save(candidate);
      return candidate;
    },

    submitForReview: async (candidateId) => {
      const c = await requireCandidate(candidateId);
      if (c.lifecycle !== "DRAFT") {
        throw new Error(`Candidate ${candidateId} must be DRAFT to submit for review`);
      }
      const updated: PromotionCandidate = Object.freeze({ ...c, lifecycle: "REVIEW" });
      await store.save(updated);
      return updated;
    },

    approveCandidate: async (input) => {
      const c = await requireCandidate(input.candidateId);
      if (c.lifecycle !== "REVIEW" && c.lifecycle !== "DRAFT") {
        throw new Error(`Candidate ${input.candidateId} must be REVIEW or DRAFT to approve`);
      }
      if (c.readinessStatus !== "READY_FOR_REVIEW" && c.validComparisonSamples < 2) {
        throw new Error(
          `Candidate ${input.candidateId} lacks sufficient promotion readiness for approval`,
        );
      }
      if (!input.approvedBy?.trim()) {
        throw new Error("Human approval requires approvedBy");
      }
      const updated: PromotionCandidate = Object.freeze({
        ...c,
        lifecycle: "APPROVED",
        approvedBy: input.approvedBy.trim(),
        approvedAt: input.nowIso(),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      });
      await store.save(updated);
      return updated;
    },

    rejectCandidate: async (input) => {
      const c = await requireCandidate(input.candidateId);
      const updated: PromotionCandidate = Object.freeze({
        ...c,
        lifecycle: "REJECTED",
        rejectedBy: input.rejectedBy.trim(),
        rejectedAt: input.nowIso(),
      });
      await store.save(updated);
      return updated;
    },

    getCandidate: (candidateId) => store.get(candidateId),

    listCandidates: (lifecycle) => store.query(lifecycle ? { lifecycle } : undefined),

    isApproved: async (candidateId, nowIso = () => new Date().toISOString()) => {
      const c = await store.get(candidateId);
      if (!c || c.lifecycle !== "APPROVED") return false;
      if (c.expiresAt && c.expiresAt < nowIso()) return false;
      return true;
    },
  });
}

export const defaultPromotionGovernanceService = createPromotionGovernanceService();
