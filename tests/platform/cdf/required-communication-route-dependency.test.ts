/**
 * Live bug (session cdf_mv1457sc_920h3057): store-display posm-family failed
 * CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT for all 3 options before provider
 * invocation. posm-family declared only `store-mockup` (an image artifact with
 * no message fields), so the selected Retail Routes direction — the message
 * authority — was never an upstream input. Same shape as the print-ooh
 * adaptations and packaging front-pack fixes.
 *
 * Invariant: every phase whose deliverable requires exact on-asset rendered
 * communication declares a direct dependency on its service's text-choice
 * (routes) phase.
 */

import {
  resolveDeliverableCompositionContract,
  requiredExactRenderedCommunicationElements,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/registry";
import { compileDeliverableComposition } from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { assertRequiredCommunicationValuesResolved } from "../../../src/platform/cdf/generation-context/composition-authority";
import {
  ROUTE_MESSAGE_FIELDS,
  resolveCdfStructuredOutputStamp,
  resolveStructuredOutputSchemaByContractName,
  routesFeedRequiredRenderedCommunication,
} from "../../../src/platform/cdf/structured-output-contract";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { parseAndValidateJson } from "../../../src/platform/providers/tools/schema/json-schema-validator";
import { coerceTowardDeclaredSchema } from "../../../src/platform/providers/tools/structured/structured-output-coerce";

type Phase = {
  phaseId: string;
  deliverableKind?: string;
  dependencies: { phaseId: string }[];
  artifact: { artifactType?: string };
};

function phasesRequiringExactCommunication() {
  const rows: { serviceId: string; phase: Phase; routePhaseIds: string[] }[] = [];
  for (const serviceId of listCdfCanonicalServiceIds()) {
    const phases = resolveCdfCanonicalService(serviceId)!.phases as unknown as Phase[];
    const routePhaseIds = phases
      .filter((p) => p.artifact?.artifactType === "text_choice")
      .map((p) => p.phaseId);
    for (const phase of phases) {
      if (!phase.deliverableKind) continue;
      const contract = resolveDeliverableCompositionContract(phase.deliverableKind as never);
      if (!contract || requiredExactRenderedCommunicationElements(contract).length === 0) continue;
      rows.push({ serviceId, phase, routePhaseIds });
    }
  }
  return rows;
}

const ROUTE = {
  name: "Shelf Stopper",
  creativeIdea: "A bold counter unit that stops shoppers mid-aisle.",
  communicationObjective: "Make the launch impossible to miss at the counter.",
  primaryMessage: "Crafted to shine",
  secondaryMessage: "Discover the new silver collection",
};

describe("required on-asset communication — routes dependency", () => {
  const rows = phasesRequiringExactCommunication();

  it("covers the phases from the live bug", () => {
    const ids = rows.map((r) => `${r.serviceId}.${r.phase.phaseId}`);
    for (const id of [
      "store-display.posm-family",
      "packaging.complete-pack",
      "packaging.sku-adaptations",
      "emailers.responsive",
      "event-branding.touchpoints",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it.each(rows.map((r) => [`${r.serviceId}.${r.phase.phaseId}`, r] as const))(
    "%s declares a direct dependency on a routes (text-choice) phase",
    (_id, row) => {
      const deps = row.phase.dependencies.map((d) => d.phaseId);
      expect(row.routePhaseIds.length).toBeGreaterThan(0);
      expect(deps.some((d) => row.routePhaseIds.includes(d))).toBe(true);
    },
  );

  it.each(rows.map((r) => [`${r.serviceId}.${r.phase.phaseId}`, r] as const))(
    "%s resolves its message surface from the selected route",
    (_id, row) => {
      const kind = row.phase.deliverableKind!;
      const contract = resolveDeliverableCompositionContract(kind as never)!;
      const routesPhaseId = row.routePhaseIds[0]!;
      const compiled = compileDeliverableComposition({
        deliverableKind: kind as never,
        contract,
        selectedChoice: {
          phaseId: routesPhaseId,
          artifactId: "cdfart_routes",
          version: 1,
          artifactKey: `${row.serviceId}.${routesPhaseId}`,
          selectedRouteIndex: 0,
          optionNumber: 1,
          label: "Choice 1",
          choiceArrayKey: "routes",
          choice: ROUTE,
          semanticFieldNames: Object.keys(ROUTE),
        },
        currentUserInstruction: "Generate this phase.",
        currentUserInstructionAuthority: "phase_prompt",
        generationModality: "image",
      });
      expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(true);
    },
  );
});

type Schema = {
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  type?: string;
  minItems?: number;
};

function sample(schema: Schema | undefined): unknown {
  if (schema?.type === "array") return [];
  if (schema?.type === "object" || schema?.properties) {
    return Object.fromEntries(
      (schema.required ?? []).map((k) => [k, sample(schema.properties?.[k])]),
    );
  }
  return "x";
}

function routesPayload(schema: Schema, omit: readonly string[] = []) {
  const item = sample(schema.properties!.routes!.items) as Record<string, unknown>;
  for (const k of omit) delete item[k];
  const top = sample(schema) as Record<string, unknown>;
  top.routes = Array.from({ length: 3 }, () => ({ ...item }));
  return JSON.stringify(top);
}

function textChoicePhases() {
  const rows: { serviceId: string; phaseId: string }[] = [];
  for (const serviceId of listCdfCanonicalServiceIds()) {
    for (const p of resolveCdfCanonicalService(serviceId)!.phases as unknown as Phase[]) {
      if (p.artifact?.artifactType === "text_choice") rows.push({ serviceId, phaseId: p.phaseId });
    }
  }
  return rows;
}

describe("route emission schema — message required when it feeds rendered copy", () => {
  const routePhases = textChoicePhases().map((r) => {
    const contract = resolveCdfPhaseExecutionContract(r)!;
    return {
      ...r,
      id: `${r.serviceId}.${r.phaseId}`,
      contract,
      feeds: routesFeedRequiredRenderedCommunication(contract),
      stamp: resolveCdfStructuredOutputStamp({ contract }),
    };
  });
  const feeding = routePhases.filter((r) => r.feeds && r.stamp);
  const notFeeding = routePhases.filter((r) => !r.feeds && r.stamp);

  it("covers the route phases behind the live failures", () => {
    const ids = feeding.map((r) => r.id);
    for (const id of ["web-tech.ui-routes", "store-display.routes", "packaging.routes"]) {
      expect(ids).toContain(id);
    }
  });

  it.each(feeding.map((r) => [r.id, r] as const))(
    "%s schema requires a route message field",
    (_id, r) => {
      const items = (r.stamp!.schema as Schema).properties?.routes?.items;
      expect(items?.required?.some((f) => (ROUTE_MESSAGE_FIELDS as readonly string[]).includes(f))).toBe(true);
    },
  );

  it.each(feeding.map((r) => [r.id, r] as const))(
    "%s rejects routes without a message and accepts routes with one",
    (_id, r) => {
      const schema = r.stamp!.schema as Schema;
      const required = schema.properties!.routes!.items!.required!;
      const messageFields = required.filter((f) =>
        (ROUTE_MESSAGE_FIELDS as readonly string[]).includes(f),
      );
      expect(parseAndValidateJson(routesPayload(schema), schema as never).ok).toBe(true);
      expect(parseAndValidateJson(routesPayload(schema, messageFields), schema as never).ok).toBe(false);
    },
  );

  it.each(notFeeding.map((r) => [r.id, r] as const))(
    "%s keeps its registered schema unchanged",
    (_id, r) => {
      const registered = resolveStructuredOutputSchemaByContractName(
        r.contract.structuredOutputContract!.name,
      )!;
      expect(r.stamp!.schema).toBe(registered.schema);
    },
  );

  it("fills primaryMessage from a headline alias instead of rejecting the route", () => {
    const schema = resolveCdfStructuredOutputStamp({
      serviceId: "web-tech",
      phaseId: "ui-routes",
    })!.schema as Schema;
    const parsed = JSON.parse(routesPayload(schema, ["primaryMessage"])) as {
      routes: Record<string, unknown>[];
    };
    for (const route of parsed.routes) route.headline = "Built for the long run";
    const coerced = coerceTowardDeclaredSchema(parsed, schema as never) as {
      routes: { primaryMessage?: string }[];
    };
    expect(coerced.routes[0]!.primaryMessage).toBe("Built for the long run");
    expect(parseAndValidateJson(JSON.stringify(coerced), schema as never).ok).toBe(true);
  });
});
