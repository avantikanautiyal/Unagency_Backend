/**
 * Mesh diagnostics.
 */

import type { ProviderMeshSnapshot } from "../contracts/result";

export interface MeshDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly providerId?: string;
}

export function diagnoseMesh(snapshot: ProviderMeshSnapshot): readonly MeshDiagnostic[] {
  const out: MeshDiagnostic[] = [];
  if (snapshot.providers.length === 0) {
    out.push({
      code: "mesh.empty",
      severity: "warning",
      message: "Mesh snapshot has no providers",
    });
  }
  for (const p of snapshot.providers) {
    if (p.state === "unavailable") {
      out.push({
        code: "provider.unavailable",
        severity: "error",
        message: `${p.providerId} is unavailable`,
        providerId: p.providerId,
      });
    } else if (p.state === "degraded" || p.state === "rate_limited") {
      out.push({
        code: "provider.degraded",
        severity: "warning",
        message: `${p.providerId} is ${p.state}`,
        providerId: p.providerId,
      });
    }
  }
  if (snapshot.routingHints.length === 0) {
    out.push({
      code: "hints.empty",
      severity: "info",
      message: "No routing hints generated",
    });
  }
  return out;
}
