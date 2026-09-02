/**
 * Canonical embedding output normalization + validation.
 * Vectors persist on the execution/result payload — no dedicated vector DB.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";

export interface CanonicalEmbeddingResult {
  readonly vector: readonly number[];
  readonly dimensions: number;
  readonly model: string;
  readonly provider: string;
  readonly index?: number;
}

export function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Validate and freeze a single embedding vector.
 * Rejects empty, non-number, NaN, and Infinity elements.
 */
export function validateEmbeddingVector(
  raw: unknown
): Result<readonly number[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return failure(new ValidationError("Embedding vector is empty or missing"));
  }
  const vector: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (!isFiniteNumber(v)) {
      return failure(
        new ValidationError(
          `Embedding vector element at index ${i} is not a finite number`
        )
      );
    }
    vector.push(v);
  }
  return success(Object.freeze(vector));
}

export function buildCanonicalEmbedding(input: {
  readonly vector: readonly number[];
  readonly model: string;
  readonly provider: string;
  readonly index?: number;
}): CanonicalEmbeddingResult {
  return Object.freeze({
    vector: input.vector,
    dimensions: input.vector.length,
    model: input.model,
    provider: input.provider,
    ...(input.index !== undefined ? { index: input.index } : {}),
  });
}

/**
 * OpenAI / OpenAI-compatible shape: data[].embedding
 */
export function mapOpenAICompatibleEmbeddingData(input: {
  readonly data: unknown;
  readonly model: string;
  readonly provider: string;
}): Result<{
  readonly embedding: CanonicalEmbeddingResult;
  readonly embeddings: readonly CanonicalEmbeddingResult[];
}> {
  if (!Array.isArray(input.data) || input.data.length === 0) {
    return failure(new ValidationError("Embedding response data is empty"));
  }

  const embeddings: CanonicalEmbeddingResult[] = [];
  for (let i = 0; i < input.data.length; i++) {
    const item = input.data[i];
    if (!item || typeof item !== "object") {
      return failure(new ValidationError(`Malformed embedding data at index ${i}`));
    }
    const rec = item as Record<string, unknown>;
    const validated = validateEmbeddingVector(rec.embedding);
    if (!validated.ok) return validated;
    embeddings.push(
      buildCanonicalEmbedding({
        vector: validated.value,
        model: input.model,
        provider: input.provider,
        index: typeof rec.index === "number" ? rec.index : i,
      })
    );
  }

  return success(
    Object.freeze({
      embedding: embeddings[0]!,
      embeddings: Object.freeze(embeddings),
    })
  );
}

/**
 * Cohere v2 embed shape: embeddings.float[][]
 */
export function mapCohereEmbeddingResponse(input: {
  readonly body: Readonly<Record<string, unknown>>;
  readonly model: string;
  readonly provider: string;
}): Result<{
  readonly embedding: CanonicalEmbeddingResult;
  readonly embeddings: readonly CanonicalEmbeddingResult[];
}> {
  const embeddingsObj = input.body.embeddings as Record<string, unknown> | undefined;
  const floatVectors = embeddingsObj?.float;
  if (!Array.isArray(floatVectors) || floatVectors.length === 0) {
    return failure(new ValidationError("Cohere embedding float vectors missing"));
  }

  const embeddings: CanonicalEmbeddingResult[] = [];
  for (let i = 0; i < floatVectors.length; i++) {
    const validated = validateEmbeddingVector(floatVectors[i]);
    if (!validated.ok) return validated;
    embeddings.push(
      buildCanonicalEmbedding({
        vector: validated.value,
        model: input.model,
        provider: input.provider,
        index: i,
      })
    );
  }

  return success(
    Object.freeze({
      embedding: embeddings[0]!,
      embeddings: Object.freeze(embeddings),
    })
  );
}

export function attachEmbeddingOutputs(
  output: Readonly<Record<string, unknown>>,
  mapped: {
    readonly embedding: CanonicalEmbeddingResult;
    readonly embeddings: readonly CanonicalEmbeddingResult[];
  }
): Readonly<Record<string, unknown>> {
  // Public output: primary embedding + list. Vector lives here (execution result).
  // Do not nest raw vendor payloads.
  return Object.freeze({
    ...output,
    embedding: mapped.embedding,
    embeddings: mapped.embeddings,
    content: `[embedding dims=${mapped.embedding.dimensions}]`,
  });
}

export function extractEmbeddingInputText(
  input: Readonly<Record<string, unknown>>
): Result<string> {
  const candidates = [input.text, input.prompt, input.input];
  for (const c of candidates) {
    if (typeof c === "string") {
      const trimmed = c.trim();
      if (trimmed.length > 0) return success(trimmed);
    }
  }
  return failure(new ValidationError("embedding.generate requires non-empty text input"));
}
