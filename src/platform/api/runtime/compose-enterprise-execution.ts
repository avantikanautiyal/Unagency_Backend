/**
 * Composes distributed execution + Direct Execution Engine for Enterprise API.
 */

import type { IDirectExecutionEngine } from "../../direct/contracts";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import { createDirectExecutionPlatform } from "../../direct/create-direct-execution-platform";
import { ControllableDispatcher } from "../../providers/runtime/testing";
import {
  IntegrationLayerJobExecutor,
  StubJobExecutor,
  type IntegrationLayerJobExecutorOptions,
  type SyncImageMaterializer,
  type DocumentExportMaterializer,
} from "../../infrastructure/execution/workers/job-executors";
import type { IJobExecutor } from "../../infrastructure/execution/interfaces/execution";
import type { EnterpriseApiExecutionMode } from "./execution-mode";
import { integrationPipelineModeFor } from "./execution-mode";
import { materializeSyncImageArtifacts } from "../services/sync-image-artifact-materializer";
import {
  materializeDocumentExports,
  resolveDocumentExportKind,
  isRequiredDocumentOrPresentationExport,
} from "../services/document-export-materializer";
import { recoverPresentationRoutesPayload } from "../../os/delivery/document-export-service";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import { assertProductionComposition } from "../../os";
import { failure, success } from "../../core/result";
import { ValidationError } from "../../core/errors";

export interface ComposeEnterpriseExecutionInput {
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly integration?: IDirectExecutionEngine;
  readonly runtimeDispatcher?: IProviderDispatcher;
  readonly toolRuntime?: import("../../providers/tools/composition/tool-runtime-platform").ToolRuntimePlatform;
  readonly asyncMedia?: AsyncMediaPlatform;
}

export interface ComposedEnterpriseExecution {
  readonly executor: IJobExecutor;
  readonly integration?: IDirectExecutionEngine;
  readonly integrationJobOptions: IntegrationLayerJobExecutorOptions;
}

export function composeEnterpriseExecution(
  input: ComposeEnterpriseExecutionInput
): ComposedEnterpriseExecution {
  const clocks = {
    nowIso: input.nowIso ?? (() => new Date().toISOString()),
    clockMs: input.clockMs ?? (() => Date.now()),
    createId: input.createId ?? ((p: string) => `${p}_${Date.now()}`),
  };

  const materializeSyncImage: SyncImageMaterializer | undefined = input.asyncMedia
    ? (args) =>
        materializeSyncImageArtifacts({
          asyncMedia: input.asyncMedia!,
          createId: clocks.createId,
          ...args,
        })
    : undefined;

  const materializeDocumentExport: DocumentExportMaterializer | undefined =
    input.asyncMedia
      ? async (args) => {
          const structuredName =
            args.metadata?.structuredOutput &&
            typeof args.metadata.structuredOutput === "object"
              ? String(
                  (args.metadata.structuredOutput as { name?: unknown }).name ??
                    ""
                )
              : undefined;
          let structuredCandidate: unknown =
            args.jobSummary.structuredData ??
            args.runtimeOutput?.structured ??
            args.runtimeOutput?.structuredOutput ??
            args.runtimeOutput?.data;
          if (structuredCandidate != null) {
            structuredCandidate = recoverPresentationRoutesPayload(
              structuredCandidate
            );
          }
          const exportKind = resolveDocumentExportKind({
            outputKind:
              typeof args.metadata?.outputKind === "string"
                ? args.metadata.outputKind
                : undefined,
            mediaKind:
              typeof args.metadata?.mediaKind === "string"
                ? args.metadata.mediaKind
                : undefined,
            structuredName,
            data: structuredCandidate,
          });
          if (!exportKind) {
            const required = isRequiredDocumentOrPresentationExport({
              outputKind:
                typeof args.metadata?.outputKind === "string"
                  ? args.metadata.outputKind
                  : undefined,
              structuredName,
              service:
                typeof args.metadata?.service === "string"
                  ? args.metadata.service
                  : undefined,
              subtype:
                typeof args.metadata?.subtype === "string"
                  ? args.metadata.subtype
                  : undefined,
              deliverableRequired: args.metadata?.deliverableRequired === true,
            });
            if (required) {
              const presentation =
                (structuredName ?? "").toLowerCase().includes("presentation") ||
                (typeof args.metadata?.outputKind === "string" &&
                  args.metadata.outputKind.toLowerCase() === "presentation");
              return failure(
                new ValidationError(
                  presentation
                    ? "Presentation completed without slide decks required for PDF/PPTX export."
                    : "Document completed without a valid DocumentPlan required for PDF/DOCX export."
                )
              );
            }
            return failure(
              new ValidationError("No document/presentation export requested")
            );
          }
          const exported = await materializeDocumentExports({
            asyncMedia: input.asyncMedia!,
            executionId: args.executionId,
            organizationId: args.organizationId,
            exportKind,
            runtimeOutput: args.runtimeOutput,
            jobSummary: {
              ...args.jobSummary,
              ...(structuredCandidate != null
                ? { structuredData: structuredCandidate }
                : {}),
            },
            metadata: args.metadata,
            createId: clocks.createId,
            providerId: args.providerId,
            modelId: args.modelId,
          });
          if (!exported.ok) return exported;
          return success({
            artifactIds: exported.value.artifactIds,
            structuredData: exported.value.plan,
            exportKind,
          });
        }
      : undefined;

  const integrationJobOptions: IntegrationLayerJobExecutorOptions = {
    integrationMode: integrationPipelineModeFor(input.executionMode),
    executionMode: input.executionMode === "live" ? "live" : "simulated",
    materializeSyncImage,
    materializeDocumentExport,
  };

  if (input.executionMode === "stub") {
    return {
      executor: new StubJobExecutor("success"),
      integrationJobOptions,
    };
  }

  if (input.executionMode === "live" && !input.integration && !input.runtimeDispatcher) {
    throw new Error(
      "LIVE execution requires a pre-booted integration engine or runtimeDispatcher"
    );
  }

  const runtimeDispatcher =
    input.runtimeDispatcher ??
    (input.executionMode === "simulated"
      ? new ControllableDispatcher({ nowIso: clocks.nowIso })
      : undefined);

  if (input.executionMode === "live") {
    assertProductionComposition({
      executionMode: "live",
      runtimeDispatcher,
      negotiationSource: "production",
    });
  }

  const integration =
    input.toolRuntime != null
      ? createDirectExecutionPlatform({
          ...clocks,
          runtimeDispatcher: runtimeDispatcher!,
          toolRuntime: input.toolRuntime,
        }).engine
      : input.integration ??
        createDirectExecutionPlatform({
          ...clocks,
          runtimeDispatcher: runtimeDispatcher!,
          toolRuntime: input.toolRuntime,
        }).engine;

  return {
    executor: new IntegrationLayerJobExecutor(integration, integrationJobOptions),
    integration,
    integrationJobOptions,
  };
}
