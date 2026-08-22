/**
 * Structured-output helpers for provider_runtime (no tool loop required).
 */

import { success, type Result } from "../../../shared/result";
import { asProviderId } from "../../../shared/identifiers";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../runtime/contracts/provider-execution-response";
import type { StructuredOutputRequest } from "../contracts/tool-contracts";
import { parseAndValidateJson } from "../schema/json-schema-validator";
import {
  buildPresentationConceptsInstructionBlock,
  buildPresentationExpansionInstructionBlock,
  buildPresentationRelevanceRetrySuffix,
  buildPresentationRoutesInstructionBlock,
  buildSingleRouteExpansionInstructionBlock,
  conceptsOnlyPresentationMeta,
  conceptRecordAt,
  evaluatePresentationOutputQuality,
  mergeExpandedRouteAtIndex,
  orderPresentationProviderPrompt,
  presentationContextFromMetadata,
  presentationPlanToRouteRecord,
  resolvePresentationExpandMode,
  validatePresentationConceptsRelevance,
  validatePresentationMustUseCoverage,
  validatePresentationRoutesRelevance,
} from "../../../../os/delivery/presentation-generation";
import { verifyAndReinforcePresentationOutput } from "../../../../../services/presentation-verify-reinforce";
import {
  PRESENTATION_PLAN_STRUCTURED_SCHEMA,
  PRESENTATION_ROUTES_STRUCTURED_SCHEMA,
} from "../../../../os/delivery/presentation-schemas";

export function withStructuredOutputRequest(
  request: ProviderExecutionRequest,
  structured: StructuredOutputRequest
): ProviderExecutionRequest {
  const schemaName = structured.name ?? "response";
  const schema = normalizeSchemaForOpenAiStrict(
    structured.schema as Record<string, unknown>,
  );
  const isPresentationRoutes = schemaName === "PresentationRoutes";
  const isPresentationConcepts = schemaName === "PresentationRouteConcepts";
  const isPresentationFlow = isPresentationRoutes || isPresentationConcepts;
  const isPresentationPlan = schemaName === "PresentationPlan";
  const isExpandPresentationRoute =
    isPresentationPlan &&
    request.metadata?.productAction === "expand_presentation_route";
  const isDocumentPlan = schemaName === "DocumentPlan";

  const priorPrompt =
    (typeof request.payload.prompt === "string" && request.payload.prompt) ||
    (typeof request.payload.text === "string" && request.payload.text) ||
    (typeof request.payload.input === "string" && request.payload.input) ||
    "";

  const instructionParts = [
    `Respond with ONLY valid JSON matching schema "${schemaName}".`,
    "Do not wrap the JSON in markdown fences or prose.",
  ];

  if (isPresentationConcepts) {
    const ctx = presentationContextFromMetadata(request.metadata, priorPrompt);
    instructionParts.push(
      buildPresentationConceptsInstructionBlock({
        userBrief: ctx.userBrief,
        brandName: ctx.brandName,
        subtype: ctx.subtype,
        exampleDeliverable: ctx.exampleDeliverable,
        isRetry: request.metadata?.presentationConceptsRetried === true,
      }),
      "Return exactly 3 concepts in concepts[].",
    );
  } else if (isPresentationRoutes) {
    const ctx = presentationContextFromMetadata(request.metadata, priorPrompt);
    instructionParts.push(
      buildPresentationRoutesInstructionBlock({
        userBrief: ctx.userBrief,
        brandName: ctx.brandName,
        subtype: ctx.subtype,
        exampleDeliverable: ctx.exampleDeliverable,
        isRetry: request.metadata?.presentationRelevanceRetried === true,
      }),
      "Return exactly 3 routes in routes[].",
    );
  } else if (isPresentationPlan) {
    if (isExpandPresentationRoute) {
      const ctx = presentationContextFromMetadata(request.metadata, priorPrompt);
      const locked =
        request.metadata?.presentationLockedConcept &&
        typeof request.metadata.presentationLockedConcept === "object"
          ? (request.metadata.presentationLockedConcept as Record<string, unknown>)
          : {};
      instructionParts.push(
        buildSingleRouteExpansionInstructionBlock({
          lockedConcept: locked,
          brandName: ctx.brandName,
          subtype: ctx.subtype,
        }),
        "Return a single designed deck as title, subtitle, slides[].",
      );
    } else {
      instructionParts.push(
        "Produce a designed presentation: varied layouts, concise bullets, strong titles — not plain text pages.",
      );
    }
  } else if (isDocumentPlan) {
    instructionParts.push(
      "Produce a structured multi-section document with clear headings and substantive body copy.",
    );
  } else {
    instructionParts.push(
      "The steps array must contain exactly 3 distinct creative routes (alternative directions on the SAME brief).",
      "Each step.title is a short route name; each step.description is the creative direction for that route.",
    );
  }

  const instruction = instructionParts.join("\n");
  let prompt = priorPrompt ? `${priorPrompt}\n\n${instruction}` : instruction;
  if (isPresentationFlow || isExpandPresentationRoute) {
    const ctx = presentationContextFromMetadata(request.metadata, priorPrompt);
    prompt = orderPresentationProviderPrompt({
      body: prompt,
      brandName: ctx.brandName,
      subtype: ctx.subtype,
      exampleDeliverable: ctx.exampleDeliverable,
      userBrief: ctx.userBrief,
      mustUseFacts: ctx.mustUseFacts,
    });
  }

  const priorFeatures = Array.isArray(
    (request.options as Record<string, unknown> | undefined)?.features
  )
    ? ([
        ...((request.options as Record<string, unknown>).features as string[]),
      ] as string[])
    : [];
  const features = [...new Set([...priorFeatures, "json_mode", "response_format"])];

  return {
    ...request,
    payload: {
      ...request.payload,
      prompt,
      text: prompt,
      input: prompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: structured.strict ?? true,
          schema,
        },
      },
    },
    options: {
      ...(request.options ?? {}),
      features,
    },
  };
}

/**
 * OpenAI strict json_schema requires every key in `properties` to also be listed
 * in `required` (optional fields are not allowed). Walk the schema and enforce that.
 */
export function normalizeSchemaForOpenAiStrict(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;

  const visit = (node: Record<string, unknown>): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object" && node.properties && typeof node.properties === "object") {
      const props = node.properties as Record<string, unknown>;
      node.required = Object.keys(props);
      node.additionalProperties = false;
      for (const child of Object.values(props)) {
        if (child && typeof child === "object") {
          visit(child as Record<string, unknown>);
        }
      }
    }
    if (node.type === "array" && node.items && typeof node.items === "object") {
      visit(node.items as Record<string, unknown>);
    }
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const list = node[key];
      if (Array.isArray(list)) {
        for (const child of list) {
          if (child && typeof child === "object") {
            visit(child as Record<string, unknown>);
          }
        }
      }
    }
  };

  visit(clone);
  return clone;
}

/** Strip ```json fences and isolate the first JSON object/array if present. */
export function coerceJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const startObj = trimmed.indexOf("{");
  const startArr = trimmed.indexOf("[");
  let start = -1;
  if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
  else start = Math.max(startObj, startArr);
  if (start < 0) return trimmed;
  const endObj = trimmed.lastIndexOf("}");
  const endArr = trimmed.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function extractContent(output: Readonly<Record<string, unknown>>): string {
  if (typeof output.content === "string") return output.content;
  if (output.content != null) return JSON.stringify(output.content);
  if (typeof output.structured === "object" && output.structured != null) {
    return JSON.stringify(output.structured);
  }
  return "";
}

function ensureResponse(
  result: ProviderExecutionResult,
  nowIso: () => string
): ProviderExecutionResult {
  if (result.response) return result;
  const providerId = String(result.finalProviderId ?? "unknown");
  return {
    ...result,
    response: {
      requestId: result.requestId,
      providerId: asProviderId(providerId),
      output: Object.freeze({
        content: result.error?.message ?? "",
        ...(result.error ? { error: result.error } : {}),
      }),
      streamed: false,
      finishedAt: result.completedAt || nowIso(),
    },
  };
}

/**
 * Validate provider text against structured schema and attach `output.structured`.
 * Always returns a Result.ok with a response object (may set success=false).
 */
export function attachStructuredOutput(
  result: ProviderExecutionResult,
  structured: StructuredOutputRequest | undefined,
  nowIso: () => string
): Result<ProviderExecutionResult> {
  const withResponse = ensureResponse(result, nowIso);
  if (!structured) return success(withResponse);
  if (!withResponse.success) return success(withResponse);

  const output = (withResponse.response?.output ?? {}) as Record<string, unknown>;
  const content = extractContent(output);
  const validated = parseAndValidateJson(coerceJsonText(content), structured.schema, {
    allowAdditionalProperties: structured.strict === false,
  });

  if (!validated.ok) {
    return success({
      ...withResponse,
      success: false,
      status: "failed",
      error: {
        code: "STRUCTURED_OUTPUT_INVALID",
        message: validated.error.message,
      },
      response: {
        ...withResponse.response!,
        output: Object.freeze({
          ...output,
          content,
          structuredOutputValid: false,
        }),
      },
    });
  }

  return success({
    ...withResponse,
    response: {
      ...withResponse.response!,
      output: Object.freeze({
        ...output,
        content,
        structured: validated.value.value,
        structuredOutputValid: true,
      }),
    },
  });
}

function providerPromptText(request: ProviderExecutionRequest): string {
  return (
    (typeof request.payload.prompt === "string" && request.payload.prompt) ||
    (typeof request.payload.text === "string" && request.payload.text) ||
    (typeof request.payload.input === "string" && request.payload.input) ||
    ""
  );
}

function organizationIdFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  return typeof metadata?.organizationId === "string"
    ? metadata.organizationId
    : undefined;
}

function failPresentationOffBrief(
  result: ProviderExecutionResult,
  output: Record<string, unknown>,
  message: string,
  extra?: Record<string, unknown>
): Result<ProviderExecutionResult> {
  return success({
    ...result,
    success: false,
    status: "failed",
    error: {
      code: "PRESENTATION_OFF_BRIEF",
      message,
    },
    response: {
      ...result.response!,
      output: Object.freeze({
        ...output,
        ...extra,
      }),
    },
  });
}

async function expandPresentationConceptsToRoutes(input: {
  readonly concepts: unknown;
  readonly providerRequest: ProviderExecutionRequest;
  readonly basePrompt: string;
  readonly ctx: ReturnType<typeof presentationContextFromMetadata>;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
  readonly nowIso: () => string;
  readonly expansionRetried: boolean;
  readonly conceptsRetried?: boolean;
}): Promise<Result<ProviderExecutionResult>> {
  const routesStructured: StructuredOutputRequest = {
    name: "PresentationRoutes",
    schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  };

  const expansionAddon = buildPresentationExpansionInstructionBlock({
    lockedConcepts: input.concepts,
    brandName: input.ctx.brandName,
    subtype: input.ctx.subtype,
  });
  const expansionBody = `${input.basePrompt}\n\n${expansionAddon}\n\nRespond with ONLY valid JSON matching schema "PresentationRoutes".\nReturn exactly 3 routes in routes[].`;
  const expansionPrompt = orderPresentationProviderPrompt({
    body: expansionBody,
    brandName: input.ctx.brandName,
    subtype: input.ctx.subtype,
    exampleDeliverable: input.ctx.exampleDeliverable,
    userBrief: input.ctx.userBrief,
    mustUseFacts: input.ctx.mustUseFacts,
  });

  const expansionRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      presentationExpansionRetried: input.expansionRetried,
    },
    payload: {
      ...input.providerRequest.payload,
      prompt: expansionPrompt,
      text: expansionPrompt,
      input: expansionPrompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "PresentationRoutes",
          strict: true,
          schema: normalizeSchemaForOpenAiStrict(
            PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
              string,
              unknown
            >
          ),
        },
      },
    },
  };

  const executed = await input.reExecute(expansionRequest);
  if (!executed.ok) return executed;

  const parsed = attachStructuredOutput(
    executed.value,
    routesStructured,
    input.nowIso
  );
  if (!parsed.ok) return parsed;

  const output = (parsed.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return parsed;
  }

  const userBrief = input.ctx.userBrief || input.basePrompt;
  const relevance = validatePresentationRoutesRelevance({
    data: output.structured,
    userBrief,
    brandName: input.ctx.brandName,
  });
  const mustUse = validatePresentationMustUseCoverage({
    data: output.structured,
    facts: input.ctx.mustUseFacts,
  });
  const quality = evaluatePresentationOutputQuality({
    structured: output.structured,
    userBrief,
    organizationId: organizationIdFromMetadata(input.providerRequest.metadata),
  });

  const needsRetry =
    !relevance.ok ||
    !mustUse.ok ||
    quality.outcome === "RETRY_REQUIRED" ||
    quality.outcome === "REJECTED";

  if (needsRetry && !input.expansionRetried) {
    const retrySuffix = !relevance.ok
      ? buildPresentationRelevanceRetrySuffix({
          reasons: relevance.reasons,
          brandName: input.ctx.brandName,
        })
      : !mustUse.ok
        ? `\n\n[MUST USE retry] Prior decks missed required facts: ${mustUse.missing.join(", ")}. Include every MUST USE item in titles, bullets, or visual cues.`
        : "\n\n[Quality retry] Prior deck expansion was too generic or off-brief. Expand the same locked concepts with stronger brand and brief grounding.";
    return expandPresentationConceptsToRoutes({
      ...input,
      basePrompt: `${input.basePrompt}${retrySuffix}`.trim(),
      expansionRetried: true,
    });
  }

  if (needsRetry) {
    return failPresentationOffBrief(
      parsed.value,
      output,
      "Presentation routes were not grounded in your brief after expansion. Please refine the prompt and try again.",
      {
        presentationRelevance: relevance,
        presentationMustUse: mustUse,
        presentationQuality: quality.outcome,
        presentationConcepts: input.concepts,
      }
    );
  }

  const meta = input.providerRequest.metadata ?? {};
  const lockedColors: string[] = [];
  const pushColor = (v: unknown) => {
    if (typeof v === "string" && v.trim()) lockedColors.push(v.trim());
    if (Array.isArray(v)) {
      for (const c of v) {
        if (typeof c === "string" && c.trim()) lockedColors.push(c.trim());
      }
    }
  };
  pushColor(meta.learnedBrandColors);
  pushColor(meta.brandColors);

  const verify = await verifyAndReinforcePresentationOutput({
    organizationId:
      organizationIdFromMetadata(meta) ?? "presentation",
    brandId: typeof meta.brandId === "string" ? meta.brandId : undefined,
    structured: output.structured,
    userBrief,
    brandName: input.ctx.brandName,
    metadata: meta,
    lockedColors: [...new Set(lockedColors)],
    regenerated:
      input.expansionRetried === true || input.conceptsRetried === true,
  });

  if (verify.checked && !verify.passed) {
    return failPresentationOffBrief(
      parsed.value,
      output,
      "Presentation routes did not include required brand and brief facts. Please try again.",
      {
        presentationMeta: verify.meta,
        presentationConcepts: input.concepts,
      }
    );
  }

  const structuredWithMeta = {
    ...(output.structured as Record<string, unknown>),
    presentationMeta: verify.meta,
  };

  return success({
    ...parsed.value,
    response: {
      ...parsed.value.response!,
      output: Object.freeze({
        ...output,
        structured: structuredWithMeta,
        content: JSON.stringify(structuredWithMeta),
        presentationConcepts: input.concepts,
        presentationRelevance: relevance,
        presentationMustUse: mustUse,
        presentationQuality: quality.outcome,
        presentationMeta: verify.meta,
      }),
    },
  });
}

function finishPresentationConceptsOnly(input: {
  readonly result: ProviderExecutionResult;
  readonly concepts: unknown;
  readonly ctx: ReturnType<typeof presentationContextFromMetadata>;
  readonly output: Record<string, unknown>;
}): Result<ProviderExecutionResult> {
  const conceptsRec =
    input.concepts && typeof input.concepts === "object"
      ? (input.concepts as Record<string, unknown>)
      : {};
  const structuredWithMeta = {
    ...conceptsRec,
    presentationMeta: conceptsOnlyPresentationMeta({
      brandName: input.ctx.brandName,
      mustUseFacts: input.ctx.mustUseFacts,
    }),
  };
  return success({
    ...input.result,
    response: {
      ...input.result.response!,
      output: Object.freeze({
        ...input.output,
        structured: structuredWithMeta,
        content: JSON.stringify(structuredWithMeta),
        presentationPhase: "concepts",
      }),
    },
  });
}

async function expandSinglePresentationConcept(input: {
  readonly concepts: unknown;
  readonly conceptIndex: number;
  readonly providerRequest: ProviderExecutionRequest;
  readonly basePrompt: string;
  readonly ctx: ReturnType<typeof presentationContextFromMetadata>;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
  readonly nowIso: () => string;
  readonly expansionRetried: boolean;
}): Promise<Result<ProviderExecutionResult>> {
  const concept = conceptRecordAt(input.concepts, input.conceptIndex);
  if (!concept) {
    return failPresentationOffBrief(
      {
        requestId: input.providerRequest.requestId ?? "",
        success: false,
        status: "failed",
        response: { requestId: input.providerRequest.requestId ?? "", output: {} },
      } as ProviderExecutionResult,
      {},
      "Missing presentation concept to expand.",
    );
  }

  const planStructured: StructuredOutputRequest = {
    name: "PresentationPlan",
    schema: PRESENTATION_PLAN_STRUCTURED_SCHEMA as unknown as Record<
      string,
      unknown
    >,
    strict: true,
  };

  const expansionAddon = buildSingleRouteExpansionInstructionBlock({
    lockedConcept: concept,
    brandName: input.ctx.brandName,
    subtype: input.ctx.subtype,
  });
  const expansionBody = `${input.basePrompt}\n\n${expansionAddon}\n\nRespond with ONLY valid JSON matching schema "PresentationPlan".`;
  const expansionPrompt = orderPresentationProviderPrompt({
    body: expansionBody,
    brandName: input.ctx.brandName,
    subtype: input.ctx.subtype,
    exampleDeliverable: input.ctx.exampleDeliverable,
    userBrief: input.ctx.userBrief,
    mustUseFacts: input.ctx.mustUseFacts,
  });

  const expansionRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      productAction: "expand_presentation_route",
      presentationLockedConcept: concept,
      presentationRouteIndex: input.conceptIndex,
      presentationExpansionRetried: input.expansionRetried,
    },
    payload: {
      ...input.providerRequest.payload,
      prompt: expansionPrompt,
      text: expansionPrompt,
      input: expansionPrompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "PresentationPlan",
          strict: true,
          schema: normalizeSchemaForOpenAiStrict(
            PRESENTATION_PLAN_STRUCTURED_SCHEMA as unknown as Record<
              string,
              unknown
            >
          ),
        },
      },
    },
  };

  const executed = await input.reExecute(expansionRequest);
  if (!executed.ok) return executed;

  const parsed = attachStructuredOutput(
    executed.value,
    planStructured,
    input.nowIso
  );
  if (!parsed.ok) return parsed;

  const output = (parsed.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return parsed;
  }

  const userBrief = input.ctx.userBrief || input.basePrompt;
  const routeRecord = presentationPlanToRouteRecord({
    concept,
    plan: output.structured as Record<string, unknown>,
  });
  const relevance = validatePresentationRoutesRelevance({
    data: { routes: [routeRecord] },
    userBrief,
    brandName: input.ctx.brandName,
  });
  const mustUse = validatePresentationMustUseCoverage({
    data: { routes: [routeRecord] },
    facts: input.ctx.mustUseFacts,
  });

  if ((!relevance.ok || !mustUse.ok) && !input.expansionRetried) {
    const retrySuffix = !relevance.ok
      ? buildPresentationRelevanceRetrySuffix({
          reasons: relevance.reasons,
          brandName: input.ctx.brandName,
        })
      : `\n\n[MUST USE retry] Include required facts: ${mustUse.missing.join(", ")}.`;
    return expandSinglePresentationConcept({
      ...input,
      basePrompt: `${input.basePrompt}${retrySuffix}`.trim(),
      expansionRetried: true,
    });
  }

  if (!relevance.ok || !mustUse.ok) {
    return failPresentationOffBrief(
      parsed.value,
      output,
      "Could not expand this presentation direction on-brief. Try another route or refine the brief.",
      { presentationRelevance: relevance, presentationMustUse: mustUse }
    );
  }

  return success({
    ...parsed.value,
    response: {
      ...parsed.value.response!,
      output: Object.freeze({
        ...output,
        presentationRouteRecord: routeRecord,
        presentationRouteIndex: input.conceptIndex,
      }),
    },
  });
}

async function runPresentationSingleRouteExpansion(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
}): Promise<Result<ProviderExecutionResult>> {
  const first = attachStructuredOutput(
    input.executed,
    input.structured,
    input.nowIso
  );
  if (!first.ok) return first;

  const output = (first.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return first;
  }

  const basePrompt = providerPromptText(input.providerRequest);
  const ctx = presentationContextFromMetadata(
    input.providerRequest.metadata,
    basePrompt
  );
  const meta = input.providerRequest.metadata ?? {};
  const locked =
    meta.presentationLockedConcept &&
    typeof meta.presentationLockedConcept === "object"
      ? (meta.presentationLockedConcept as Record<string, unknown>)
      : conceptRecordAt(
          { concepts: [output.structured] },
          0
        ) ?? {};
  const routeRecord = presentationPlanToRouteRecord({
    concept: locked,
    plan: output.structured as Record<string, unknown>,
  });
  const userBrief = ctx.userBrief || basePrompt;
  const relevance = validatePresentationRoutesRelevance({
    data: { routes: [routeRecord] },
    userBrief,
    brandName: ctx.brandName,
  });
  const mustUse = validatePresentationMustUseCoverage({
    data: { routes: [routeRecord] },
    facts: ctx.mustUseFacts,
  });

  if (!relevance.ok || !mustUse.ok) {
    return failPresentationOffBrief(
      first.value,
      output,
      "Expanded presentation was not grounded in your brief.",
      { presentationRelevance: relevance, presentationMustUse: mustUse }
    );
  }

  const verify = await verifyAndReinforcePresentationOutput({
    organizationId:
      typeof meta.organizationId === "string" ? meta.organizationId : "presentation",
    brandId: typeof meta.brandId === "string" ? meta.brandId : undefined,
    structured: { routes: [routeRecord] },
    userBrief,
    brandName: ctx.brandName,
    metadata: meta,
  });

  const structuredWithMeta = {
    ...(output.structured as Record<string, unknown>),
    presentationRouteRecord: routeRecord,
    presentationMeta: verify.meta,
  };

  return success({
    ...first.value,
    response: {
      ...first.value.response!,
      output: Object.freeze({
        ...output,
        structured: structuredWithMeta,
        content: JSON.stringify(structuredWithMeta),
        presentationRouteRecord: routeRecord,
        presentationMeta: verify.meta,
      }),
    },
  });
}

async function runPresentationConceptsPipeline(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
}): Promise<Result<ProviderExecutionResult>> {
  const first = attachStructuredOutput(
    input.executed,
    input.structured,
    input.nowIso
  );
  if (!first.ok) return first;

  const output = (first.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return first;
  }

  const basePrompt = providerPromptText(input.providerRequest);
  const ctx = presentationContextFromMetadata(
    input.providerRequest.metadata,
    basePrompt
  );
  const userBrief = ctx.userBrief || basePrompt;
  const relevance = validatePresentationConceptsRelevance({
    data: output.structured,
    userBrief,
    brandName: ctx.brandName,
  });

  let concepts = output.structured;

  if (
    !relevance.ok &&
    input.providerRequest.metadata?.presentationConceptsRetried !== true
  ) {
    const retryBasePrompt =
      `${basePrompt}${buildPresentationRelevanceRetrySuffix({
        reasons: relevance.reasons,
        brandName: ctx.brandName,
      })}`.trim();
    const retryProviderRequest: ProviderExecutionRequest = {
      ...input.providerRequest,
      metadata: {
        ...(input.providerRequest.metadata ?? {}),
        presentationConceptsRetried: true,
      },
      payload: {
        ...input.providerRequest.payload,
        prompt: retryBasePrompt,
        text: retryBasePrompt,
        input: retryBasePrompt,
      },
    };
    const retryStructuredRequest = withStructuredOutputRequest(
      retryProviderRequest,
      input.structured
    );
    const reExecuted = await input.reExecute(retryStructuredRequest);
    if (!reExecuted.ok) return reExecuted;
    const second = attachStructuredOutput(
      reExecuted.value,
      input.structured,
      input.nowIso
    );
    if (!second.ok) return second;
    const out2 = (second.value.response?.output ?? {}) as Record<string, unknown>;
    if (out2.structuredOutputValid !== true || !out2.structured) {
      return second;
    }
    const relevance2 = validatePresentationConceptsRelevance({
      data: out2.structured,
      userBrief,
      brandName: ctx.brandName,
    });
    if (!relevance2.ok) {
      return failPresentationOffBrief(
        second.value,
        out2,
        "Presentation concepts were not grounded in your brief. Please try again with a clearer brand and goal.",
        { presentationRelevance: relevance2 }
      );
    }
    concepts = out2.structured;
  } else if (!relevance.ok) {
    return failPresentationOffBrief(
      first.value,
      output,
      "Presentation concepts were not grounded in your brief. Please try again with a clearer brand and goal.",
      { presentationRelevance: relevance }
    );
  }

  const mode = resolvePresentationExpandMode(input.providerRequest.metadata);
  const conceptsResult = first.value;
  const conceptsOutput = (conceptsResult.response?.output ?? {}) as Record<
    string,
    unknown
  >;

  if (mode === "full") {
    return expandPresentationConceptsToRoutes({
      concepts,
      providerRequest: input.providerRequest,
      basePrompt,
      ctx,
      reExecute: input.reExecute,
      nowIso: input.nowIso,
      expansionRetried: false,
      conceptsRetried:
        input.providerRequest.metadata?.presentationConceptsRetried === true,
    });
  }

  if (mode === "single") {
    const expanded = await expandSinglePresentationConcept({
      concepts,
      conceptIndex: 0,
      providerRequest: input.providerRequest,
      basePrompt,
      ctx,
      reExecute: input.reExecute,
      nowIso: input.nowIso,
      expansionRetried: false,
    });
    if (!expanded.ok) return expanded;
    const expOut = (expanded.value.response?.output ?? {}) as Record<
      string,
      unknown
    >;
    const routeRecord = expOut.presentationRouteRecord as
      | Record<string, unknown>
      | undefined;
    if (!routeRecord) return expanded;
    const conceptsRec =
      concepts && typeof concepts === "object"
        ? (concepts as Record<string, unknown>)
        : {};
    const hybrid = mergeExpandedRouteAtIndex({
      data: {
        ...conceptsRec,
        presentationMeta: conceptsOnlyPresentationMeta({
          brandName: ctx.brandName,
          mustUseFacts: ctx.mustUseFacts,
          fastPath: true,
        }),
      },
      index: 0,
      route: routeRecord,
    });
    return success({
      ...expanded.value,
      response: {
        ...expanded.value.response!,
        output: Object.freeze({
          ...expOut,
          structured: hybrid,
          content: JSON.stringify(hybrid),
          presentationPhase: "single_fast_path",
        }),
      },
    });
  }

  return finishPresentationConceptsOnly({
    result: conceptsResult,
    concepts,
    ctx,
    output: conceptsOutput,
  });
}

async function runPresentationRoutesRelevanceGate(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
}): Promise<Result<ProviderExecutionResult>> {
  const first = attachStructuredOutput(
    input.executed,
    input.structured,
    input.nowIso
  );
  if (!first.ok) return first;

  const output = (first.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return first;
  }

  const basePrompt = providerPromptText(input.providerRequest);
  const ctx = presentationContextFromMetadata(
    input.providerRequest.metadata,
    basePrompt
  );
  const relevance = validatePresentationRoutesRelevance({
    data: output.structured,
    userBrief: ctx.userBrief || basePrompt,
    brandName: ctx.brandName,
  });

  if (relevance.ok) {
    return first;
  }

  if (input.providerRequest.metadata?.presentationRelevanceRetried === true) {
    return failPresentationOffBrief(
      first.value,
      output,
      "Presentation routes were not grounded in your brief. Please try again with a clearer brand and goal.",
      { presentationRelevance: relevance }
    );
  }

  const retryBasePrompt =
    `${basePrompt}${buildPresentationRelevanceRetrySuffix({
      reasons: relevance.reasons,
      brandName: ctx.brandName,
    })}`.trim();

  const retryProviderRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      presentationRelevanceRetried: true,
    },
    payload: {
      ...input.providerRequest.payload,
      prompt: retryBasePrompt,
      text: retryBasePrompt,
      input: retryBasePrompt,
    },
  };
  const retryStructuredRequest = withStructuredOutputRequest(
    retryProviderRequest,
    input.structured
  );
  const reExecuted = await input.reExecute(retryStructuredRequest);
  if (!reExecuted.ok) return reExecuted;

  const second = attachStructuredOutput(
    reExecuted.value,
    input.structured,
    input.nowIso
  );
  if (!second.ok) return second;

  const out2 = (second.value.response?.output ?? {}) as Record<string, unknown>;
  if (out2.structuredOutputValid === true && out2.structured) {
    const relevance2 = validatePresentationRoutesRelevance({
      data: out2.structured,
      userBrief: ctx.userBrief || basePrompt,
      brandName: ctx.brandName,
    });
    if (!relevance2.ok) {
      return failPresentationOffBrief(
        second.value,
        out2,
        "Presentation routes were not grounded in your brief after retry. Please refine the prompt and try again.",
        { presentationRelevance: relevance2 }
      );
    }
  }

  return second;
}

/** Two-phase presentation pipeline + relevance / quality gates. */
export async function attachStructuredOutputWithPresentationGate(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest | undefined;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
}): Promise<Result<ProviderExecutionResult>> {
  const schemaName = input.structured?.name ?? "";
  if (!input.structured) {
    return attachStructuredOutput(
      input.executed,
      input.structured,
      input.nowIso
    );
  }

  if (schemaName === "PresentationRouteConcepts") {
    return runPresentationConceptsPipeline({
      executed: input.executed,
      structured: input.structured,
      providerRequest: input.providerRequest,
      nowIso: input.nowIso,
      reExecute: input.reExecute,
    });
  }

  if (
    schemaName === "PresentationPlan" &&
    input.providerRequest.metadata?.productAction === "expand_presentation_route"
  ) {
    return runPresentationSingleRouteExpansion({
      executed: input.executed,
      structured: input.structured,
      providerRequest: input.providerRequest,
      nowIso: input.nowIso,
    });
  }

  if (schemaName === "PresentationRoutes") {
    return runPresentationRoutesRelevanceGate({
      executed: input.executed,
      structured: input.structured,
      providerRequest: input.providerRequest,
      nowIso: input.nowIso,
      reExecute: input.reExecute,
    });
  }

  return attachStructuredOutput(
    input.executed,
    input.structured,
    input.nowIso
  );
}
