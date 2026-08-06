/**
 * M10.18 — Virus / malware scan hook.
 * Default is a no-op pass-through; production injects a scanner adapter.
 * Never blocks upload with a hard dependency on a vendor SDK in-core.
 */

export type VirusScanVerdict = "clean" | "infected" | "skipped" | "error";

export type VirusScanResult = {
  readonly verdict: VirusScanVerdict;
  readonly engine?: string;
  readonly detail?: string;
  readonly scannedAt: string;
};

export interface IVirusScanHook {
  scan(input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
    organizationId: string;
  }): Promise<VirusScanResult>;
}

/** Production default — always clean; wire ClamAV/S3 malware scan later via env. */
export class NoopVirusScanHook implements IVirusScanHook {
  async scan(): Promise<VirusScanResult> {
    return {
      verdict: "clean",
      engine: "noop",
      detail: "Virus scan hook not configured — pass-through",
      scannedAt: new Date().toISOString(),
    };
  }
}

let hook: IVirusScanHook = new NoopVirusScanHook();

export function getVirusScanHook(): IVirusScanHook {
  return hook;
}

export function setVirusScanHookForTests(next: IVirusScanHook | undefined): void {
  hook = next ?? new NoopVirusScanHook();
}
