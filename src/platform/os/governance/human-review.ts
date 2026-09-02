/**
 * Human review gate — formal pause/approve/reject (never auto-approves).
 */

export type HumanReviewDecision =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REQUEST_CHANGES";

export interface HumanReviewRecord {
  readonly reviewId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly taskId?: string;
  readonly outputRefId?: string;
  readonly reason: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly evaluationIds: readonly string[];
  readonly requestedAt: string;
  readonly status: HumanReviewDecision;
  readonly reviewer?: string;
  readonly decidedAt?: string;
  readonly comments?: string;
}

export interface HumanReviewListOptions {
  readonly organizationId?: string;
  readonly status?: HumanReviewDecision;
  readonly limit?: number;
}

export interface IHumanReviewStore {
  create(record: HumanReviewRecord): Promise<HumanReviewRecord>;
  get(
    reviewId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined>;
  getPendingForExecution(
    executionId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined>;
  list(options?: HumanReviewListOptions): Promise<readonly HumanReviewRecord[]>;
  decide(input: {
    readonly reviewId: string;
    readonly organizationId: string;
    readonly decision: Exclude<HumanReviewDecision, "PENDING">;
    readonly reviewer: string;
    readonly comments?: string;
    readonly nowIso?: () => string;
  }): Promise<HumanReviewRecord>;
}

export class InMemoryHumanReviewStore implements IHumanReviewStore {
  private readonly byId = new Map<string, HumanReviewRecord>();

  clear(): void {
    this.byId.clear();
  }

  async create(record: HumanReviewRecord): Promise<HumanReviewRecord> {
    // Idempotent: one pending review per execution
    const existing = [...this.byId.values()].find(
      (r) =>
        r.executionId === record.executionId &&
        r.organizationId === record.organizationId &&
        r.status === "PENDING" &&
        (record.taskId ? r.taskId === record.taskId : !r.taskId)
    );
    if (existing) return existing;
    this.byId.set(record.reviewId, record);
    return record;
  }

  async get(
    reviewId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined> {
    const r = this.byId.get(reviewId);
    if (!r || r.organizationId !== organizationId) return undefined;
    return r;
  }

  async getPendingForExecution(
    executionId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined> {
    return [...this.byId.values()].find(
      (r) =>
        r.executionId === executionId &&
        r.organizationId === organizationId &&
        r.status === "PENDING"
    );
  }

  async list(
    options: HumanReviewListOptions = {}
  ): Promise<readonly HumanReviewRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    let rows = [...this.byId.values()];
    if (options.organizationId) {
      rows = rows.filter((r) => r.organizationId === options.organizationId);
    }
    if (options.status) {
      rows = rows.filter((r) => r.status === options.status);
    }
    return rows
      .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
      .slice(0, limit);
  }

  async decide(input: {
    readonly reviewId: string;
    readonly organizationId: string;
    readonly decision: Exclude<HumanReviewDecision, "PENDING">;
    readonly reviewer: string;
    readonly comments?: string;
    readonly nowIso?: () => string;
  }): Promise<HumanReviewRecord> {
    const r = await this.get(input.reviewId, input.organizationId);
    if (!r) throw new Error("Human review not found");
    if (r.status !== "PENDING") return r; // idempotent
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const next: HumanReviewRecord = {
      ...r,
      status: input.decision,
      reviewer: input.reviewer,
      comments: input.comments,
      decidedAt: nowIso(),
    };
    this.byId.set(r.reviewId, next);
    return next;
  }
}
