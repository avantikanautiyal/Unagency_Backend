/**
 * Structured OS observability helpers — no secrets, tenant-safe summaries.
 */

export interface OsExecutionLogFields {
  readonly requestId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly capabilityId?: string;
  readonly taskId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly status?: string;
  readonly lifecycle?: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
  readonly retryCount?: number;
  /** Phase 4 planning observability */
  readonly planId?: string;
  readonly planVersion?: number;
  readonly taskCount?: number;
  readonly dependencyCount?: number;
  readonly plannerVersion?: string;
}

const SECRET_KEY_RE =
  /(api[_-]?key|secret|password|authorization|bearer|credential|token)/i;

export function sanitizeOsLogFields(
  fields: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function logOsExecutionEvent(
  event: string,
  fields: OsExecutionLogFields
): void {
  const safe = sanitizeOsLogFields({ event, ...fields });
  console.log(`[UNAGENCY OS] ${JSON.stringify(safe)}`);
}
