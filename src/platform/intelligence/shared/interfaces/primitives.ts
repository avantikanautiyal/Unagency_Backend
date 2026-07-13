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

export interface ILogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
}
