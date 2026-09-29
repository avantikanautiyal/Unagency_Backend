/**
 * Regression: reconciler asOfMs must not falsify poll-budget age.
 * Passing Date.now()+1d (to force nextPollAt due) previously exhausted
 * video jobs within seconds → PROVIDER_TIMEOUT.
 */

import { ProviderOperationReconciler } from "../../../src/platform/providers/async/reconciliation/provider-operation-reconciler";
import { InMemoryProviderOperationStore } from "../../../src/platform/providers/async/store/in-memory-provider-operation-store";
import type { ProviderOperationRecord } from "../../../src/platform/providers/async/contracts/provider-operation";
import type { CancellationToken } from "../../../src/platform/runtime/contracts/cancellation";

describe("async poll budget vs asOfMs", () => {
  it("does not park a fresh in-flight op when asOfMs is skewed +1 day", async () => {
    const store = new InMemoryProviderOperationStore();
    const createdAt = new Date().toISOString();
    const op: ProviderOperationRecord = {
      operationId: "prov_op_asof_1",
      submissionKey: "sub_asof_1",
      executionId: "exec_asof_1",
      attemptId: "att_asof_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "provider.luma",
      modelId: "luma/luma-ray-2",
      capabilityId: "video.generate",
      state: "pending",
      idempotencyKey: "idem_asof_1",
      pollCount: 0,
      providerJobId: "vendor-job-1",
      version: 1,
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      nextPollAt: createdAt,
      safeMetadata: {},
    };
    await store.create(op);

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: {
        ingest: async () => ({ ok: false, error: new Error("unused") }),
      } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "art_x",
        finalize: async () => undefined,
      } as never,
      maxOperationDurationMs: 3_600_000,
      defaultPollBackoffMs: 1000,
    });

    const token: CancellationToken = { cancelled: false, reason: undefined };
    const skewedAsOf = Date.now() + 86_400_000;
    await reconciler.tick(
      "test-worker",
      () => undefined,
      () => {
        throw new Error("buildRequest should not run without dispatcher");
      },
      token,
      10,
      skewedAsOf,
    );

    const after = await store.get(op.operationId);
    expect(after?.safeMetadata?.pollBudgetExhausted).not.toBe(true);
    expect(after?.state).toBe("pending");
  });
});
