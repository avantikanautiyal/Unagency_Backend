/**
 * Identity compressor (placeholder).
 *
 * Purpose: Represent compression without implementing any codec.
 * Responsibilities: Report the algorithm + byte size; pass the body through.
 * Usage: Used by the compression middleware.
 * Future Extension: Real gzip/deflate/br codecs (still no networking).
 *
 * NO real compression is performed in this milestone.
 */

import { success, type Result } from "../../../shared/result";
import type { CompressionAlgorithm } from "../contracts/enums";
import type { TransportBody } from "../contracts/transport-io";
import type { CompressionOutcome, ICompressor } from "../interfaces/serde";
import { byteLength } from "../serializers/default-serializer";

export class IdentityCompressor implements ICompressor {
  compress(
    body: TransportBody,
    algorithm: CompressionAlgorithm
  ): Result<CompressionOutcome> {
    return success({ body, bytes: byteLength(body), algorithm });
  }

  decompress(
    body: TransportBody,
    algorithm: CompressionAlgorithm
  ): Result<CompressionOutcome> {
    return success({ body, bytes: byteLength(body), algorithm });
  }
}
