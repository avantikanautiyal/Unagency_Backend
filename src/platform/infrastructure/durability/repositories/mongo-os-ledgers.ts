/**
 * Phase 8 — Mongo-backed OS ledgers (evaluation, governance, review, refinement, artifacts, delivery).
 * Domain → Port → Repository. OS engines never import mongoose directly.
 */

import { Schema, model } from "mongoose";
import type { IEvaluationLedger, EvaluationLedgerRecord } from "../../../os/evaluation/persistence/evaluation-ledger";
import type { IGovernanceDecisionStore } from "../../../os/governance/persistence/governance-decision-store";
import type { OsGovernanceDecision } from "../../../os/governance/governance-engine";
import type {
  HumanReviewRecord,
  IHumanReviewStore,
} from "../../../os/governance/human-review";
import {
  InMemoryFeedbackSessionStore,
} from "../../../os/refinement/engine/feedback-session-engine";
import { InMemoryRefinementStore } from "../../../os/refinement/engine/refinement-engine";
import type { FeedbackSession } from "../../../os/refinement/contracts/feedback-session";
import type { RefinementRequest } from "../../../os/refinement/contracts/refinement-request";
import type { RefinementSpecification } from "../../../os/refinement/contracts/refinement-specification";
import type {
  OsArtifactManifest,
  OsArtifactVersion,
} from "../../../os/delivery/contracts/artifact-version";
import { InMemoryArtifactVersionStore } from "../../../os/delivery/artifact/artifact-version-store";
import type { IDeliveryReceiptStore } from "../../../os/delivery/persistence/delivery-receipt-store";
import type { DeliveryReceipt } from "../../../os/delivery/contracts/delivery";

const Mixed = Schema.Types.Mixed;

const evaluationSchema = new Schema(
  {
    recordId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    record: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_evaluations" }
);
export const EnterpriseOsEvaluation = model("EnterpriseOsEvaluation", evaluationSchema);

const governanceSchema = new Schema(
  {
    decisionId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    decision: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_governance_decisions" }
);
export const EnterpriseOsGovernance = model("EnterpriseOsGovernance", governanceSchema);

const reviewSchema = new Schema(
  {
    reviewId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    record: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_human_reviews" }
);
export const EnterpriseOsHumanReview = model("EnterpriseOsHumanReview", reviewSchema);

const refinementSchema = new Schema(
  {
    refinementId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    request: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_refinements" }
);
export const EnterpriseOsRefinement = model("EnterpriseOsRefinement", refinementSchema);

const specSchema = new Schema(
  {
    specificationId: { type: String, required: true, unique: true },
    refinementId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    spec: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_refinement_specs" }
);
export const EnterpriseOsRefinementSpec = model(
  "EnterpriseOsRefinementSpec",
  specSchema
);

const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    refinementId: { type: String, required: true, index: true },
    session: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_feedback_sessions" }
);
export const EnterpriseOsFeedbackSession = model(
  "EnterpriseOsFeedbackSession",
  sessionSchema
);

const artifactVersionSchema = new Schema(
  {
    artifactId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    organizationId: { type: String, required: true, index: true },
    record: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_artifact_versions" }
);
artifactVersionSchema.index(
  { artifactId: 1, version: 1, organizationId: 1 },
  { unique: true }
);
export const EnterpriseOsArtifactVersion = model(
  "EnterpriseOsArtifactVersion",
  artifactVersionSchema
);

const manifestSchema = new Schema(
  {
    manifestId: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    record: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_artifact_manifests" }
);
export const EnterpriseOsArtifactManifest = model(
  "EnterpriseOsArtifactManifest",
  manifestSchema
);

const deliverySchema = new Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    organizationId: { type: String, required: true, index: true },
    receipt: { type: Mixed, required: true },
  },
  { collection: "enterprise_os_deliveries" }
);
export const EnterpriseOsDelivery = model("EnterpriseOsDelivery", deliverySchema);

export class MongoEvaluationLedger implements IEvaluationLedger {
  async append(record: EvaluationLedgerRecord): Promise<EvaluationLedgerRecord> {
    const existing = await EnterpriseOsEvaluation.findOne({
      recordId: record.recordId,
      organizationId: record.organizationId,
    }).lean();
    if (existing) return existing.record as EvaluationLedgerRecord;
    await EnterpriseOsEvaluation.updateOne(
      { recordId: record.recordId },
      {
        $setOnInsert: {
          recordId: record.recordId,
          organizationId: record.organizationId,
          executionId: record.executionId,
          record,
        },
      },
      { upsert: true }
    );
    return record;
  }

  async get(
    recordId: string,
    organizationId: string
  ): Promise<EvaluationLedgerRecord | undefined> {
    const doc = await EnterpriseOsEvaluation.findOne({
      recordId,
      organizationId,
    }).lean();
    return doc ? (doc.record as EvaluationLedgerRecord) : undefined;
  }

  async listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly EvaluationLedgerRecord[]> {
    const docs = await EnterpriseOsEvaluation.find({
      executionId,
      organizationId,
    }).lean();
    return docs.map((d) => d.record as EvaluationLedgerRecord);
  }
}

export class MongoGovernanceDecisionStore implements IGovernanceDecisionStore {
  async append(decision: OsGovernanceDecision): Promise<OsGovernanceDecision> {
    const existing = await EnterpriseOsGovernance.findOne({
      decisionId: decision.decisionId,
      organizationId: decision.organizationId,
    }).lean();
    if (existing) return existing.decision as OsGovernanceDecision;
    await EnterpriseOsGovernance.updateOne(
      { decisionId: decision.decisionId },
      {
        $setOnInsert: {
          decisionId: decision.decisionId,
          organizationId: decision.organizationId,
          executionId: decision.executionId,
          decision,
        },
      },
      { upsert: true }
    );
    return decision;
  }

  async get(
    decisionId: string,
    organizationId: string
  ): Promise<OsGovernanceDecision | undefined> {
    const doc = await EnterpriseOsGovernance.findOne({
      decisionId,
      organizationId,
    }).lean();
    return doc ? (doc.decision as OsGovernanceDecision) : undefined;
  }

  async listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly OsGovernanceDecision[]> {
    const docs = await EnterpriseOsGovernance.find({
      executionId,
      organizationId,
    }).lean();
    return docs.map((d) => d.decision as OsGovernanceDecision);
  }
}

export class MongoHumanReviewStore implements IHumanReviewStore {
  async create(record: HumanReviewRecord): Promise<HumanReviewRecord> {
    const pending = await EnterpriseOsHumanReview.findOne({
      executionId: record.executionId,
      organizationId: record.organizationId,
      status: "PENDING",
      ...(record.taskId
        ? { "record.taskId": record.taskId }
        : { "record.taskId": { $exists: false } }),
    }).lean();
    if (pending) return pending.record as HumanReviewRecord;
    await EnterpriseOsHumanReview.updateOne(
      { reviewId: record.reviewId },
      {
        $setOnInsert: {
          reviewId: record.reviewId,
          organizationId: record.organizationId,
          executionId: record.executionId,
          status: record.status,
          record,
        },
      },
      { upsert: true }
    );
    return record;
  }

  async get(
    reviewId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined> {
    const doc = await EnterpriseOsHumanReview.findOne({
      reviewId,
      organizationId,
    }).lean();
    return doc ? (doc.record as HumanReviewRecord) : undefined;
  }

  async getPendingForExecution(
    executionId: string,
    organizationId: string
  ): Promise<HumanReviewRecord | undefined> {
    const doc = await EnterpriseOsHumanReview.findOne({
      executionId,
      organizationId,
      status: "PENDING",
    }).lean();
    return doc ? (doc.record as HumanReviewRecord) : undefined;
  }

  async list(options: {
    readonly organizationId?: string;
    readonly status?: HumanReviewRecord["status"];
    readonly limit?: number;
  } = {}): Promise<readonly HumanReviewRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const filter: Record<string, unknown> = {};
    if (options.organizationId) filter.organizationId = options.organizationId;
    if (options.status) filter.status = options.status;
    const docs = await EnterpriseOsHumanReview.find(filter)
      .sort({ "record.requestedAt": -1 })
      .limit(limit)
      .lean();
    return docs.map((doc) => doc.record as HumanReviewRecord);
  }

  async decide(input: {
    readonly reviewId: string;
    readonly organizationId: string;
    readonly decision: Exclude<HumanReviewRecord["status"], "PENDING">;
    readonly reviewer: string;
    readonly comments?: string;
    readonly nowIso?: () => string;
  }): Promise<HumanReviewRecord> {
    const current = await this.get(input.reviewId, input.organizationId);
    if (!current) throw new Error("Human review not found");
    if (current.status !== "PENDING") return current;
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const next: HumanReviewRecord = {
      ...current,
      status: input.decision,
      reviewer: input.reviewer,
      comments: input.comments,
      decidedAt: nowIso(),
    };
    await EnterpriseOsHumanReview.updateOne(
      { reviewId: input.reviewId, organizationId: input.organizationId, status: "PENDING" },
      { $set: { status: next.status, record: next } }
    );
    return next;
  }
}

export class MongoFeedbackSessionStore extends InMemoryFeedbackSessionStore {
  override async save(session: FeedbackSession): Promise<FeedbackSession> {
    await super.save(session);
    await EnterpriseOsFeedbackSession.updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          sessionId: session.sessionId,
          organizationId: session.organizationId,
          refinementId: session.refinementId,
          session,
        },
      },
      { upsert: true }
    );
    return session;
  }

  override async get(
    sessionId: string,
    organizationId: string
  ): Promise<FeedbackSession | undefined> {
    const mem = await super.get(sessionId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsFeedbackSession.findOne({
      sessionId,
      organizationId,
    }).lean();
    if (!doc) return undefined;
    const session = doc.session as FeedbackSession;
    await super.save(session);
    return session;
  }
}

export class MongoRefinementStore extends InMemoryRefinementStore {
  override async save(req: RefinementRequest): Promise<RefinementRequest> {
    await super.save(req);
    await EnterpriseOsRefinement.updateOne(
      { refinementId: req.refinementId },
      {
        $set: {
          refinementId: req.refinementId,
          organizationId: req.organizationId,
          request: req,
        },
      },
      { upsert: true }
    );
    return req;
  }

  override async get(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementRequest | undefined> {
    const mem = await super.get(refinementId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsRefinement.findOne({
      refinementId,
      organizationId,
    }).lean();
    if (!doc) return undefined;
    const req = doc.request as RefinementRequest;
    await super.save(req);
    return req;
  }

  override async saveSpec(
    spec: RefinementSpecification
  ): Promise<RefinementSpecification> {
    await super.saveSpec(spec);
    await EnterpriseOsRefinementSpec.updateOne(
      { specificationId: spec.specificationId },
      {
        $set: {
          specificationId: spec.specificationId,
          refinementId: spec.refinementId,
          organizationId: spec.organizationId,
          spec,
        },
      },
      { upsert: true }
    );
    return spec;
  }

  override async getSpec(
    specificationId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined> {
    const mem = await super.getSpec(specificationId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsRefinementSpec.findOne({
      specificationId,
      organizationId,
    }).lean();
    if (!doc) return undefined;
    const spec = doc.spec as RefinementSpecification;
    await super.saveSpec(spec);
    return spec;
  }

  override async getSpecByRefinement(
    refinementId: string,
    organizationId: string
  ): Promise<RefinementSpecification | undefined> {
    const mem = await super.getSpecByRefinement(refinementId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsRefinementSpec.findOne({
      refinementId,
      organizationId,
    }).lean();
    if (!doc) return undefined;
    const spec = doc.spec as RefinementSpecification;
    await super.saveSpec(spec);
    return spec;
  }
}

export class MongoArtifactVersionStore extends InMemoryArtifactVersionStore {
  override async createVersion(
    input: Parameters<InMemoryArtifactVersionStore["createVersion"]>[0]
  ): Promise<OsArtifactVersion> {
    const record = await super.createVersion(input);
    await EnterpriseOsArtifactVersion.updateOne(
      {
        artifactId: record.artifactId,
        version: record.version,
        organizationId: record.organizationId,
      },
      { $setOnInsert: { ...record, record } },
      { upsert: true }
    );
    return record;
  }

  override async getVersion(
    artifactId: string,
    version: number,
    organizationId: string
  ): Promise<OsArtifactVersion | undefined> {
    const mem = await super.getVersion(artifactId, version, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsArtifactVersion.findOne({
      artifactId,
      version,
      organizationId,
    }).lean();
    return doc ? ((doc.record as OsArtifactVersion) ?? (doc as unknown as OsArtifactVersion)) : undefined;
  }

  override async createManifest(
    input: Parameters<InMemoryArtifactVersionStore["createManifest"]>[0]
  ): Promise<OsArtifactManifest> {
    const manifest = await super.createManifest(input);
    await EnterpriseOsArtifactManifest.updateOne(
      { manifestId: manifest.manifestId },
      {
        $setOnInsert: {
          manifestId: manifest.manifestId,
          organizationId: manifest.organizationId,
          executionId: manifest.executionId,
          record: manifest,
        },
      },
      { upsert: true }
    );
    return manifest;
  }

  override async listVersions(
    artifactId: string,
    organizationId: string
  ): Promise<readonly OsArtifactVersion[]> {
    const mem = await super.listVersions(artifactId, organizationId);
    if (mem.length) return mem;
    const docs = await EnterpriseOsArtifactVersion.find({
      artifactId,
      organizationId,
    })
      .sort({ version: 1 })
      .lean();
    return docs.map(
      (d) => (d.record as OsArtifactVersion) ?? (d as unknown as OsArtifactVersion)
    );
  }

  override async getLatestManifest(
    executionId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined> {
    const mem = await super.getLatestManifest(executionId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsArtifactManifest.findOne({
      executionId,
      organizationId,
    })
      .sort({ "record.version": -1 })
      .lean();
    return doc ? (doc.record as OsArtifactManifest) : undefined;
  }

  override async getManifest(
    manifestId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined> {
    const mem = await super.getManifest(manifestId, organizationId);
    if (mem) return mem;
    const doc = await EnterpriseOsArtifactManifest.findOne({
      manifestId,
      organizationId,
    }).lean();
    return doc ? (doc.record as OsArtifactManifest) : undefined;
  }

  override async approveVersion(
    input: Parameters<InMemoryArtifactVersionStore["approveVersion"]>[0]
  ): Promise<OsArtifactVersion> {
    const record = await super.approveVersion(input);
    await EnterpriseOsArtifactVersion.updateOne(
      {
        artifactId: record.artifactId,
        version: record.version,
        organizationId: record.organizationId,
      },
      { $set: { record } },
      { upsert: true }
    );
    return record;
  }

  override async revokeVersion(
    input: Parameters<InMemoryArtifactVersionStore["revokeVersion"]>[0]
  ): Promise<OsArtifactVersion> {
    const record = await super.revokeVersion(input);
    await EnterpriseOsArtifactVersion.updateOne(
      {
        artifactId: record.artifactId,
        version: record.version,
        organizationId: record.organizationId,
      },
      { $set: { record } },
      { upsert: true }
    );
    return record;
  }
}

export class MongoDeliveryReceiptStore implements IDeliveryReceiptStore {
  async getByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined> {
    const doc = await EnterpriseOsDelivery.findOne({
      idempotencyKey,
      organizationId,
    }).lean();
    return doc ? (doc.receipt as DeliveryReceipt) : undefined;
  }

  async get(
    deliveryId: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined> {
    const doc = await EnterpriseOsDelivery.findOne({
      deliveryId,
      organizationId,
    }).lean();
    return doc ? (doc.receipt as DeliveryReceipt) : undefined;
  }

  async save(receipt: DeliveryReceipt): Promise<DeliveryReceipt> {
    const existing = await this.getByIdempotencyKey(
      receipt.idempotencyKey,
      receipt.organizationId
    );
    if (existing && existing.status === "SUCCEEDED") return existing;
    await EnterpriseOsDelivery.updateOne(
      { idempotencyKey: receipt.idempotencyKey },
      {
        $set: {
          deliveryId: receipt.deliveryId,
          idempotencyKey: receipt.idempotencyKey,
          organizationId: receipt.organizationId,
          receipt,
        },
      },
      { upsert: true }
    );
    return receipt;
  }
}
