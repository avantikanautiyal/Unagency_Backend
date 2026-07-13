/**
 * Serialization + compression ports.
 *
 * Purpose: Transform canonical ⇄ protocol shapes and (de)compress bodies.
 * Responsibilities: CanonicalProviderRequest → TransportRequest and back.
 * Usage: Injected into the pipeline.
 * Future Extension: Protobuf/MessagePack serializers.
 */

import type { Result } from "../../../shared/result";
import type {
  CanonicalProviderRequest,
  CanonicalProviderResponse,
} from "../contracts/canonical";
import type { CompressionAlgorithm } from "../contracts/enums";
import type { TransportSession } from "../contracts/session-connection";
import type {
  TransportBody,
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";

export interface ITransportSerializer {
  serialize(
    request: CanonicalProviderRequest,
    session: TransportSession
  ): Result<TransportRequest>;
}

export interface ITransportDeserializer {
  deserialize(
    response: TransportResponse,
    request: CanonicalProviderRequest
  ): Result<CanonicalProviderResponse>;
}

export interface CompressionOutcome {
  readonly body: TransportBody;
  readonly bytes: number;
  readonly algorithm: CompressionAlgorithm;
}

export interface ICompressor {
  compress(body: TransportBody, algorithm: CompressionAlgorithm): Result<CompressionOutcome>;
  decompress(body: TransportBody, algorithm: CompressionAlgorithm): Result<CompressionOutcome>;
}
