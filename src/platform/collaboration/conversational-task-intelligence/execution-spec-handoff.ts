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

/** Client-provided execution spec from a prior turn resolution (P4.9.1). */
export function readClientExecutionSpecHandoff(
  metadata?: Readonly<Record<string, unknown>>,
): CanonicalExecutionSpecification | undefined {
  return readHandoffSpec(metadata);
}

export function resolveParentExecutionIdFromContinuationMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  const parent =
    typeof metadata?.parentExecutionId === "string"
      ? metadata.parentExecutionId.trim()
      : "";
  if (parent && !parent.startsWith("direct_routes_")) return parent;

  const retried =
    typeof metadata?.retriedFrom === "string"
      ? metadata.retriedFrom.trim()
      : "";
  if (retried && !retried.startsWith("direct_routes_")) return retried;

  const duplicated =
    typeof metadata?.duplicatedFrom === "string"
      ? metadata.duplicatedFrom.trim()
      : "";
  if (duplicated && !duplicated.startsWith("direct_routes_")) return duplicated;

  const refine =
    typeof metadata?.refineFromExecutionId === "string"
      ? metadata.refineFromExecutionId.trim()
      : "";
  return refine && !refine.startsWith("direct_routes_") ? refine : undefined;
}

export function resolveParentExecutionIdFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | undefined {
  return resolveParentExecutionIdFromContinuationMetadata(metadata);
}

/** Load client handoff or parent execution spec snapshot (no stamping). */
export async function readInheritedExecutionSpec(input: {
  readonly host: {
    loadExecution(executionId: string): Promise<
      | {
          metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined
    >;
    loadExecutionCreateMetadata?(
      executionId: string,
    ): Promise<Readonly<Record<string, unknown>> | undefined>;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<CanonicalExecutionSpecification | undefined> {
  const handoff = readHandoffSpec(input.metadata);
  if (handoff) return handoff;
  const parentId = resolveParentExecutionIdFromMetadata(input.metadata);
  if (!parentId) return undefined;
  try {
    if (input.host.loadExecutionCreateMetadata) {
      const createMeta = await input.host.loadExecutionCreateMetadata(parentId);
      const fromCreate = readExecutionSpecSnapshot(createMeta)?.spec;
      if (fromCreate) return fromCreate;
    }
    const parent = await input.host.loadExecution(parentId);
    return readExecutionSpecSnapshot(
      parent?.metadata as Record<string, unknown> | undefined,
    )?.spec;
  } catch {
    return undefined;
  }
}

export async function applyExecutionSpecHandoff(input: {
  readonly host: {
    loadExecution(executionId: string): Promise<
      | {
          metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined
    >;
    loadExecutionCreateMetadata?(
      executionId: string,
    ): Promise<Readonly<Record<string, unknown>> | undefined>;
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
    loadExecutionCreateMetadata?(
      executionId: string,
    ): Promise<Readonly<Record<string, unknown>> | undefined>;
  },
  metadata: Readonly<Record<string, unknown>>,
): Promise<CanonicalExecutionSpecification | undefined> {
  const parentId = resolveParentExecutionIdFromMetadata(metadata);
  if (!parentId) return undefined;
  try {
    if (host.loadExecutionCreateMetadata) {
      const createMeta = await host.loadExecutionCreateMetadata(parentId);
      const fromCreate = readExecutionSpecSnapshot(createMeta)?.spec;
      if (fromCreate) return fromCreate;
    }
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
