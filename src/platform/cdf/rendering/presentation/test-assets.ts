/**
 * Minimal 1×1 PNG fixture bytes for Vault image elements (M5B tests).
 */
export const FIXTURE_PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function fixturePngBytes(): Uint8Array {
  return new Uint8Array(FIXTURE_PNG_1X1);
}
