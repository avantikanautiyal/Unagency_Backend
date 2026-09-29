/**
 * Phase 14 — Canonical Action Registry assembly + resolution.
 * Declarative catalog only — no executeAction.
 */

import { buildArtifactActionDefinitions } from "./from-artifact";
import { buildCapabilityActionDefinitions } from "./from-capability";
import { buildCdfPhaseActions, buildCdfTransitionActions } from "./from-cdf";
import { buildCtiActionDefinitions } from "./from-cti";
import type {
  ActionDefinition,
  ResolveActionResult,
} from "./types";
import { ACTION_REGISTRY_CONTRACT_VERSION } from "./types";

let _catalog: ActionDefinition[] | undefined;
let _byId: Map<string, ActionDefinition[]> | undefined;

function ensureCatalog(): {
  catalog: ActionDefinition[];
  byId: Map<string, ActionDefinition[]>;
} {
  if (_catalog && _byId) return { catalog: _catalog, byId: _byId };
  const catalog = [
    ...buildCdfTransitionActions(),
    ...buildCdfPhaseActions(),
    ...buildCtiActionDefinitions(),
    ...buildArtifactActionDefinitions(),
    ...buildCapabilityActionDefinitions(),
    // Canonical semantic example (no prior registry) — disabled for resolver tests.
    {
      actionId: "canonical.semantic.disabled_example",
      version: "1.0.0",
      displayName: "Disabled Example",
      description: "Test-only disabled canonical semantic action.",
      domain: "canonical",
      actionType: "deterministic_operation" as const,
      executionMode: "DETERMINISTIC_EXECUTION" as const,
      inputContract: { required: [], optional: [] },
      outputContract: { kind: "none" as const },
      requiredContext: [],
      optionalContext: [],
      authorizationRequirements: [],
      sideEffectLevel: "NONE" as const,
      deterministic: true,
      supportsDryRun: true,
      sourceRegistry: "canonical_semantic" as const,
      sourceReference: "Phase14.test.disabled_example",
      enabled: false,
      metadata: { testOnly: true },
    },
    // Second version of a semantic action to prove version selection (no silent downgrade).
    {
      actionId: "canonical.semantic.versioned_example",
      version: "1.0.0",
      displayName: "Versioned Example v1",
      description: "Test-only versioned action v1.",
      domain: "canonical",
      actionType: "deterministic_operation" as const,
      executionMode: "DETERMINISTIC_EXECUTION" as const,
      inputContract: { required: [], optional: [] },
      outputContract: { kind: "none" as const },
      requiredContext: [],
      optionalContext: [],
      authorizationRequirements: [],
      sideEffectLevel: "NONE" as const,
      deterministic: true,
      supportsDryRun: true,
      sourceRegistry: "canonical_semantic" as const,
      sourceReference: "Phase14.test.versioned_example@1.0.0",
      enabled: true,
      metadata: { testOnly: true },
    },
    {
      actionId: "canonical.semantic.versioned_example",
      version: "2.0.0",
      displayName: "Versioned Example v2",
      description: "Test-only versioned action v2.",
      domain: "canonical",
      actionType: "deterministic_operation" as const,
      executionMode: "DETERMINISTIC_EXECUTION" as const,
      inputContract: { required: [], optional: [] },
      outputContract: { kind: "none" as const },
      requiredContext: [],
      optionalContext: [],
      authorizationRequirements: [],
      sideEffectLevel: "NONE" as const,
      deterministic: true,
      supportsDryRun: true,
      sourceRegistry: "canonical_semantic" as const,
      sourceReference: "Phase14.test.versioned_example@2.0.0",
      enabled: true,
      metadata: { testOnly: true },
    },
  ];
  // Integrity: actionId@version unique
  const seen = new Set<string>();
  for (const a of catalog) {
    const key = `${a.actionId}@${a.version}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate ActionDefinition: ${key}`);
    }
    seen.add(key);
    // Security: no raw prompts / secrets in definitions
    const blob = JSON.stringify(a);
    if (/"prompt"\s*:/.test(blob) && a.metadata?.rawPrompt) {
      throw new Error(`ActionDefinition must not embed raw prompts: ${a.actionId}`);
    }
  }
  const byId = new Map<string, ActionDefinition[]>();
  for (const a of catalog) {
    const list = byId.get(a.actionId) ?? [];
    list.push(a);
    byId.set(a.actionId, list);
  }
  // Sort versions lexically for stable "current" pick (semver-compatible for 1.0.0)
  for (const [id, list] of byId) {
    list.sort((x, y) => y.version.localeCompare(x.version));
    byId.set(id, list);
  }
  _catalog = catalog;
  _byId = byId;
  return { catalog, byId };
}

/** Test helper — rebuild catalog. */
export function resetActionRegistryForTests(): void {
  _catalog = undefined;
  _byId = undefined;
}

export function listAllActionDefinitions(): readonly ActionDefinition[] {
  return ensureCatalog().catalog;
}

/**
 * Resolve an action by id and optional version.
 * - exact version → exact definition
 * - no version → current (highest version string) supported definition
 * - unknown → typed failure
 * - unsupported version → typed failure (no silent downgrade)
 * - disabled → ACTION_DISABLED
 */
export function resolveAction(
  actionId: string,
  version?: string,
): ResolveActionResult {
  const { byId } = ensureCatalog();
  const versions = byId.get(actionId);
  if (!versions?.length) {
    return {
      ok: false,
      code: "UNKNOWN_ACTION",
      message: `Unknown action: ${actionId}`,
      actionId,
      version,
    };
  }
  const availableVersions = versions.map((v) => v.version);
  let hit: ActionDefinition | undefined;
  if (version != null && version !== "") {
    hit = versions.find((v) => v.version === version);
    if (!hit) {
      return {
        ok: false,
        code: "UNSUPPORTED_VERSION",
        message: `Unsupported version ${version} for action ${actionId}`,
        actionId,
        version,
        availableVersions,
      };
    }
  } else {
    hit = versions[0];
  }
  if (!hit.enabled) {
    return {
      ok: false,
      code: "ACTION_DISABLED",
      message: `Action disabled: ${actionId}@${hit.version}`,
      actionId,
      version: hit.version,
      availableVersions,
    };
  }
  return { ok: true, action: hit };
}

export type ActionDiscoveryContext = {
  readonly organizationId?: string;
  readonly serviceId?: string;
  readonly includeDisabled?: boolean;
};

/**
 * Safe metadata discovery — returns ActionDefinitions filtered by context.
 * Does not expose secrets, bodies, or prompts. Does not execute.
 */
export function listAvailableActions(
  context: ActionDiscoveryContext = {},
): readonly ActionDefinition[] {
  let list = [...ensureCatalog().catalog];
  if (!context.includeDisabled) {
    list = list.filter((a) => a.enabled);
  }
  if (context.serviceId) {
    const sid = context.serviceId;
    list = list.filter(
      (a) =>
        a.domain === "cdf" ||
        a.domain === `cdf.${sid}` ||
        a.domain === "cti" ||
        a.domain === "artifact" ||
        a.domain === "capability" ||
        (typeof a.metadata.serviceId === "string" &&
          a.metadata.serviceId === sid),
    );
  }
  // Strip nothing further — definitions already omit sensitive bodies.
  return list;
}

export function getActionRegistryContractVersion(): string {
  return ACTION_REGISTRY_CONTRACT_VERSION;
}

/** Coverage helper: generation action IDs for a CDF service. */
export function listGenerationActionsForService(
  serviceId: string,
): readonly ActionDefinition[] {
  return listAllActionDefinitions().filter(
    (a) =>
      a.domain === `cdf.${serviceId}` &&
      a.executionMode === "MODEL_GENERATION",
  );
}
