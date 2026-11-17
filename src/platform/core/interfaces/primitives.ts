/**
 * Shared platform primitives used via dependency inversion.
 */

export interface IClock {
  now(): Date;
  nowIso(): string;
}

export interface IIdGenerator {
  generate(prefix?: string): string;
}

