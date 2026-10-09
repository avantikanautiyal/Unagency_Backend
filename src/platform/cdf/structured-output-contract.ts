/**
 * Generic CDF invariant: canonical phases that require structured emission
 * must carry a resolvable output schema before provider dispatch, or fail closed.
 *
 * Architecture:
 *   CDF phase definition.structuredOutputContract.name
 *     → schema module registry (by contract name)
 *     → stamped structuredOutput { name, schema, strict }
 *
 * Applies to:
 * - generationModality = structured
 * - semanticRole = text_choice (routes/directions — still canonical Artifact.data)
 *
 * Source of truth: phase execution contract (registry). Schema bodies live in
 * delivery schema modules — this module maps contract name → schema object.
 */

import { ValidationError } from "../core/errors";
import {
  CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
  GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA,
  PACKAGING_ROUTES_STRUCTURED_SCHEMA,
  SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
} from "../os/delivery/cdf-text-choice-schemas";
import {
  CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  CDF_STRUCTURED_APPROVAL_DOC_SCHEMA,
} from "../os/delivery/cdf-structured-approval-schemas";
import {
  CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
  CDF_WEBSITE_SITEMAP_SCHEMA,
} from "../os/delivery/cdf-website-sitemap-schemas";
import {
  CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
  CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA,
} from "../os/delivery/cdf-website-page-structure-schemas";
import {
  CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
  CDF_WEBSITE_WIREFRAME_SCHEMA,
} from "../os/delivery/cdf-website-wireframe-schemas";
import { EMAIL_PLAN_STRUCTURED_SCHEMA } from "../os/delivery/email-schemas";
import {
  PRESENTATION_ROUTES_STRUCTURED_SCHEMA,
  PRESENTATION_SLIDE_CONTENT_STRUCTURED_SCHEMA,
  PRESENTATION_STORYLINE_STRUCTURED_SCHEMA,
} from "../os/delivery/presentation-schemas";
import {
  resolveDeliverableCompositionContract,
  requiredExactRenderedCommunicationElements,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  resolveCdfCanonicalService,
  resolveCdfPhaseExecutionContract,
  type CdfPhaseExecutionContract,
} from "./canonical";
import {
  CDF_STRUCTURED_CONTRACT_CONFLICT,
  CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE,
} from "./structured-execution-result";

export type CdfStructuredOutputStamp = {
  readonly name: string;
  readonly schema: Record<string, unknown>;
  readonly strict: boolean;
};

/** Contract predicate — structured modality only (subset of emission). */
export function requiresCanonicalStructuredSchema(
  contract: Pick<
    CdfPhaseExecutionContract,
    "executionStrategy" | "generationModality" | "structuredEmission"
  >,
): boolean {
  if (contract.structuredEmission === "none") return false;
  return (
    contract.executionStrategy === "canonical" &&
    contract.generationModality === "structured"
  );
}

/**
 * Contract predicate — any canonical phase whose ArtifactVersion requires
 * structured emission (structured docs OR text_choice route sets).
 * Respects declarative structuredEmission === 'none'.
 * No serviceId / phaseId branches.
 */
export function requiresCanonicalEmissionSchema(
  contract: Pick<
    CdfPhaseExecutionContract,
    | "executionStrategy"
    | "generationModality"
    | "semanticRole"
    | "structuredEmission"
  >,
): boolean {
  if (contract.executionStrategy !== "canonical") return false;
  if (contract.structuredEmission === "none") return false;
  if (contract.generationModality === "structured") return true;
  if (contract.semanticRole === "text_choice") return true;
  return false;
}

/**
 * True when metadata stamps resolve to a canonical emission phase contract.
 */
export function isCanonicalStructuredPhaseMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  const contract = resolveContractFromMetadata(metadata);
  return contract != null && requiresCanonicalEmissionSchema(contract);
}

export function hasUsableStructuredOutputSchema(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  const so = metadata.structuredOutput;
  if (!so || typeof so !== "object") return false;
  const schema = (so as { schema?: unknown }).schema;
  return schema != null && typeof schema === "object";
}

/**
 * Schema module registry keyed by declarative contract name (not service/phase).
 */
const SCHEMA_BY_CONTRACT_NAME: Readonly<
  Record<string, Omit<CdfStructuredOutputStamp, "name"> & { name: string }>
> = {
  CdfPresentationStoryline: {
    name: "CdfPresentationStoryline",
    schema: PRESENTATION_STORYLINE_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  CdfPresentationSlideContent: {
    name: "CdfPresentationSlideContent",
    schema: PRESENTATION_SLIDE_CONTENT_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  PresentationRoutes: {
    name: "PresentationRoutes",
    schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  EmailPlan: {
    name: "EmailPlan",
    schema: EMAIL_PLAN_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
    strict: true,
  },
  CdfSocialMediaRoutes: {
    name: "CdfSocialMediaRoutes",
    schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  CdfPackagingRoutes: {
    name: "CdfPackagingRoutes",
    schema: PACKAGING_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  [CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME]: {
    name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
    schema: GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  [CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME]: {
    name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
    schema: CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  [CDF_WEBSITE_SITEMAP_CONTRACT_NAME]: {
    name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
    schema: CDF_WEBSITE_SITEMAP_SCHEMA as unknown as Record<string, unknown>,
    strict: true,
  },
  [CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME]: {
    name: CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
    schema: CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  },
  [CDF_WEBSITE_WIREFRAME_CONTRACT_NAME]: {
    name: CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
    schema: CDF_WEBSITE_WIREFRAME_SCHEMA as unknown as Record<string, unknown>,
    strict: true,
  },
};

export function resolveStructuredOutputSchemaByContractName(
  name: string | null | undefined,
): CdfStructuredOutputStamp | undefined {
  const key = name?.trim();
  if (!key) return undefined;
  return SCHEMA_BY_CONTRACT_NAME[key];
}

export function resolveCdfStructuredOutputStamp(input: {
  serviceId?: string | null;
  phaseId?: string | null;
  artifactKey?: string | null;
  contract?: CdfPhaseExecutionContract;
}): CdfStructuredOutputStamp | undefined {
  const contract =
    input.contract ??
    resolveCdfPhaseExecutionContract({
      serviceId: input.serviceId,
      phaseId: input.phaseId,
    });
  if (!contract || !requiresCanonicalEmissionSchema(contract)) {
    return undefined;
  }
  // Prefer declarative contract name from the phase registry.
  const declared = contract.structuredOutputContract;
  if (declared?.name) {
    const fromName = resolveStructuredOutputSchemaByContractName(declared.name);
    if (fromName) {
      return {
        name: declared.name,
        schema: routesFeedRequiredRenderedCommunication(contract)
          ? withRequiredRouteMessage(fromName.schema)
          : fromName.schema,
        strict: declared.strict ?? fromName.strict,
      };
    }
  }
  return undefined;
}

/** Route fields the composition compiler accepts as the primary on-asset message. */
export const ROUTE_MESSAGE_FIELDS = [
  "primaryMessage",
  "headlineAngle",
  "communicationObjective",
  "messaging",
] as const;

/**
 * A selected route is the only authority for required on-asset copy
 * (CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT), so a text_choice phase that a
 * downstream exact-communication deliverable depends on must emit a message.
 */
export function routesFeedRequiredRenderedCommunication(
  contract: Pick<CdfPhaseExecutionContract, "serviceId" | "phaseId" | "semanticRole">,
): boolean {
  if (contract.semanticRole !== "text_choice") return false;
  const phases = (resolveCdfCanonicalService(contract.serviceId)?.phases ??
    []) as unknown as readonly {
    deliverableKind?: string;
    dependencies?: readonly { phaseId: string }[];
  }[];
  return phases.some((p) => {
    if (!p.deliverableKind) return false;
    if (!p.dependencies?.some((d) => d.phaseId === contract.phaseId)) return false;
    const composition = resolveDeliverableCompositionContract(
      p.deliverableKind as never,
    );
    return (
      composition != null &&
      requiredExactRenderedCommunicationElements(composition).length > 0
    );
  });
}

function withRequiredRouteMessage(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const props = schema.properties as Record<string, unknown> | undefined;
  const routes = props?.routes as Record<string, unknown> | undefined;
  const items = routes?.items as Record<string, unknown> | undefined;
  const itemProps = items?.properties as Record<string, unknown> | undefined;
  if (!routes || !items || !itemProps) return schema;
  const required = Array.isArray(items.required)
    ? (items.required as string[])
    : [];
  if (required.some((f) => (ROUTE_MESSAGE_FIELDS as readonly string[]).includes(f))) {
    return schema;
  }
  return {
    ...schema,
    properties: {
      ...props,
      routes: {
        ...routes,
        items: {
          ...items,
          properties: itemProps.primaryMessage
            ? itemProps
            : { ...itemProps, primaryMessage: { type: "string" } },
          required: [...required, "primaryMessage"],
        },
      },
    },
  };
}

function resolveContractFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
): CdfPhaseExecutionContract | undefined {
  const serviceId =
    typeof metadata.cdfServiceId === "string" ? metadata.cdfServiceId : null;
  const phaseId =
    typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId : null;
  return resolveCdfPhaseExecutionContract({ serviceId, phaseId });
}

/**
 * Stamp phase emission schema from the declarative CDF contract.
 * Overwrites incompatible client/product schemas when names differ.
 *
 * Never silently replaces a declared phase contract with a generic fallback.
 * If the stamped name would disagree with the phase declaration → fail closed
 * via assertCanonicalStructuredContractAuthority (caller).
 */
export function stampCanonicalStructuredOutputMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(metadata ?? {}) };
  const contract = resolveContractFromMetadata(meta);
  if (!contract || !requiresCanonicalEmissionSchema(contract)) {
    return meta;
  }
  const stamp = resolveCdfStructuredOutputStamp({ contract });
  if (!stamp) {
    meta.cdfStructuredContractResolutionFailure = {
      reason: CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE,
      serviceId: contract.serviceId,
      phaseId: contract.phaseId,
      artifactKey: contract.artifactKey,
      declaredContract: contract.structuredOutputContract?.name ?? null,
      resolutionSource: "phase_contract",
    };
    return meta;
  }
  const existing = meta.structuredOutput;
  const existingName =
    existing &&
    typeof existing === "object" &&
    typeof (existing as { name?: unknown }).name === "string"
      ? String((existing as { name: string }).name)
      : undefined;
  // Phase declaration always wins — overwrite any client/product/generic schema.
  if (hasUsableStructuredOutputSchema(meta) && existingName === stamp.name) {
    meta.cdfAuthorityStructuredOutputName = stamp.name;
    return meta;
  }
  meta.structuredOutput = {
    name: stamp.name,
    schema: stamp.schema,
    strict: stamp.strict,
  };
  meta.cdfStructuredOutputStamped = true;
  meta.cdfAuthorityStructuredOutputName = stamp.name;
  // Clear prior conflict stamps — authority reasserted from phase contract.
  delete meta.cdfStructuredContractConflict;
  return meta;
}

/**
 * Fail closed when stamped / request / phase contracts disagree for emission phases.
 */
export function assertCanonicalStructuredContractAuthority(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CanonicalStructuredSchemaAssertOk | CanonicalStructuredSchemaAssertFail {
  if (!metadata) return { ok: true };
  const contract = resolveContractFromMetadata(metadata);
  if (!contract || !requiresCanonicalEmissionSchema(contract)) {
    return { ok: true };
  }
  const declared = contract.structuredOutputContract?.name?.trim();
  if (!declared) {
    return {
      ok: false,
      error: new ValidationError(
        `Canonical CDF phase missing structuredOutputContract (serviceId=${contract.serviceId} phaseId=${contract.phaseId})`,
        {
          reason: CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE,
          serviceId: contract.serviceId,
          phaseId: contract.phaseId,
          artifactKey: contract.artifactKey,
          declaredContract: null,
          resolvedContract: null,
          schemaVersion: null,
          resolutionSource: "phase_contract",
        },
      ),
    };
  }
  const stamp = resolveCdfStructuredOutputStamp({ contract });
  if (!stamp) {
    return {
      ok: false,
      error: new ValidationError(
        `Canonical CDF structured contract not registered in schema catalog: ${declared}`,
        {
          reason: CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE,
          serviceId: contract.serviceId,
          phaseId: contract.phaseId,
          artifactKey: contract.artifactKey,
          declaredContract: declared,
          resolvedContract: null,
          schemaVersion: contract.structuredOutputContract?.version ?? "1",
          resolutionSource: "schema_catalog",
        },
      ),
    };
  }
  const so = metadata.structuredOutput;
  const stampedName =
    so &&
    typeof so === "object" &&
    typeof (so as { name?: unknown }).name === "string"
      ? String((so as { name: string }).name).trim()
      : undefined;
  if (stampedName && stampedName !== declared) {
    return {
      ok: false,
      error: new ValidationError(
        `CDF structured contract conflict: declared=${declared} resolved=${stampedName}`,
        {
          reason: CDF_STRUCTURED_CONTRACT_CONFLICT,
          serviceId: contract.serviceId,
          phaseId: contract.phaseId,
          artifactKey: contract.artifactKey,
          declaredContract: declared,
          resolvedContract: stampedName,
          schemaVersion: contract.structuredOutputContract?.version ?? "1",
          resolutionSource: "structuredOutput_stamp",
        },
      ),
    };
  }
  if (metadata.cdfStructuredContractConflict) {
    const c = metadata.cdfStructuredContractConflict as Record<string, unknown>;
    return {
      ok: false,
      error: new ValidationError(
        `CDF structured contract conflict: declared=${String(c.declaredContract)} resolved=${String(c.resolvedContract)}`,
        {
          reason: CDF_STRUCTURED_CONTRACT_CONFLICT,
          ...c,
        },
      ),
    };
  }
  return { ok: true };
}

export type CanonicalStructuredSchemaAssertOk = { ok: true };
export type CanonicalStructuredSchemaAssertFail = {
  ok: false;
  error: ValidationError;
};

/**
 * Earliest reliable DirectEngine boundary check before provider dispatch.
 */
export function assertCanonicalStructuredSchemaBeforeProvider(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CanonicalStructuredSchemaAssertOk | CanonicalStructuredSchemaAssertFail {
  if (!metadata) return { ok: true };
  const contract = resolveContractFromMetadata(metadata);
  if (!contract || !requiresCanonicalEmissionSchema(contract)) {
    return { ok: true };
  }
  const authority = assertCanonicalStructuredContractAuthority(metadata);
  if (!authority.ok) return authority;
  if (hasUsableStructuredOutputSchema(metadata)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: new ValidationError(
      `Canonical CDF phase requires structured emission schema before provider (serviceId=${contract.serviceId} phaseId=${contract.phaseId} artifactKey=${contract.artifactKey} semanticRole=${contract.semanticRole})`,
      {
        reason: "CDF_EMISSION_SCHEMA_REQUIRED",
        serviceId: contract.serviceId,
        phaseId: contract.phaseId,
        artifactKey: contract.artifactKey,
        executionStrategy: contract.executionStrategy,
        generationModality: contract.generationModality,
        semanticRole: contract.semanticRole,
        structuredOutputContractName:
          contract.structuredOutputContract?.name,
      },
    ),
  };
}

/** Test/helper: list registered contract schema names. */
export function listRegisteredCanonicalStructuredContractNames(): readonly string[] {
  return Object.keys(SCHEMA_BY_CONTRACT_NAME);
}

/** @deprecated use listRegisteredCanonicalStructuredContractNames */
export function listRegisteredCanonicalStructuredArtifactKeys(): readonly string[] {
  return listRegisteredCanonicalStructuredContractNames();
}
