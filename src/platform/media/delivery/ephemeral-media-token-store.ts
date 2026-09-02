/**
 * Short-lived tokens for auth-free image byte fetches (Expo Image cannot send Bearer).
 */

import { randomBytes } from "crypto";
import type { RasterDownloadFormat } from "./image-format-converter";

export type EphemeralMediaTokenRecord = {
  readonly token: string;
  readonly artifactId: string;
  readonly organizationId: string;
  readonly storageRef: string;
  readonly contentType: string;
  readonly expiresAtMs: number;
  /** When set, content endpoint converts raster bytes to this format. */
  readonly requestedFormat?: RasterDownloadFormat;
};

export class EphemeralMediaTokenStore {
  private readonly tokens = new Map<string, EphemeralMediaTokenRecord>();

  mint(input: {
    artifactId: string;
    organizationId: string;
    storageRef: string;
    contentType: string;
    ttlSeconds: number;
    requestedFormat?: RasterDownloadFormat;
  }): EphemeralMediaTokenRecord {
    this.prune();
    const token = randomBytes(24).toString("base64url");
    const record: EphemeralMediaTokenRecord = {
      token,
      artifactId: input.artifactId,
      organizationId: input.organizationId,
      storageRef: input.storageRef,
      contentType: input.contentType,
      expiresAtMs: Date.now() + Math.max(30, input.ttlSeconds) * 1000,
      ...(input.requestedFormat
        ? { requestedFormat: input.requestedFormat }
        : {}),
    };
    this.tokens.set(token, record);
    return record;
  }

  resolve(token: string): EphemeralMediaTokenRecord | undefined {
    const record = this.tokens.get(token);
    if (!record) return undefined;
    if (record.expiresAtMs <= Date.now()) {
      this.tokens.delete(token);
      return undefined;
    }
    return record;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, value] of this.tokens) {
      if (value.expiresAtMs <= now) this.tokens.delete(key);
    }
  }
}
