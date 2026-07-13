/**
 * Transport pipeline.
 *
 * Purpose: Orchestrate the canonical transport stages around a dispatcher.
 * Responsibilities: Validate → Open Session → Serialize → Execute → Deserialize
 *   → Normalize → Close Session. No provider logic, no networking.
 * Usage: Injected into the engine.
 * Future Extension: Streaming pipeline variant.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { CanonicalProviderRequest } from "../contracts/canonical";
import type { TransportContext } from "../contracts/context";
import type { TransportStatistics } from "../contracts/errors";
import { asTransportSessionId } from "../contracts/identifiers";
import type { TransportSession } from "../contracts/session-connection";
import type { IConnectionManager } from "../interfaces/connection";
import type { ITransportDiagnostics } from "../interfaces/diagnostics";
import type {
  ITransportDispatcher,
  ITransportPipeline,
  PipelineOutcome,
} from "../interfaces/engine";
import type {
  ITransportDeserializer,
  ITransportSerializer,
} from "../interfaces/serde";
import { byteLength } from "../serializers/default-serializer";

export interface TransportPipelineDeps {
  readonly serializer: ITransportSerializer;
  readonly deserializer: ITransportDeserializer;
  readonly dispatcher: ITransportDispatcher;
  readonly connectionManager: IConnectionManager;
  readonly diagnostics?: ITransportDiagnostics;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class TransportPipeline implements ITransportPipeline {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: TransportPipelineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async run(
    request: CanonicalProviderRequest,
    context: TransportContext
  ): Promise<Result<PipelineOutcome>> {
    // 1. Validate
    const invalid = this.validate(request);
    if (invalid) {
      return failure(invalid);
    }

    // 2. Open session (acquire a logical connection)
    const connection = this.deps.connectionManager.acquire({
      protocol: request.protocol,
      keepAlive: true,
    });
    if (!connection.ok) {
      return connection;
    }
    const sessionId =
      context.sessionId ?? asTransportSessionId(this.createId("txsess"));
    const openedAt = this.nowIso();
    const session: TransportSession = {
      sessionId,
      requestId: request.requestId,
      providerId: request.providerId,
      protocol: request.protocol,
      state: "open",
      connectionId: connection.value.connectionId,
      openedAt,
    };

    // 3. Serialize
    const serialized = this.deps.serializer.serialize(request, session);
    if (!serialized.ok) {
      this.deps.connectionManager.release(connection.value.connectionId);
      return serialized;
    }
    const serializedBytes = byteLength(serialized.value.body);
    this.deps.diagnostics?.recordSerialization(serializedBytes);

    // 4. Execute
    const start = this.clockMs();
    const dispatch = await this.deps.dispatcher.dispatch(serialized.value, {
      ...context,
      sessionId,
    });
    const latencyMs = this.clockMs() - start;

    if (!dispatch.ok) {
      this.deps.connectionManager.release(connection.value.connectionId);
      return dispatch;
    }

    // 5. Deserialize
    const deserialized = this.deps.deserializer.deserialize(
      dispatch.value.response,
      request
    );
    if (!deserialized.ok) {
      this.deps.connectionManager.release(connection.value.connectionId);
      return deserialized;
    }
    const deserializedBytes = byteLength(dispatch.value.response.body);
    this.deps.diagnostics?.recordDeserialization(deserializedBytes);

    // 6. Normalize (assemble measured statistics)
    const statistics: TransportStatistics = {
      protocol: request.protocol,
      attempts: dispatch.value.attempts,
      retries: dispatch.value.retries,
      latencyMs,
      serializedBytes,
      deserializedBytes,
      compression: request.compression,
      reusedConnection: connection.value.useCount > 1,
    };
    const response = { ...deserialized.value, statistics };

    // 7. Close session (release connection)
    this.deps.connectionManager.release(connection.value.connectionId);
    const closedSession: TransportSession = {
      ...session,
      state: "closed",
      closedAt: this.nowIso(),
    };

    return success({ response, session: closedSession, statistics });
  }

  private validate(request: CanonicalProviderRequest): ValidationError | undefined {
    if (!request.requestId) {
      return new ValidationError("canonical request requires a requestId");
    }
    if (!request.providerId) {
      return new ValidationError("canonical request requires a providerId");
    }
    if (!request.target?.operation) {
      return new ValidationError("canonical request requires target.operation");
    }
    if (request.timeoutMs < 0) {
      return new ValidationError("canonical request timeoutMs must be >= 0");
    }
    return undefined;
  }
}
