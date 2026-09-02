/**
 * Priority 4.1 — Runtime failure classification for browser evaluation.
 */

export type RuntimeFailureCategory =
  | "navigation_failure"
  | "browser_launch_failure"
  | "console_error"
  | "page_error"
  | "network_error"
  | "timeout"
  | "missing_artifact"
  | "unsupported_runtime";

export function classifyRuntimeFailure(input: {
  readonly skipReason?: string;
  readonly runtimeErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly failedResourceLoads: readonly string[];
  readonly startupSucceeded?: boolean;
  readonly evaluated: boolean;
}): RuntimeFailureCategory | undefined {
  if (!input.evaluated && input.skipReason) {
    if (
      input.skipReason.includes("puppeteer_not_installed") ||
      input.skipReason.includes("BROWSER_RUNTIME_EVALUATION_ENABLED=false") ||
      input.skipReason.includes("browser_runtime_disabled")
    ) {
      return "unsupported_runtime";
    }
    if (input.skipReason.includes("missing_artifact") || input.skipReason.includes("no_artifact")) {
      return "missing_artifact";
    }
    return "unsupported_runtime";
  }
  const combined = [
    ...input.runtimeErrors,
    ...input.consoleErrors,
    ...input.failedResourceLoads,
  ].join(" ").toLowerCase();
  if (/timeout|timed out|navigation timeout/i.test(combined)) {
    return "timeout";
  }
  if (/failed to launch|browser launch|could not find browser/i.test(combined)) {
    return "browser_launch_failure";
  }
  if (/net::|network|failed resource|requestfailed/i.test(combined)) {
    return "network_error";
  }
  if (input.consoleErrors.length > 0) {
    return "console_error";
  }
  if (input.runtimeErrors.some((e) => /uncaught|referenceerror|typeerror|page error/i.test(e))) {
    return "page_error";
  }
  if (input.runtimeErrors.length > 0 && input.startupSucceeded === false) {
    return "navigation_failure";
  }
  if (input.runtimeErrors.length > 0) {
    return "page_error";
  }
  return undefined;
}
