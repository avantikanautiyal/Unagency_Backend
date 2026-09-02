/**
 * Phase 7 — In-memory immutable artifact version store.
 */

import {
  checksumPreview,
  type OsArtifactManifest,
  type OsArtifactVersion,
} from "../contracts/artifact-version";
import { DeliveryError } from "../contracts/errors";
import { logOsExecutionEvent } from "../../observability/execution-log";
import { defaultBrandMemoryPromoteService } from "../../creative/brand-memory-promote-service";
import { defaultCampaignMemoryService } from "../../creative/campaign-memory-service";
import type { ArtifactBrandMemoryHint } from "../../creative/promote-on-approve";
import type { PromoteOnApproveResult } from "../../creative/promote-on-approve";

export interface IArtifactVersionStore {
  createVersion(
    input: Parameters<InMemoryArtifactVersionStore["createVersion"]>[0]
  ): Promise<OsArtifactVersion>;
  getVersion(
    artifactId: string,
    version: number,
    organizationId: string
  ): Promise<OsArtifactVersion | undefined>;
  listVersions(
    artifactId: string,
    organizationId: string
  ): Promise<readonly OsArtifactVersion[]>;
  approveVersion(
    input: Parameters<InMemoryArtifactVersionStore["approveVersion"]>[0]
  ): Promise<OsArtifactVersion>;
  revokeVersion(
    input: Parameters<InMemoryArtifactVersionStore["revokeVersion"]>[0]
  ): Promise<OsArtifactVersion>;
  createManifest(
    input: Parameters<InMemoryArtifactVersionStore["createManifest"]>[0]
  ): Promise<OsArtifactManifest>;
  getLatestManifest(
    executionId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined>;
  getManifest?(
    manifestId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined>;
}

export class InMemoryArtifactVersionStore implements IArtifactVersionStore {
  private readonly versions = new Map<string, OsArtifactVersion[]>();
  private readonly manifests = new Map<string, OsArtifactManifest[]>();

  clear(): void {
    this.versions.clear();
    this.manifests.clear();
  }

  private key(artifactId: string, organizationId: string): string {
    return `${organizationId}|${artifactId}`;
  }

  async createVersion(input: {
    readonly artifactId: string;
    readonly organizationId: string;
    readonly executionId: string;
    readonly planId?: string;
    readonly planVersion?: number;
    readonly refinementId?: string;
    readonly refinementVersion?: number;
    readonly sourceArtifactId?: string;
    readonly sourceVersion?: number;
    readonly outputContractId?: string;
    readonly preview?: string;
    readonly approvalState?: OsArtifactVersion["approvalState"];
    readonly approvalReference?: string;
    readonly nowIso?: () => string;
  }): Promise<OsArtifactVersion> {
    if (!input.organizationId?.trim()) {
      throw new DeliveryError("TENANT_VIOLATION", "organizationId required");
    }
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const k = this.key(input.artifactId, input.organizationId);
    const existing = this.versions.get(k) ?? [];
    const version = existing.length ? existing[existing.length - 1]!.version + 1 : 1;
    const preview = input.preview ?? "";
    const record: OsArtifactVersion = {
      artifactId: input.artifactId,
      version,
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      refinementId: input.refinementId,
      refinementVersion: input.refinementVersion,
      sourceArtifactId: input.sourceArtifactId,
      sourceVersion: input.sourceVersion,
      outputContractId: input.outputContractId,
      preview,
      checksum: checksumPreview(preview),
      approvalState: input.approvalState ?? "UNAPPROVED",
      approvalReference: input.approvalReference,
      createdAt: nowIso(),
      approvedAt:
        input.approvalState === "APPROVED" ? nowIso() : undefined,
    };
    // Immutable history: append only
    this.versions.set(k, [...existing, record]);
    logOsExecutionEvent(
      version === 1 ? "artifact.created" : "artifact.versioned",
      {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: `v${version}`,
        planId: input.planId,
        planVersion: input.planVersion,
      }
    );
    return record;
  }

  async getVersion(
    artifactId: string,
    version: number,
    organizationId: string
  ): Promise<OsArtifactVersion | undefined> {
    const list = this.versions.get(this.key(artifactId, organizationId)) ?? [];
    return list.find((v) => v.version === version);
  }

  async listVersions(
    artifactId: string,
    organizationId: string
  ): Promise<readonly OsArtifactVersion[]> {
    return this.versions.get(this.key(artifactId, organizationId)) ?? [];
  }

  async approveVersion(input: {
    readonly artifactId: string;
    readonly version: number;
    readonly organizationId: string;
    readonly approvalReference: string;
    readonly nowIso?: () => string;
    /**
     * Phase A1 — when set, may promote into Brand Memory (flag-gated).
     * Omit to keep legacy approve-only behaviour.
     */
    readonly brandMemory?: ArtifactBrandMemoryHint;
  }): Promise<OsArtifactVersion> {
    const list = [
      ...(this.versions.get(this.key(input.artifactId, input.organizationId)) ??
        []),
    ];
    const idx = list.findIndex((v) => v.version === input.version);
    if (idx < 0) {
      throw new DeliveryError("ARTIFACT_NOT_FOUND", "Artifact version not found");
    }
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    // Mark older approved as SUPERSEDED (immutable replace of metadata only on that slot)
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.approvalState === "APPROVED" && list[i]!.version !== input.version) {
        list[i] = { ...list[i]!, approvalState: "SUPERSEDED" };
      }
    }
    list[idx] = {
      ...list[idx]!,
      approvalState: "APPROVED",
      approvalReference: input.approvalReference,
      approvedAt: nowIso(),
    };
    this.versions.set(this.key(input.artifactId, input.organizationId), list);
    logOsExecutionEvent("artifact.approved", {
      requestId: list[idx]!.executionId,
      executionId: list[idx]!.executionId,
      organizationId: input.organizationId,
      status: `v${input.version}`,
      planId: list[idx]!.planId,
      planVersion: list[idx]!.planVersion,
    });

    if (input.brandMemory?.brandId?.trim()) {
      try {
        const promoted: PromoteOnApproveResult | null =
          await defaultBrandMemoryPromoteService.promoteOnApprove({
            organizationId: input.organizationId,
            brandId: input.brandMemory.brandId.trim(),
            artifactId: input.artifactId,
            artifactVersion: input.version,
            executionId: list[idx]!.executionId,
            approvalReference: input.approvalReference,
            slotKey: input.brandMemory.slotKey,
            tier: input.brandMemory.tier,
            assetId: input.brandMemory.assetId,
            facts: input.brandMemory.facts,
            nowIso: nowIso(),
          });
        if (promoted) {
          logOsExecutionEvent("brand_memory.promote_hook", {
            requestId: list[idx]!.executionId,
            executionId: list[idx]!.executionId,
            organizationId: input.organizationId,
            status: promoted.shadowed
              ? "shadow"
              : promoted.idempotentReplay
                ? "idempotent"
                : "ok",
            capabilityId: String(promoted.slotKey),
          });
        }

        // Phase A5 — campaign pack + selection signal (flag-gated inside service).
        const campaignId = input.brandMemory.campaignId?.trim();
        if (campaignId) {
          await defaultCampaignMemoryService.promotePackToWorking({
            organizationId: input.organizationId,
            brandId: input.brandMemory.brandId.trim(),
            campaignId,
            title: input.brandMemory.campaignTitle,
            executionId: list[idx]!.executionId,
            leafAssetIds: input.brandMemory.assetId
              ? [input.brandMemory.assetId]
              : undefined,
            slotPointers: [
              {
                slotKey: input.brandMemory.slotKey,
                version: promoted?.version ?? input.version,
                tier: input.brandMemory.tier ?? "working",
                assetId: input.brandMemory.assetId,
                provenance: promoted?.provenance ?? `Approved v${input.version}`,
              },
            ],
            nowIso: nowIso(),
          });
        }
        if (input.brandMemory.recordSelection !== false) {
          await defaultCampaignMemoryService.recordSelectionSignal({
            organizationId: input.organizationId,
            brandId: input.brandMemory.brandId.trim(),
            campaignId,
            executionId: list[idx]!.executionId,
            artifactId: input.artifactId,
            artifactVersion: input.version,
            assetId: input.brandMemory.assetId,
            slotKey: input.brandMemory.slotKey,
            service: input.brandMemory.service,
            kind: campaignId ? "pack_leaf_approved" : "approved",
            nowIso: nowIso(),
          });
        }
      } catch {
        // Memory write must never fail artifact approval (L3 path stays durable).
        logOsExecutionEvent("brand_memory.promote_hook", {
          requestId: list[idx]!.executionId,
          executionId: list[idx]!.executionId,
          organizationId: input.organizationId,
          status: "error_swallowed",
        });
      }
    }

    return list[idx]!;
  }

  async revokeVersion(input: {
    readonly artifactId: string;
    readonly version: number;
    readonly organizationId: string;
    readonly nowIso?: () => string;
    readonly brandMemory?: ArtifactBrandMemoryHint;
  }): Promise<OsArtifactVersion> {
    const list = [
      ...(this.versions.get(this.key(input.artifactId, input.organizationId)) ??
        []),
    ];
    const idx = list.findIndex((v) => v.version === input.version);
    if (idx < 0) {
      throw new DeliveryError("ARTIFACT_NOT_FOUND", "Artifact version not found");
    }
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    list[idx] = {
      ...list[idx]!,
      approvalState: "REVOKED",
      revokedAt: nowIso(),
    };
    this.versions.set(this.key(input.artifactId, input.organizationId), list);

    if (input.brandMemory?.brandId?.trim()) {
      try {
        await defaultBrandMemoryPromoteService.archiveOnReject({
          organizationId: input.organizationId,
          brandId: input.brandMemory.brandId.trim(),
          artifactId: input.artifactId,
          artifactVersion: input.version,
          executionId: list[idx]!.executionId,
          slotKey: input.brandMemory.slotKey,
          assetId: input.brandMemory.assetId,
          nowIso: nowIso(),
        });
      } catch {
        logOsExecutionEvent("brand_memory.archive_hook", {
          requestId: list[idx]!.executionId,
          executionId: list[idx]!.executionId,
          organizationId: input.organizationId,
          status: "error_swallowed",
        });
      }
    }

    return list[idx]!;
  }

  async createManifest(input: {
    readonly organizationId: string;
    readonly executionId: string;
    readonly planVersion?: number;
    readonly refinementVersion?: number;
    readonly entries: readonly { artifactId: string; version: number; role?: string }[];
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): Promise<OsArtifactManifest> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p) => `${p}_${Date.now()}`);
    const mk = `${input.organizationId}|${input.executionId}`;
    const existing = this.manifests.get(mk) ?? [];
    const version = existing.length + 1;
    const manifest: OsArtifactManifest = {
      manifestId: createId("amanifest"),
      organizationId: input.organizationId,
      executionId: input.executionId,
      planVersion: input.planVersion,
      refinementVersion: input.refinementVersion,
      version,
      entries: input.entries,
      createdAt: nowIso(),
    };
    this.manifests.set(mk, [...existing, manifest]);
    logOsExecutionEvent("artifact.packaged", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: `manifest_v${version}`,
      planVersion: input.planVersion,
    });
    return manifest;
  }

  async getLatestManifest(
    executionId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined> {
    const list = this.manifests.get(`${organizationId}|${executionId}`) ?? [];
    return list[list.length - 1];
  }

  async getManifest(
    manifestId: string,
    organizationId: string
  ): Promise<OsArtifactManifest | undefined> {
    for (const list of this.manifests.values()) {
      const found = list.find(
        (m) => m.manifestId === manifestId && m.organizationId === organizationId
      );
      if (found) return found;
    }
    return undefined;
  }
}
