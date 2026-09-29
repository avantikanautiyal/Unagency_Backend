/**
 * Mongo durability for CDF Canonical Artifact Engine (M3A).
 * Memory remains the hot path; Mongo is optional best-effort.
 *
 * Persisted as one document per artifact / per version / per idempotency
 * row (not one giant global snapshot document) so that:
 *  - no single document can approach Mongo's 16MB limit as the bag grows;
 *  - concurrent server processes writing different entities never clobber
 *    each other (each entity has its own document with its own natural
 *    per-document atomicity), and same-entity races are bounded to that
 *    one small row instead of the entire multi-tenant bag.
 * Writes are upsert-only (never delete-by-absence): a snapshot taken by a
 * cold process that hasn't finished hydrating from Mongo yet must never be
 * able to wipe out entities from other sessions/orgs it simply hasn't
 * loaded into memory. The one accepted trade-off is that a version rolled
 * back via storeDeleteVersion (a narrow, rare failed-CAS-after-insert path)
 * leaves an orphaned version document in Mongo rather than being removed —
 * harmless, since nothing resolves a version number that isn't referenced.
 */

import { Schema, model, type Document, type Model } from "mongoose";
import type {
  CdfCanonicalArtifact,
  CdfArtifactVersionRecord,
} from "../../../../cdf/artifacts/types";

export type CdfArtifactBagSnapshot = {
  artifacts: CdfCanonicalArtifact[];
  versions: CdfArtifactVersionRecord[];
  idempotency: Array<{
    requestId: string;
    artifactId: string;
    version: number;
    createdAt: string;
  }>;
};

type CdfArtifactDoc = Document & CdfCanonicalArtifact;
type CdfArtifactVersionDoc = Document & CdfArtifactVersionRecord;
type CdfArtifactIdempotencyDoc = Document & {
  requestId: string;
  artifactId: string;
  version: number;
  createdAt: string;
};

const artifactSchema = new Schema(
  {
    artifactId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String },
    organizationId: { type: String },
    workspaceId: { type: String },
    sessionId: { type: String, required: true },
    serviceId: { type: String, required: true },
    phaseId: { type: String, required: true },
    artifactKey: { type: String, required: true },
    artifactType: { type: String, required: true },
    schemaVersion: { type: String, required: true },
    latestVersion: { type: Number, required: true },
    approvedVersion: { type: Number },
    selectedVersion: { type: Number },
    status: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "cdf_canonical_artifacts", strict: false },
);

const versionSchema = new Schema(
  {
    artifactId: { type: String, required: true },
    version: { type: Number, required: true },
    artifactType: { type: String, required: true },
    artifactKey: { type: String, required: true },
    schemaVersion: { type: String, required: true },
    status: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    lineage: { type: Schema.Types.Mixed, required: true },
    provenance: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String },
    createdAt: { type: String, required: true },
    selectedAt: { type: String },
    approvedAt: { type: String },
  },
  { collection: "cdf_canonical_artifact_versions", strict: false },
);
versionSchema.index({ artifactId: 1, version: 1 }, { unique: true });

const idempotencySchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    artifactId: { type: String, required: true },
    version: { type: Number, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "cdf_canonical_artifact_idempotency", strict: false },
);

function getOrRegisterModel<T extends Document>(
  name: string,
  schema: Schema,
): Model<T> | null {
  try {
    return model<T>(name);
  } catch {
    try {
      return model<T>(name, schema);
    } catch {
      return null;
    }
  }
}

let ArtifactModel: Model<CdfArtifactDoc> | null = null;
let VersionModel: Model<CdfArtifactVersionDoc> | null = null;
let IdempotencyModel: Model<CdfArtifactIdempotencyDoc> | null = null;

function getArtifactModel(): Model<CdfArtifactDoc> | null {
  if (!ArtifactModel) {
    ArtifactModel = getOrRegisterModel<CdfArtifactDoc>(
      "CdfCanonicalArtifact",
      artifactSchema,
    );
  }
  return ArtifactModel;
}

function getVersionModel(): Model<CdfArtifactVersionDoc> | null {
  if (!VersionModel) {
    VersionModel = getOrRegisterModel<CdfArtifactVersionDoc>(
      "CdfCanonicalArtifactVersion",
      versionSchema,
    );
  }
  return VersionModel;
}

function getIdempotencyModel(): Model<CdfArtifactIdempotencyDoc> | null {
  if (!IdempotencyModel) {
    IdempotencyModel = getOrRegisterModel<CdfArtifactIdempotencyDoc>(
      "CdfCanonicalArtifactIdempotency",
      idempotencySchema,
    );
  }
  return IdempotencyModel;
}

function mongoReady(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mongoose = require("mongoose") as typeof import("mongoose");
    return mongoose.connection?.readyState === 1;
  } catch {
    return false;
  }
}

export async function persistCdfArtifactBagToMongo(
  snapshot: CdfArtifactBagSnapshot,
): Promise<void> {
  if (!mongoReady()) return;

  // Errors are intentionally left to propagate — persistBestEffort() (the
  // fire-and-forget hot path) catches and ignores them, while
  // flushCdfArtifactBagToMongo() (durability-required paths, tests) awaits
  // this directly and must see real failures.
  const artifactModel = getArtifactModel();
  if (artifactModel && snapshot.artifacts.length) {
    await artifactModel.bulkWrite(
      snapshot.artifacts.map((a) => ({
        updateOne: {
          filter: { artifactId: a.artifactId },
          update: { $set: a },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  const versionModel = getVersionModel();
  if (versionModel && snapshot.versions.length) {
    await versionModel.bulkWrite(
      snapshot.versions.map((v) => ({
        updateOne: {
          filter: { artifactId: v.artifactId, version: v.version },
          update: { $set: v },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  const idempotencyModel = getIdempotencyModel();
  if (idempotencyModel && snapshot.idempotency.length) {
    await idempotencyModel.bulkWrite(
      snapshot.idempotency.map((r) => ({
        updateOne: {
          filter: { requestId: r.requestId },
          update: { $set: r },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}

export async function loadCdfArtifactBagFromMongo(): Promise<CdfArtifactBagSnapshot | null> {
  if (!mongoReady()) return null;

  const artifactModel = getArtifactModel();
  const versionModel = getVersionModel();
  const idempotencyModel = getIdempotencyModel();
  if (!artifactModel || !versionModel || !idempotencyModel) return null;

  const [artifacts, versions, idempotency] = await Promise.all([
    artifactModel.find({}).lean().exec(),
    versionModel.find({}).lean().exec(),
    idempotencyModel.find({}).lean().exec(),
  ]);

  if (!artifacts.length && !versions.length && !idempotency.length) {
    return null;
  }

  return {
    artifacts: artifacts as unknown as CdfCanonicalArtifact[],
    versions: versions as unknown as CdfArtifactVersionRecord[],
    idempotency: idempotency as unknown as CdfArtifactBagSnapshot["idempotency"],
  };
}
