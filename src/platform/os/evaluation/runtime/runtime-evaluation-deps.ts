/**
 * Step 14B — Shared runtime evaluation dependency resolver for production and benchmarks.
 */

import type { RuntimeEvaluationEvidence } from "../artifact-evaluation/types";
import {
  createBrowserRuntimeCheck,
  resolveBrowserRuntimeCapability,
  type BrowserRuntimeCapability,
  type BrowserRuntimeCheckResult,
} from "./browser-runtime-evaluator";

export type RuntimeEvaluationDeps = {
  readonly capability: BrowserRuntimeCapability;
  readonly runRuntimeCheck?: (html: string) => Promise<RuntimeEvaluationEvidence>;
};

export function resolveRuntimeEvaluationDeps(options?: {
  readonly runRuntimeCheck?: (html: string) => Promise<BrowserRuntimeCheckResult>;
  readonly capability?: BrowserRuntimeCapability;
  readonly artifactId?: string;
}): RuntimeEvaluationDeps {
  const capability = options?.capability ?? resolveBrowserRuntimeCapability();
  const runRuntimeCheck =
    options?.runRuntimeCheck ??
    createBrowserRuntimeCheck({ capability, artifactId: options?.artifactId });
  return Object.freeze({
    capability,
    runRuntimeCheck,
  });
}
