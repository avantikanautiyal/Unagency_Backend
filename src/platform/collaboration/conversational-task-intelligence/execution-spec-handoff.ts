/**
 * P4.8.1 — Stamp immutable execution spec snapshots onto create metadata.
 * Supports client handoff, conversation resolution, and parent inheritance.
 */

import type { CanonicalExecutionSpecification } from "./execution-specification";
import {
  readExecutionSpecSnapshot,
  stampExecutionSpecMetadata,
} from "./execution-spec-snapshot";
import { isRouteVisualProductAction } from "./requirement-constraint-trace";

function readHandoffSpec(
  metadata?: Readonly<Record<string, unknown>>,
): CanonicalExecutionSpecification | undefined {
  const raw = metadata?.executionSpecHandoff;
  if (!raw || typeof raw !== "object") return undefined;
  const spec = raw as CanonicalExecutionSpecification;
  if (typeof spec.executionInstruction !== "string") return undefined;
  return spec;
}

function resolveParentExecutionId(
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  const parent =
    typeof metadata?.parentExecutionId === "string"
      ? metadata.parentExecutionId.trim()
      : "";
  if (parent && !parent.startsWith("direct_routes_")) return parent;
  const refine =
    typeof metadata?.refineFromExecutionId === "string"
      ? metadata.refineFromExecutionId.trim()
      : "";
  return refine && !refine.startsWith("direct_routes_") ? refine : undefined;
}

export async function applyExecutionSpecHandoff(input: {
  readonly host: {
    loadExecution(executionId: string): Promise<
      | {
          metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined
    >;
    deps: {
      nowIso: () => string;
      createId: (prefix: string) => string;
    };
  };
  readonly executionId: string;
  readonly metadata?: Record<string, unknown>;
  readonly conversationSpec?: CanonicalExecutionSpecification;
}): Promise<Record<string, unknown>> {
  let working = { ...(input.metadata ?? {}) };

  if (readExecutionSpecSnapshot(working)) {
    return working;
  }

  const handoffSpec = readHandoffSpec(working);
  const spec =
    input.conversationSpec ??
    handoffSpec ??
    (await inheritSpecFromParentExecution(input.host, working));

  if (!spec) return working;

  working = stampExecutionSpecMetadata(working, {
    executionId: input.executionId,
    spec,
    nowIso: input.host.deps.nowIso,
    createId: input.host.deps.createId,
  });

  if (handoffSpec) {
    const { executionSpecHandoff: _removed, ...rest } = working;
    working = rest;
  }

  return working;
}

async function inheritSpecFromParentExecution(
  host: {
    loadExecution(executionId: string): Promise<
      | {
          metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined
    >;
  },
  metadata: Readonly<Record<string, unknown>>,
): Promise<CanonicalExecutionSpecification | undefined> {
  const parentId = resolveParentExecutionId(metadata);
  if (!parentId) return undefined;
  try {
    const parent = await host.loadExecution(parentId);
    return readExecutionSpecSnapshot(
      parent?.metadata as Record<string, unknown> | undefined,
    )?.spec;
  } catch {
    return undefined;
  }
}

export function shouldSkipEffectiveInstructionPromptReplace(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  return isRouteVisualProductAction(metadata);
}
