/**
 * Production async media platform composition — M9.5D1.
 */

import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import { InMemoryBlobStorage } from "../../persistence/storage/in-memory-blob-storage";
import {
  blobStorageConfigFromEnv,
  requireBlobStorageConfig,
  type BlobStorageEnvConfig,
} from "../../persistence/storage/blob-storage-config";
import {
  RecordingS3BlobStorage,
  S3BlobStorage,
} from "../../persistence/storage/s3-blob-storage";
import { BlobOwnershipRegistry } from "../../media/blob/blob-ownership-registry";
import {
  InMemoryBlobMetadataRepository,
  MongoBlobMetadataRepository,
  type IBlobMetadataRepository,
} from "../../media/blob/blob-metadata-repository";
import { BlobAccessService } from "../../media/blob/blob-access-service";
import {
  FakeMediaDownloadClient,
  MediaIngestionService,
} from "../../media/ingestion/media-ingestion-service";
import { FetchMediaDownloadClient } from "../../media/ingestion/fetch-media-download-client";
import { MediaArtifactService } from "../../media/artifacts/media-artifact-service";
import { MediaDeliveryService } from "../../media/delivery/media-delivery-service";
import type { IArtifactRepository, ITenantUsageStore } from "./interfaces/execution-store-ports";
import type { IProviderOperationStore } from "../../providers/async/interfaces/provider-operation-store";
import { InMemoryProviderOperationStore } from "../../providers/async/store/in-memory-provider-operation-store";
import { MongoProviderOperationStore } from "../../providers/async/store/mongo-provider-operation-store";
import { AsyncProviderRuntime } from "../../providers/async/runtime/async-provider-runtime";
import { isDurableRuntimeEnabled } from "./durable-mode";

export interface AsyncMediaPlatform {
  readonly providerOperations: IProviderOperationStore;
  readonly blobStorage: IBlobStorage;
  readonly blobMetadata: IBlobMetadataRepository;
  readonly blobAccess: BlobAccessService;
  readonly ingestion: MediaIngestionService;
  readonly artifacts: MediaArtifactService;
  readonly mediaDelivery: MediaDeliveryService;
  readonly runtime: AsyncProviderRuntime;
  readonly blobConfig?: BlobStorageEnvConfig;
  readonly isProductionBacked: boolean;
}

export interface CreateAsyncMediaPlatformOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly forceInMemory?: boolean;
  readonly artifactsRepo: IArtifactRepository;
  readonly tenantUsage?: ITenantUsageStore;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  /** Test-only recording S3 double. */
  readonly recordingBlobStorage?: RecordingS3BlobStorage;
}

export function createAsyncMediaPlatform(
  options: CreateAsyncMediaPlatformOptions
): AsyncMediaPlatform {
  const env = options.env ?? process.env;
  const durable = isDurableRuntimeEnabled(env) && !options.forceInMemory;

  const providerOperations: IProviderOperationStore = durable
    ? new MongoProviderOperationStore()
    : new InMemoryProviderOperationStore();

  let blobStorage: IBlobStorage;
  let blobConfig: BlobStorageEnvConfig | undefined;
  let blobMetadata: IBlobMetadataRepository;
  let isProductionBacked = false;

  if (durable) {
    blobConfig = requireBlobStorageConfig(env);
    blobStorage = options.recordingBlobStorage ?? new S3BlobStorage(blobConfig);
    blobMetadata = new MongoBlobMetadataRepository();
    isProductionBacked = true;
  } else {
    blobStorage = options.recordingBlobStorage ?? new InMemoryBlobStorage();
    blobMetadata = new InMemoryBlobMetadataRepository();
  }

  const blobAccess = new BlobAccessService(
    blobMetadata,
    blobStorage instanceof S3BlobStorage || blobStorage instanceof RecordingS3BlobStorage
      ? blobStorage
      : undefined,
    blobConfig?.providerInputSignedUrlTtlSeconds ?? 300
  );

  const ingestion = new MediaIngestionService(
    blobStorage,
    blobMetadata,
    createMediaDownloadClientForComposition({
      durable,
      isProductionBacked,
      useRecordingBlobStorage: Boolean(options.recordingBlobStorage),
    })
  );
  const artifacts = new MediaArtifactService(options.artifactsRepo);
  const mediaDelivery = new MediaDeliveryService(
    options.artifactsRepo,
    blobAccess,
    blobStorage
  );
  const runtime = new AsyncProviderRuntime({
    store: providerOperations,
    ingestion,
    artifacts,
    usageStore: options.tenantUsage,
    blobAccess,
  });

  return {
    providerOperations,
    blobStorage,
    blobMetadata,
    blobAccess,
    ingestion,
    artifacts,
    mediaDelivery,
    runtime,
    blobConfig,
    isProductionBacked,
  };
}

export function isAsyncMediaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED === "true") return true;
  if (env.ENTERPRISE_ASYNC_MEDIA_ENABLED === "false") return false;
  // M10.6 — credential-free simulated mode enables in-memory async media for image/video UX.
  const mode = env.ENTERPRISE_API_EXECUTION_MODE?.trim().toLowerCase();
  if (mode === "simulated") return true;
  // P4.9.1 — LIVE durable production must persist website HTML and media artifacts.
  if (isDurableRuntimeEnabled(env)) return true;
  return false;
}

export async function pingAsyncMediaDependencies(
  platform: AsyncMediaPlatform
): Promise<{ providerOperations: boolean; blobStorage: boolean }> {
  const blobStorage =
    platform.blobStorage instanceof S3BlobStorage
      ? await platform.blobStorage.ping()
      : platform.blobStorage instanceof RecordingS3BlobStorage
        ? await platform.blobStorage.ping()
        : true;
  return { providerOperations: platform.isProductionBacked, blobStorage };
}

export { blobStorageConfigFromEnv };

/** Select production vs test media downloader (M9.5G certification surface). */
export function createMediaDownloadClientForComposition(input: {
  readonly durable: boolean;
  readonly isProductionBacked: boolean;
  readonly useRecordingBlobStorage: boolean;
}): FakeMediaDownloadClient | FetchMediaDownloadClient {
  return input.durable && input.isProductionBacked && !input.useRecordingBlobStorage
    ? new FetchMediaDownloadClient()
    : new FakeMediaDownloadClient();
}
