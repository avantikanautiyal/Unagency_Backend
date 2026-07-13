/**
 * Playground route manifest.
 * Development-only scaffolding — not mounted on the Express app in M0.
 * No UI. No AI execution.
 */

export interface PlaygroundRouteDefinition {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly description: string;
  readonly enabledInM0: false;
}

export const playgroundRouteManifest: readonly PlaygroundRouteDefinition[] = [
  {
    method: "GET",
    path: "/intelligence/playground/health",
    description: "Playground health probe (future).",
    enabledInM0: false,
  },
  {
    method: "GET",
    path: "/intelligence/playground/capabilities",
    description: "List registered capabilities for manual testing (future).",
    enabledInM0: false,
  },
  {
    method: "POST",
    path: "/intelligence/playground/invoke",
    description: "Invoke a capability in isolation (future).",
    enabledInM0: false,
  },
] as const;
