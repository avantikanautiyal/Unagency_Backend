/**
 * Structured-output helpers for provider_runtime (no tool loop required).
 */

import { success, type Result } from "../../../core/result";
import { asProviderId } from "../../../core/identifiers";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../runtime/contracts/provider-execution-response";
import type { StructuredOutputRequest } from "../contracts/tool-contracts";
import { parseAndValidateJson } from "../schema/json-schema-validator";
import { coerceValueTowardJsonSchema } from "./structured-output-coerce";
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
} from "../../../os/delivery/presentation-generation";
import {
  buildWebProjectInstructionBlock,
  buildWebsiteRelevanceRetrySuffix,
  isProviderOutputTruncated,
  orderWebsiteProviderPrompt,
  recoverWebProjectPlan,
  recoverWebsiteRoutesPlan,
  serializeWebsiteRouteForStorage,
  validateWebsitePageRelevance,
  websiteContextFromMetadata,
  websiteIncompleteErrorMessage,
  type WebStack,
} from "../../../os/delivery/website-generation";
import {
  buildDocumentPlanInstructionBlock,
  documentContextFromMetadata,
  orderDocumentProviderPrompt,
} from "../../../os/delivery/document-generation";
import {
  buildEmailPlanInstructionBlock,
  emailContextFromMetadata,
  orderEmailProviderPrompt,
} from "../../../os/delivery/email-generation";
import { ensureProviderPromptHasProductionSpec } from "../../../config/format-production-spec";
import {
  isConceptsOnlyPresentationPayload,
  isExportablePresentationPayload,
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../os/delivery/document-export-service";
import { verifyAndReinforcePresentationOutput } from "../../../../services/presentation-verify-reinforce";
import {
  buildPresentationExpansionDiagnostic,
  expansionLogLabel,
  inferPresentationExtractionBranch,
  logPresentationExpansionDiagnostic,
} from "./presentation-expansion-diagnostics";
import {
  logPresentationExpansionWireSummary,
  summarizePresentationExpansionWireRequest,
} from "./presentation-expansion-wire-diagnostics";
import {
  PRESENTATION_PLAN_STRUCTURED_SCHEMA,
  PRESENTATION_ROUTE_CONCEPTS_SCHEMA,
  PRESENTATION_ROUTES_STRUCTURED_SCHEMA,
} from "../../../os/delivery/presentation-schemas";
import { isPresentationDirectCreate } from "../../../direct/presentation-direct-metadata";

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
  const isEmailPlan = schemaName === "EmailPlan";
  const isLaunchPlan = schemaName === "LaunchPlan";
  const isWebsitePage =
    schemaName === "WebsitePage" ||
    schemaName === "WebProject" ||
    schemaName === "WebsiteRoutes";
  // WebProject / WebsiteRoutes are always JSON (files + stack). Raw HTML is recovered after the fact.

  const priorPrompt =
    (typeof request.payload.prompt === "string" && request.payload.prompt) ||
    (typeof request.payload.text === "string" && request.payload.text) ||
    (typeof request.payload.input === "string" && request.payload.input) ||
    "";

  const directPassthrough =
    request.metadata?.directPassthrough === true ||
    request.metadata?.productAction === "direct_passthrough";

  const needsBriefLockInstructions =
    isWebsitePage ||
    isPresentationFlow ||
    isPresentationPlan ||
    isDocumentPlan ||
    isEmailPlan ||
    isLaunchPlan;

  // Passthrough testing: keep the user prompt verbatim for generic flows.
  // Structured product schemas MUST still receive schema instructions —
  // otherwise models return prose and text creative routes come back empty.
  if (directPassthrough && !needsBriefLockInstructions) {
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
        prompt: priorPrompt,
        text: priorPrompt,
        input: priorPrompt,
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
    const ctx = documentContextFromMetadata(request.metadata, priorPrompt);
    instructionParts.push(
      buildDocumentPlanInstructionBlock({
        userBrief: ctx.userBrief,
        brandName: ctx.brandName,
        service: ctx.service,
        subtype: ctx.subtype,
        exampleDeliverable: ctx.exampleDeliverable,
        mustUseFacts: ctx.mustUseFacts,
      }),
      "Keys ONLY: title, summary, sections[].heading, sections[].body.",
      `Exact JSON schema:\n${JSON.stringify(schema)}`,
    );
  } else if (isEmailPlan) {
    const ctx = emailContextFromMetadata(request.metadata, priorPrompt);
    instructionParts.push(
      buildEmailPlanInstructionBlock({
        userBrief: ctx.userBrief,
        brandName: ctx.brandName,
        service: ctx.service,
        subtype: ctx.subtype,
        exampleDeliverable: ctx.exampleDeliverable,
      }),
      "Keys ONLY: title, subject, preheader, html, textFallback.",
      `Exact JSON schema:\n${JSON.stringify(schema)}`,
    );
  } else if (isWebsitePage) {
    const ctx = websiteContextFromMetadata(request.metadata, priorPrompt);
    const multiRoute = schemaName === "WebsiteRoutes";
    instructionParts.push(
      buildWebProjectInstructionBlock({
        userBrief: ctx.userBrief,
        brandName: ctx.brandName,
        exampleDeliverable: ctx.exampleDeliverable,
        stack: ctx.stack,
        brandColors: ctx.brandColors,
        multiRoute,
        isRetry: request.metadata?.websiteCompletenessRetried === true,
        isDesignRetry: request.metadata?.websiteDesignRetried === true,
      }),
      multiRoute
        ? "Keys ONLY: routes[3] each with title, description, summary, stack, brandName, tagline, heroBody, sections, ctaLabel, colors, html."
        : "Keys ONLY: title, summary, stack, brandName, tagline, heroBody, sections, ctaLabel, colors, html.",
      `Exact JSON schema:\n${JSON.stringify(schema)}`
    );
  } else {
    instructionParts.push(
      "Required top-level keys ONLY: title (string), summary (string), steps (array of exactly 3).",
      "Do NOT include brand, deliverable, overview, rationale, nextActions, or any other keys.",
      "Each step must be { title: string, description: string } only — no rationale field.",
      "The steps array must contain exactly 3 distinct creative routes (alternative directions on the SAME brief).",
      "Each step.title is a short route name; each step.description is the creative direction for that route.",
      `Exact JSON schema:\n${JSON.stringify(schema)}`,
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
  } else if (isDocumentPlan) {
    const ctx = documentContextFromMetadata(request.metadata, priorPrompt);
    prompt = orderDocumentProviderPrompt({
      body: prompt,
      brandName: ctx.brandName,
      exampleDeliverable: ctx.exampleDeliverable,
      userBrief: ctx.userBrief,
      service: ctx.service,
      subtype: ctx.subtype,
    });
  } else if (isEmailPlan) {
    const ctx = emailContextFromMetadata(request.metadata, priorPrompt);
    prompt = orderEmailProviderPrompt({
      body: prompt,
      brandName: ctx.brandName,
      exampleDeliverable: ctx.exampleDeliverable,
      userBrief: ctx.userBrief,
      service: ctx.service,
      subtype: ctx.subtype,
    });
  } else if (isWebsitePage) {
    const ctx = websiteContextFromMetadata(request.metadata, priorPrompt);
    prompt = orderWebsiteProviderPrompt({
      body: prompt,
      brandName: ctx.brandName,
      exampleDeliverable: ctx.exampleDeliverable,
      userBrief: ctx.userBrief,
      stack: ctx.stack,
      brandColors: ctx.brandColors,
      multiRoute: schemaName === "WebsiteRoutes",
    });
  }

  // Phase 1 — keep Format & Production Spec in structured modality prompts
  // even when compilers reorder/rebuild the body.
  prompt = ensureProviderPromptHasProductionSpec({
    prompt,
    metadata: request.metadata,
  }).prompt;

  const priorFeatures = Array.isArray(
    (request.options as Record<string, unknown> | undefined)?.features
  )
    ? ([
        ...((request.options as Record<string, unknown>).features as string[]),
      ] as string[])
    : [];
  const features = [...new Set([...priorFeatures, "json_mode", "response_format"])];

  // WebsiteRoutes (3 fills) needs more headroom; html-static needs Claude-length HTML.
  const websiteStack = isWebsitePage
    ? websiteContextFromMetadata(request.metadata, priorPrompt).stack
    : null;
  const largeJsonMaxTokens =
    isWebsitePage
      ? websiteStack === "html-static"
        ? schemaName === "WebsiteRoutes"
          ? 24_576
          : 16_384
        : schemaName === "WebsiteRoutes"
          ? 8_192
          : 4_096
      : isDocumentPlan || isEmailPlan
        ? 16_384
        : undefined;

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
      ...(largeJsonMaxTokens != null
        ? { max_tokens: largeJsonMaxTokens, maxTokens: largeJsonMaxTokens }
        : {}),
    },
    parameters: {
      ...(request.parameters ?? {}),
      ...(largeJsonMaxTokens != null
        ? { maxTokens: largeJsonMaxTokens, max_tokens: largeJsonMaxTokens }
        : {}),
    },
    options: {
      ...(request.options ?? {}),
      features,
      ...(largeJsonMaxTokens != null
        ? { maxTokens: largeJsonMaxTokens, max_tokens: largeJsonMaxTokens }
        : {}),
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

/** Gemini Flash ignores json_schema and is faster emitting HTML than JSON. */
/** @deprecated WebProject uses JSON for all providers; HTML passthrough retired. */
export function isGeminiWebsiteHtmlPassthrough(
  providerId: unknown,
  schemaName: string | undefined
): boolean {
  void providerId;
  void schemaName;
  return false;
}

const WEBSITE_JSON_MAX_STRING = 512_000;

function isWebTechSchemaName(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return (
    n === "websitepage" || n === "webproject" || n === "websiteroutes"
  );
}

/**
 * Parse structured JSON, or recover a WebProject from fenced/raw HTML / legacy WebsitePage.
 */
export function preferredStackFromStructuredMeta(
  structured: StructuredOutputRequest
): WebStack | string | undefined {
  const meta = structured as StructuredOutputRequest & {
    preferredStack?: string;
    preferredWebStack?: string;
    webStack?: string;
  };
  if (typeof meta.preferredStack === "string" && meta.preferredStack.trim()) {
    return meta.preferredStack;
  }
  if (
    typeof meta.preferredWebStack === "string" &&
    meta.preferredWebStack.trim()
  ) {
    return meta.preferredWebStack;
  }
  if (typeof meta.webStack === "string" && meta.webStack.trim()) {
    return meta.webStack;
  }
  return undefined;
}

export function parseOrRecoverStructuredOutput(
  content: string,
  structured: StructuredOutputRequest,
  options?: { readonly preferredStack?: WebStack | string }
): { ok: true; value: unknown } | { ok: false; message: string } {
  const isWebsitePage = isWebTechSchemaName(structured.name);
  const isDocumentPlan =
    (structured.name ?? "").toLowerCase() === "documentplan";
  const preferredStack =
    options?.preferredStack ?? preferredStackFromStructuredMeta(structured);
  const recoverOpts = preferredStack
    ? { preferredStack }
    : undefined;
  const coercedText = (() => {
    const raw = coerceJsonText(content);
    try {
      const parsed = JSON.parse(raw) as unknown;
      const coerced = coerceValueTowardJsonSchema(
        parsed,
        structured.schema as Record<string, unknown>,
        structured.name
      );
      return JSON.stringify(coerced);
    } catch {
      return raw;
    }
  })();
  const validated = parseAndValidateJson(coercedText, structured.schema, {
    allowAdditionalProperties: structured.strict === false,
    ...(isWebsitePage || isDocumentPlan
      ? { maxStringLength: WEBSITE_JSON_MAX_STRING }
      : {}),
  });
  const isPresentationRoutes =
    (structured.name ?? "").toLowerCase() === "presentationroutes";

  if (validated.ok) {
    if (isPresentationRoutes) {
      const recovered = recoverPresentationRoutesPayload(validated.value.value);
      if (parsePresentationRoutes(recovered)) {
        return { ok: true, value: recovered };
      }
      try {
        const parsedJson = JSON.parse(coerceJsonText(content)) as unknown;
        const recoveredRaw = recoverPresentationRoutesPayload(parsedJson);
        if (parsePresentationRoutes(recoveredRaw)) {
          return { ok: true, value: recoveredRaw };
        }
      } catch {
        /* fall through */
      }
      return {
        ok: false,
        message:
          "PresentationRoutes JSON validated but did not produce exportable slide decks.",
      };
    }
    if (isWebsitePage) {
      const routes = recoverWebsiteRoutesPlan(
        validated.value.value,
        recoverOpts
      );
      if (!routes?.length) {
        return {
          ok: false,
          message: websiteIncompleteErrorMessage(preferredStack),
        };
      }
      // Preserve multi-route shape for materializer; single route stays flat WebProject.
      if (routes.length > 1) {
        return {
          ok: true,
          value: {
            routes: routes.map((r) => serializeWebsiteRouteForStorage(r)),
          },
        };
      }
      return { ok: true, value: routes[0] };
    }
    return { ok: true, value: validated.value.value };
  }
  if (isWebsitePage) {
    const recoveredRoutes =
      recoverWebsiteRoutesPlan(content, recoverOpts) ??
      recoverWebsiteRoutesPlan(coercedText, recoverOpts);
    if (recoveredRoutes?.length) {
      if (recoveredRoutes.length > 1) {
        return {
          ok: true,
          value: {
            routes: recoveredRoutes.map((r) => serializeWebsiteRouteForStorage(r)),
          },
        };
      }
      return { ok: true, value: recoveredRoutes[0] };
    }
    const looksTruncatedHtml =
      /<!DOCTYPE\s+html|<html[\s>]/i.test(content) &&
      !/<\/html>/i.test(content);
    if (looksTruncatedHtml && (!preferredStack || preferredStack === "html-static")) {
      return {
        ok: false,
        message:
          "Website HTML was truncated before </html>. Please retry with a shorter page.",
      };
    }
    return {
      ok: false,
      message: websiteIncompleteErrorMessage(preferredStack),
    };
  }
  if (isPresentationRoutes) {
    try {
      const parsedJson = JSON.parse(coerceJsonText(coercedText)) as unknown;
      const recovered = recoverPresentationRoutesPayload(parsedJson);
      if (parsePresentationRoutes(recovered)) {
        return { ok: true, value: recovered };
      }
    } catch {
      /* fall through */
    }
  }
  return { ok: false, message: validated.error.message };
}

/** Expansion/retry calls must not inherit tool-loop messages or stale response_format. */
function buildStructuredReExecutePayload(input: {
  readonly prompt: string;
  readonly responseFormat: Record<string, unknown>;
  readonly maxTokens?: number;
}): Record<string, unknown> {
  const userMessage = { role: "user", content: input.prompt };
  return {
    prompt: input.prompt,
    text: input.prompt,
    input: input.prompt,
    messages: [userMessage],
    response_format: input.responseFormat,
    ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
  };
}

function exportablePresentationRoutesJson(
  output: Readonly<Record<string, unknown>>
): string | undefined {
  const tryValue = (value: unknown): string | undefined => {
    const recovered = recoverPresentationRoutesPayload(value);
    if (!parsePresentationRoutes(recovered)) return undefined;
    return JSON.stringify(recovered);
  };

  if (output.structured != null && typeof output.structured === "object") {
    const fromStructured = tryValue(output.structured);
    if (fromStructured) return fromStructured;
  }

  const rawCandidates: string[] = [];
  if (typeof output.content === "string" && output.content.trim()) {
    rawCandidates.push(coerceJsonText(output.content));
  } else if (output.content != null) {
    rawCandidates.push(coerceJsonText(JSON.stringify(output.content)));
  }
  if (typeof output.text === "string" && output.text.trim()) {
    rawCandidates.push(coerceJsonText(output.text));
  }

  for (const raw of rawCandidates) {
    if (!raw.trim()) continue;
    try {
      const fromContent = tryValue(JSON.parse(raw) as unknown);
      if (fromContent) return fromContent;
    } catch {
      /* try next candidate */
    }
  }

  return undefined;
}

function extractContent(
  output: Readonly<Record<string, unknown>>,
  structured?: StructuredOutputRequest
): string {
  const schemaName = (structured?.name ?? "").toLowerCase();
  if (schemaName === "presentationroutes") {
    const routesJson = exportablePresentationRoutesJson(output);
    if (routesJson) return routesJson;
  }

  if (output.structured != null && typeof output.structured === "object") {
    return JSON.stringify(output.structured);
  }
  if (typeof output.content === "string" && output.content.trim()) {
    return coerceJsonText(output.content);
  }
  if (output.content != null) {
    return coerceJsonText(JSON.stringify(output.content));
  }
  if (typeof output.text === "string" && output.text.trim()) {
    return coerceJsonText(output.text);
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
  nowIso: () => string,
  options?: { readonly preferredStack?: WebStack | string }
): Result<ProviderExecutionResult> {
  const withResponse = ensureResponse(result, nowIso);
  if (!structured) return success(withResponse);
  if (!withResponse.success) return success(withResponse);

  const output = (withResponse.response?.output ?? {}) as Record<string, unknown>;
  const isWebsite = isWebTechSchemaName(structured.name);

  // Never accept max_tokens truncation as a successful website payload.
  if (isWebsite && isProviderOutputTruncated(output)) {
    return success({
      ...withResponse,
      success: false,
      status: "failed",
      error: {
        code: "STRUCTURED_OUTPUT_TRUNCATED",
        message:
          "Website generation hit the output token limit (truncated). Retrying with a smaller payload.",
      },
      response: {
        ...withResponse.response!,
        output: Object.freeze({
          ...output,
          structuredOutputValid: false,
          truncatedByLength: true,
        }),
      },
    });
  }

  const content = extractContent(output, structured);
  const parsed = parseOrRecoverStructuredOutput(content, structured, options);

  if (!parsed.ok) {
    return success({
      ...withResponse,
      success: false,
      status: "failed",
      error: {
        code: "STRUCTURED_OUTPUT_INVALID",
        message: parsed.message,
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
        structured: parsed.value,
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
    userBrief: input.ctx.userBrief,
    mustUseFacts: input.ctx.mustUseFacts,
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
  const expansionPromptWithSpec = ensureProviderPromptHasProductionSpec({
    prompt: expansionPrompt,
    metadata: input.providerRequest.metadata,
  }).prompt;

  const expansionMaxTokens = 16_384;
  const expansionResponseFormat = {
    type: "json_schema" as const,
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
  };
  const expansionRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    requestId: `${input.providerRequest.requestId}_pres_expand${
      input.expansionRetried ? "_retry" : ""
    }`,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      presentationExpansionRetried: input.expansionRetried,
      presentationExpandMode: "full",
    },
    payload: buildStructuredReExecutePayload({
      prompt: expansionPromptWithSpec,
      maxTokens: expansionMaxTokens,
      responseFormat: expansionResponseFormat,
    }),
    options: {
      ...(input.providerRequest.options ?? {}),
      maxTokens: expansionMaxTokens,
      max_tokens: expansionMaxTokens,
    },
  };

  logPresentationExpansionWireSummary(
    summarizePresentationExpansionWireRequest(expansionRequest)
  );

  const executed = await input.reExecute(expansionRequest);
  if (!executed.ok) return executed;

  const preAttachOutput = (executed.value.response?.output ?? {}) as Record<
    string,
    unknown
  >;

  const parsed = attachStructuredOutput(
    executed.value,
    routesStructured,
    input.nowIso
  );
  if (!parsed.ok) return parsed;

  const output = (parsed.value.response?.output ?? {}) as Record<string, unknown>;
  const expansionDiag = buildPresentationExpansionDiagnostic({
    requestId: expansionRequest.requestId ?? input.providerRequest.requestId ?? "",
    providerRequest: expansionRequest,
    providerResult: parsed.value,
    schemaName: "PresentationRoutes",
    output: Object.keys(output).length > 0 ? output : preAttachOutput,
    extractionBranch: inferPresentationExtractionBranch(
      Object.keys(output).length > 0 ? output : preAttachOutput
    ),
    structuredOutputValid:
      output.structuredOutputValid === true ? true : output.structuredOutputValid === false ? false : undefined,
  });
  logPresentationExpansionDiagnostic(expansionDiag);

  if (output.structuredOutputValid !== true || !output.structured) {
    if (!input.expansionRetried) {
      return expandPresentationConceptsToRoutes({
        ...input,
        expansionRetried: true,
        basePrompt: `${input.basePrompt}\n\n[Format retry] Return ONLY valid JSON for schema "PresentationRoutes" with exactly 3 routes. Each route needs deckTitle, deckSubtitle, and slides[] (min 6 slides; each slide needs title, bullets, notes, layout, visualCue).`,
      });
    }
    return failPresentationOffBrief(
      parsed.value,
      output,
      "Presentation expansion did not return full slide decks required for PDF/PPTX export.",
      {
        presentationConcepts: input.concepts,
        presentationExpansionDiagnostic: expansionDiag,
      }
    );
  }

  const recoveredStructured = recoverPresentationRoutesPayload(output.structured);

  if (!parsePresentationRoutes(recoveredStructured)) {
    if (!input.expansionRetried) {
      return expandPresentationConceptsToRoutes({
        ...input,
        expansionRetried: true,
        basePrompt: `${input.basePrompt}\n\n[Format retry] Prior response was missing exportable slide decks. Return exactly 3 routes in routes[]. Each route MUST include title, description, deckTitle, deckSubtitle, and slides[] with at least 6 slides.`,
      });
    }
    return failPresentationOffBrief(
      parsed.value,
      output,
      "Presentation expansion returned routes without slide decks required for PDF/PPTX export.",
      {
        presentationConcepts: input.concepts,
        presentationExpansionDiagnostic: expansionDiag,
      }
    );
  }

  const userBrief = input.ctx.userBrief || input.basePrompt;
  const relevance = validatePresentationRoutesRelevance({
    data: recoveredStructured,
    userBrief,
    brandName: input.ctx.brandName,
  });
  const mustUse = validatePresentationMustUseCoverage({
    data: recoveredStructured,
    facts: input.ctx.mustUseFacts,
  });
  const quality = evaluatePresentationOutputQuality({
    structured: recoveredStructured,
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
    // After one retry: only hard-fail on empty decks, missing brand, or rejected quality.
    // Soft brief-overlap / generic-quality misses should still deliver usable routes.
    const fatalRelevance = relevance.reasons.some(
      (r) => r === "empty_routes" || r === "missing_brand_name"
    );
    const fatalMustUse =
      !mustUse.ok && mustUse.missing.includes("brand");
    const fatalQuality = quality.outcome === "REJECTED" && !relevance.ok;
    if (fatalRelevance || fatalMustUse || fatalQuality) {
      return failPresentationOffBrief(
        parsed.value,
        output,
        "Presentation routes were not grounded in your brief after expansion. Please refine the prompt and try again.",
        {
          presentationRelevance: relevance,
          presentationMustUse: mustUse,
          presentationQuality: quality.outcome,
          presentationConcepts: input.concepts,
          presentationExpansionDiagnostic: expansionDiag,
        }
      );
    }
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
    structured: recoveredStructured,
    userBrief,
    brandName: input.ctx.brandName,
    metadata: meta,
    lockedColors: [...new Set(lockedColors)],
    regenerated:
      input.expansionRetried === true || input.conceptsRetried === true,
  });

  if (verify.checked && !verify.passed) {
    const criticalMissing = mustUse.missing.filter((m) =>
      ["brand", "palette", "industry", "positioning", "audience", "summary"].includes(
        m
      )
    );
    if (criticalMissing.length > 0 && !input.expansionRetried) {
      return expandPresentationConceptsToRoutes({
        ...input,
        expansionRetried: true,
        basePrompt: `${input.basePrompt}\n\n[Grounding retry] Prior decks missed required brand facts (${criticalMissing.join(", ")}). Regenerate using ONLY the brief and MUST USE facts — include brand colours in visualCue fields.`,
      });
    }
    const brandRequired = Boolean(input.ctx.brandName?.trim());
    const blob = JSON.stringify(recoveredStructured ?? {}).toLowerCase();
    const brandPresent =
      !brandRequired ||
      blob.includes(input.ctx.brandName!.trim().toLowerCase());
    if (!brandPresent || criticalMissing.length > 0) {
      return failPresentationOffBrief(
        parsed.value,
        output,
        "Presentation routes did not include required brand and brief facts. Please try again.",
        {
          presentationMeta: verify.meta,
          presentationConcepts: input.concepts,
          presentationExpansionDiagnostic: expansionDiag,
        }
      );
    }
  }

  const structuredWithMeta = {
    ...(recoveredStructured as Record<string, unknown>),
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
        presentationExpansionDiagnostic: {
          ...expansionDiag,
          failureCategory: "EXPANSION_OK" as const,
          parseExportable: true,
        },
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
  const expansionPromptWithSpec = ensureProviderPromptHasProductionSpec({
    prompt: expansionPrompt,
    metadata: input.providerRequest.metadata,
  }).prompt;

  const expansionRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    requestId: `${input.providerRequest.requestId}_pres_route_${input.conceptIndex}${
      input.expansionRetried ? "_retry" : ""
    }`,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      productAction: "expand_presentation_route",
      presentationLockedConcept: concept,
      presentationRouteIndex: input.conceptIndex,
      presentationExpansionRetried: input.expansionRetried,
    },
    payload: buildStructuredReExecutePayload({
      prompt: expansionPromptWithSpec,
      responseFormat: {
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
    }),
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
    const required =
      isPresentationDirectCreate(input.providerRequest.metadata) &&
      input.providerRequest.metadata?.deliverableRequired !== false;
    if (required) {
      return failPresentationOffBrief(
        first.value,
        output,
        "Presentation concepts could not be validated. Please try again with a clearer brief."
      );
    }
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
  const subtype =
    typeof input.providerRequest.metadata?.subtype === "string"
      ? input.providerRequest.metadata.subtype.trim().toLowerCase()
      : "";
  const requestId = String(input.providerRequest.requestId ?? "");

  // Single-route on-demand expand (TextRoutes) — not create.
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

  // GIFs stay concepts-only. Every other presentation create (pitch decks, etc.)
  // MUST expand to full slide decks — never finish on concepts alone.
  if (subtype === "gifs") {
    return finishPresentationConceptsOnly({
      result: conceptsResult,
      concepts,
      ctx,
      output: conceptsOutput,
    });
  }

  console.log(
    `📑 [Presentation] expanding concepts → full decks | requestId=${requestId} | subtype=${subtype || "n/a"} | mode=${mode}`
  );
  const expanded = await expandPresentationConceptsToRoutes({
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
  if (expanded.ok) {
    const out = (expanded.value.response?.output ?? {}) as Record<
      string,
      unknown
    >;
    const diag = out.presentationExpansionDiagnostic as
      | { failureCategory?: string; parseExportable?: boolean }
      | undefined;
    const recovered = recoverPresentationRoutesPayload(out.structured);
    const okRoutes = Boolean(parsePresentationRoutes(recovered));
    const label =
      diag?.failureCategory != null
        ? expansionLogLabel(
            diag.failureCategory as Parameters<typeof expansionLogLabel>[0]
          )
        : okRoutes
          ? "ok"
          : "missing_routes";
    console.log(
      `📑 [Presentation] expansion ${label} | requestId=${requestId} | success=${String(expanded.value.success)} | category=${String(diag?.failureCategory ?? (okRoutes ? "EXPANSION_OK" : "ROUTES_NOT_FOUND"))}`
    );
  } else {
    console.warn(
      `📑 [Presentation] expansion failed | requestId=${requestId} | ${expanded.error.message}`
    );
  }
  return expanded;
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

async function runWebsitePageRelevanceGate(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
}): Promise<Result<ProviderExecutionResult>> {
  const basePrompt = providerPromptText(input.providerRequest);
  const ctx = websiteContextFromMetadata(
    input.providerRequest.metadata,
    basePrompt
  );
  const first = attachStructuredOutput(
    input.executed,
    input.structured,
    input.nowIso,
    { preferredStack: ctx.stack }
  );
  if (!first.ok) return first;

  const output = (first.value.response?.output ?? {}) as Record<string, unknown>;
  if (output.structuredOutputValid !== true || !output.structured) {
    return first;
  }

  const relevance = validateWebsitePageRelevance({
    data: output.structured,
    userBrief: ctx.userBrief || basePrompt,
    brandName: ctx.brandName,
  });

  if (relevance.ok) {
    return first;
  }

  if (input.providerRequest.metadata?.websiteRelevanceRetried === true) {
    return failPresentationOffBrief(
      first.value,
      output,
      "The website was not grounded in your brief. Please try again — ensure the brand name and requirements are clear.",
      { websiteRelevance: relevance }
    );
  }

  const retryBasePrompt =
    `${basePrompt}\n\n${buildWebsiteRelevanceRetrySuffix({
      userBrief: ctx.userBrief || basePrompt,
      reasons: relevance.reasons,
      brandName: ctx.brandName,
    })}`.trim();

  const retryProviderRequest: ProviderExecutionRequest = {
    ...input.providerRequest,
    metadata: {
      ...(input.providerRequest.metadata ?? {}),
      websiteRelevanceRetried: true,
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
    input.nowIso,
    { preferredStack: ctx.stack }
  );
  if (!second.ok) return second;

  const out2 = (second.value.response?.output ?? {}) as Record<string, unknown>;
  if (out2.structuredOutputValid === true && out2.structured) {
    const relevance2 = validateWebsitePageRelevance({
      data: out2.structured,
      userBrief: ctx.userBrief || basePrompt,
      brandName: ctx.brandName,
    });
    if (!relevance2.ok) {
      // After one retry: only hard-fail on empty output or off-topic clones.
      // Soft anchor/palette misses should not block a complete WebProject.
      const fatal = relevance2.reasons.some(
        (r) =>
          r === "empty_website" ||
          r === "brand_missing" ||
          r.startsWith("off_topic:")
      );
      if (fatal) {
        return failPresentationOffBrief(
          second.value,
          out2,
          "The website was not grounded in your brief after retry. Please refine the prompt and try again.",
          { websiteRelevance: relevance2 }
        );
      }
    }
  }

  return second;
}

/**
 * Safety net — if a pitch-deck create finished with concepts-only (gate skipped
 * or expansion missed), run the full concepts → routes pipeline now.
 */
export async function ensurePresentationExpandedForDeliverable(input: {
  readonly executed: ProviderExecutionResult;
  readonly structured: StructuredOutputRequest;
  readonly providerRequest: ProviderExecutionRequest;
  readonly nowIso: () => string;
  readonly reExecute: (
    request: ProviderExecutionRequest
  ) => Promise<Result<ProviderExecutionResult>>;
}): Promise<Result<ProviderExecutionResult>> {
  const meta = input.providerRequest.metadata;
  if (!isPresentationDirectCreate(meta) || meta?.deliverableRequired === false) {
    return success(input.executed);
  }
  const subtype =
    typeof meta?.subtype === "string" ? meta.subtype.trim().toLowerCase() : "";
  if (subtype === "gifs") {
    return success(input.executed);
  }

  const output = (input.executed.response?.output ?? {}) as Record<string, unknown>;
  const payload = output.structured ?? output.structuredOutput ?? output.data;
  if (isExportablePresentationPayload(payload)) {
    return success(input.executed);
  }
  if (!isConceptsOnlyPresentationPayload(payload) && payload != null) {
    return success(input.executed);
  }

  const requestId = String(input.providerRequest.requestId ?? "");
  console.log(
    `📑 [Presentation] safety-net expanding concepts → full decks | requestId=${requestId}`
  );
  return attachStructuredOutputWithPresentationGate({
    executed: input.executed,
    structured: input.structured,
    providerRequest: input.providerRequest,
    nowIso: input.nowIso,
    reExecute: input.reExecute,
  });
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

  const presentationConceptsStructured: StructuredOutputRequest =
    schemaName === "PresentationRouteConcepts"
      ? input.structured
      : {
          name: "PresentationRouteConcepts",
          schema: PRESENTATION_ROUTE_CONCEPTS_SCHEMA as unknown as Record<
            string,
            unknown
          >,
          strict: true,
        };

  if (
    schemaName === "PresentationRouteConcepts" ||
    (isPresentationDirectCreate(input.providerRequest.metadata) &&
      schemaName !== "PresentationRoutes" &&
      schemaName !== "PresentationPlan")
  ) {
    return runPresentationConceptsPipeline({
      executed: input.executed,
      structured: presentationConceptsStructured,
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

  if (schemaName === "WebsitePage" || schemaName === "WebProject" || schemaName === "WebsiteRoutes") {
    return runWebsitePageRelevanceGate({
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
