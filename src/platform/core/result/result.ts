/**
 * Result pattern for expected failures.
 * Future modules must not throw for expected business failures — use Result.
 */

import type { IntelligenceError } from "../errors/intelligence-error";

export type Result<T, E = IntelligenceError> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E = IntelligenceError> {
  readonly ok: false;
  readonly error: E;
}

export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function failure<E = IntelligenceError>(error: E): Failure<E> {
  return { ok: false, error };
}

export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.ok === false;
}

