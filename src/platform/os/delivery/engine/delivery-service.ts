/**
 * Phase 7/8 — OS Delivery Service (approval-gated, idempotent).
 * Default path remains synchronous (Phase 7). Queued mode enqueues work.
 */

import {
  InMemoryArtifactVersionStore,
  type IArtifactVersionStore,
} from "../artifact/artifact-version-store";
import { ExportDeliveryAdapter } from "../adapters/export-delivery-adapter";
import { StorageDeliveryAdapter } from "../adapters/storage-delivery-adapter";
import { DeliveryAuthorizationService } from "../authorization/delivery-authorization";
import type {
  DeliveryDestination,
  DeliveryReceipt,
  IDeliveryAdapter,
} from "../contracts/delivery";
import { DeliveryError } from "../contracts/errors";
import { logOsExecutionEvent } from "../../observability/execution-log";
import {
  InMemoryDeliveryReceiptStore,
  type IDeliveryReceiptStore,
} from "../persistence/delivery-receipt-store";

export function deliveryIdempotencyKey(input: {
  readonly organizationId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly destination: string;
  readonly deliveryIntent?: string;
}): string {
  return [
    input.organizationId,
    input.artifactId,
    String(input.artifactVersion),
    input.destination,
    input.deliveryIntent ?? "default",
  ].join("|");
}

export class OsDeliveryService {
  readonly implementationStatus = "implemented" as const;

  private readonly artifacts: IArtifactVersionStore;
  private readonly authz: DeliveryAuthorizationService;
  private readonly adapters: Map<DeliveryDestination, IDeliveryAdapter>;
  private readonly receipts: IDeliveryReceiptStore;
  private readonly mode: "sync" | "queued";
  private readonly onQueued?: (receipt: DeliveryReceipt) => Promise<void>;

  constructor(
    deps: {
      readonly artifacts?: IArtifactVersionStore;
      readonly adapters?: readonly IDeliveryAdapter[];
      readonly receipts?: IDeliveryReceiptStore;
      readonly mode?: "sync" | "queued";
      readonly onQueued?: (receipt: DeliveryReceipt) => Promise<void>;
    } = {}
  ) {
    this.artifacts = deps.artifacts ?? new InMemoryArtifactVersionStore();
    this.authz = new DeliveryAuthorizationService(this.artifacts);
    this.adapters = new Map();
    const list =
      deps.adapters ?? [new ExportDeliveryAdapter(), new StorageDeliveryAdapter()];
    for (const a of list) this.adapters.set(a.destination, a);
    this.receipts = deps.receipts ?? new InMemoryDeliveryReceiptStore();
    this.mode = deps.mode ?? "sync";
    this.onQueued = deps.onQueued;
  }

  getArtifactStore(): IArtifactVersionStore {
    return this.artifacts;
  }

  getAuthorization(): DeliveryAuthorizationService {
    return this.authz;
  }

  getReceiptStore(): IDeliveryReceiptStore {
    return this.receipts;
  }

  async authorize(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly executionId: string;
    readonly planVersion?: number;
    readonly destination: DeliveryDestination;
  }) {
    return this.authz.authorizeAsync(input);
  }

  async createDelivery(input: {
    readonly organizationId: string;
    readonly artifactId: string;
    readonly artifactVersion: number;
    readonly executionId: string;
    readonly planVersion?: number;
    readonly destination: DeliveryDestination;
    readonly deliveryIntent?: string;
    readonly nowIso?: () => string;
    readonly createId?: (prefix: string) => string;
  }): Promise<DeliveryReceipt> {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p) => `${p}_${Date.now()}`);
    const idem = deliveryIdempotencyKey(input);

    const existing = await this.receipts.getByIdempotencyKey(
      idem,
      input.organizationId
    );
    if (existing) return existing;

    const auth = await this.authz.authorizeAsync({
      organizationId: input.organizationId,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      executionId: input.executionId,
      planVersion: input.planVersion,
      destination: input.destination,
    });

    if (!auth.authorized) {
      const denied: DeliveryReceipt = {
        deliveryId: createId("deliv"),
        organizationId: input.organizationId,
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        executionId: input.executionId,
        planVersion: input.planVersion,
        destination: input.destination,
        status: "DENIED",
        timestamp: nowIso(),
        failureReason: auth.reason,
        idempotencyKey: idem,
        approvalReference: auth.approvalReference,
      };
      return denied;
    }

    const queued: DeliveryReceipt = {
      deliveryId: createId("deliv"),
      organizationId: input.organizationId,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      executionId: input.executionId,
      planVersion: input.planVersion,
      destination: input.destination,
      status: this.mode === "queued" ? "QUEUED" : "STARTED",
      timestamp: nowIso(),
      idempotencyKey: idem,
      approvalReference: auth.approvalReference,
    };
    await this.receipts.save(queued);

    if (this.mode === "queued") {
      logOsExecutionEvent("delivery.queued", {
        requestId: input.executionId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        status: "QUEUED",
        planVersion: input.planVersion,
      });
      await this.onQueued?.(queued);
      return queued;
    }

    return this.executeAdapter(queued, nowIso);
  }

  async processQueuedDelivery(
    deliveryId: string,
    organizationId: string,
    nowIso: () => string = () => new Date().toISOString()
  ): Promise<DeliveryReceipt | undefined> {
    const current = await this.receipts.get(deliveryId, organizationId);
    if (!current) return undefined;
    if (current.status === "SUCCEEDED" || current.status === "CANCELLED") {
      return current;
    }
    if (current.status === "DENIED") return current;
    return this.executeAdapter(current, nowIso);
  }

  async cancelDelivery(
    deliveryId: string,
    organizationId: string,
    nowIso: () => string = () => new Date().toISOString()
  ): Promise<DeliveryReceipt | undefined> {
    const current = await this.receipts.get(deliveryId, organizationId);
    if (!current) return undefined;
    if (current.status === "SUCCEEDED") return current;
    if (current.status === "CANCELLED") return current;
    const next: DeliveryReceipt = {
      ...current,
      status: "CANCELLED",
      timestamp: nowIso(),
    };
    return this.receipts.save(next);
  }

  private async executeAdapter(
    receipt: DeliveryReceipt,
    nowIso: () => string
  ): Promise<DeliveryReceipt> {
    const art = await this.artifacts.getVersion(
      receipt.artifactId,
      receipt.artifactVersion,
      receipt.organizationId
    );
    if (!art) {
      throw new DeliveryError("ARTIFACT_NOT_FOUND", "Artifact missing after auth");
    }

    const adapter = this.adapters.get(receipt.destination);
    if (!adapter) {
      throw new DeliveryError(
        "DESTINATION_UNAUTHORIZED",
        `No adapter for ${receipt.destination}`
      );
    }

    logOsExecutionEvent("delivery.started", {
      requestId: receipt.executionId,
      executionId: receipt.executionId,
      organizationId: receipt.organizationId,
      status: "STARTED",
      planVersion: receipt.planVersion,
    });

    const result = await adapter.deliver({
      organizationId: receipt.organizationId,
      artifactId: receipt.artifactId,
      artifactVersion: receipt.artifactVersion,
      preview: art.preview,
      checksum: art.checksum,
      idempotencyKey: receipt.idempotencyKey,
    });

    const next: DeliveryReceipt = {
      ...receipt,
      status: result.ok ? "SUCCEEDED" : "FAILED",
      externalReference: result.externalReference,
      timestamp: nowIso(),
      checksum: art.checksum,
      failureReason: result.error,
    };
    const saved = await this.receipts.save(next);

    logOsExecutionEvent(
      result.ok ? "delivery.succeeded" : "delivery.failed",
      {
        requestId: receipt.executionId,
        executionId: receipt.executionId,
        organizationId: receipt.organizationId,
        status: saved.status,
        planVersion: receipt.planVersion,
      }
    );

    return saved;
  }

  async getDelivery(
    deliveryId: string,
    organizationId: string
  ): Promise<DeliveryReceipt | undefined> {
    return this.receipts.get(deliveryId, organizationId);
  }
}

export function createOsDeliveryService(deps?: {
  readonly artifacts?: IArtifactVersionStore;
  readonly adapters?: readonly IDeliveryAdapter[];
  readonly receipts?: IDeliveryReceiptStore;
  readonly mode?: "sync" | "queued";
  readonly onQueued?: (receipt: DeliveryReceipt) => Promise<void>;
}): OsDeliveryService {
  return new OsDeliveryService(deps);
}
