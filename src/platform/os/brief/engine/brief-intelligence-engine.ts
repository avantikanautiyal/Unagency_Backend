/**
 * Brief Intelligence engine — deterministic NL → StructuredBrief.
 * Provider-agnostic: no direct vendor SDK calls in Phase 1.
 */

import {
  STRUCTURED_BRIEF_VERSION,
  type BriefAvailableContext,
  type BriefStatus,
  type CreateStructuredBriefInput,
  type StructuredBrief,
} from "../contracts/structured-brief";
import { BriefIntelligenceError } from "../contracts/errors";
import { validateStructuredBrief, isBriefRuntimeCapabilityId } from "../validation/validate-brief";
import { classifyBriefIntent } from "./intent-classifier";
import {
  detectMissingInformation,
  extractAudience,
  extractChannels,
  extractDeliverables,
  extractDimensions,
  extractRequirementsAndConstraints,
  extractTone,
  mapBriefCapabilities,
} from "./extractors";

export interface IBriefIntelligenceEngine {
  readonly implementationStatus: "implemented";
  createBrief(input: CreateStructuredBriefInput): StructuredBrief;
}

function resolveStatus(input: {
  readonly intentConfidence: number;
  readonly missingRequired: boolean;
  readonly ambiguous: boolean;
  readonly unsupported: boolean;
}): BriefStatus {
  if (input.unsupported) return "UNSUPPORTED";
  if (input.missingRequired) return "NEEDS_INFORMATION";
  if (input.ambiguous || input.intentConfidence < 0.55) return "AMBIGUOUS";
  return "VALID";
}

function buildObjective(prompt: string, intent: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 237)}…`;
}

export class BriefIntelligenceEngine implements IBriefIntelligenceEngine {
  readonly implementationStatus = "implemented" as const;

  createBrief(input: CreateStructuredBriefInput): StructuredBrief {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId =
      input.createId ?? ((p: string) => `${p}_${Date.now()}`);

    try {
      const rawPrompt = input.rawPrompt?.trim() ?? "";
      if (!rawPrompt) {
        throw new BriefIntelligenceError(
          "BRIEF_INVALID",
          "rawPrompt is required for Brief Intelligence"
        );
      }
      if (!input.tenant.organizationId?.trim()) {
        throw new BriefIntelligenceError(
          "BRIEF_INVALID",
          "organizationId is required"
        );
      }
      if (!input.tenant.executionId?.trim()) {
        throw new BriefIntelligenceError(
          "BRIEF_INVALID",
          "executionId is required"
        );
      }

      const clientCapabilityId =
        input.clientCapabilityId?.trim() &&
        isBriefRuntimeCapabilityId(input.clientCapabilityId.trim())
          ? input.clientCapabilityId.trim()
          : undefined;

      const availableContext = mergeContext(input.metadata, input.availableContext);
      const intent = classifyBriefIntent({
        prompt: rawPrompt,
        clientCapabilityId,
        productService: availableContext.productService,
      });

      const channels = extractChannels(rawPrompt, availableContext);
      const audience = extractAudience(rawPrompt);
      const tone = extractTone(rawPrompt);
      const dimensions = extractDimensions(rawPrompt);

      const { deliverables, provenance: delivProv } = extractDeliverables({
        prompt: rawPrompt,
        intent: intent.kind,
        channels,
        createId,
      });

      const { requirements, constraints, preferences, provenance: reqProv } =
        extractRequirementsAndConstraints({
          prompt: rawPrompt,
          audience,
          tone,
          dimensions,
        });

      if (availableContext.deliverableLabel) {
        requirements.push({
          key: "product_deliverable",
          value: availableContext.deliverableLabel,
          provenance: "PRODUCT_METADATA",
          confidence: 0.95,
        });
      }

      const requiredCapabilities = mapBriefCapabilities({
        intent: intent.kind,
        deliverables,
        clientCapabilityId,
        productService: availableContext.productService,
      });

      const { missing, assumptions } = detectMissingInformation({
        prompt: rawPrompt,
        intent: intent.kind,
        deliverables,
        audience,
        availableContext,
      });

      // Simple requests must not over-block
      const isSimple =
        (intent.kind === "copy" ||
          intent.kind === "social_content" ||
          intent.kind === "image" ||
          intent.kind === "video" ||
          intent.kind === "embedding" ||
          intent.kind === "audio") &&
        deliverables.length <= 2 &&
        rawPrompt.split(/\s+/).length < 50;
      const missingFiltered = isSimple
        ? missing.filter((m) => m.severity !== "required")
        : missing;

      const missingRequired = missingFiltered.some((m) => m.severity === "required");
      const ambiguous =
        intent.rationale.toLowerCase().includes("ambiguous") ||
        intent.confidence < 0.55;
      const unsupported =
        intent.kind === "other" &&
        !clientCapabilityId &&
        intent.confidence < 0.45;

      const status = resolveStatus({
        intentConfidence: intent.confidence,
        missingRequired,
        ambiguous,
        unsupported,
      });

      const systemConfidence = clamp(
        intent.confidence * 0.55 +
          (missingRequired ? 0.15 : 0.35) +
          (clientCapabilityId ? 0.1 : 0) -
          (ambiguous ? 0.1 : 0)
      );

      const provenance = [
        {
          field: "intent",
          value: intent.kind,
          source: "INFERENCE" as const,
          confidence: intent.confidence,
        },
        ...delivProv,
        ...reqProv,
        ...(clientCapabilityId
          ? [
              {
                field: "clientCapabilityId",
                value: clientCapabilityId,
                source: "CLIENT_CAPABILITY" as const,
                confidence: 1,
              },
            ]
          : []),
      ];

      const brief: StructuredBrief = {
        id: createId("brief"),
        version: STRUCTURED_BRIEF_VERSION,
        executionId: input.tenant.executionId,
        organizationId: input.tenant.organizationId,
        workspaceId: input.tenant.workspaceId,
        requestId: input.tenant.requestId,
        sourceRequest: {
          promptPreview: rawPrompt.slice(0, 200),
          clientCapabilityId,
        },
        intent: { kind: intent.kind, confidence: intent.confidence },
        objective: buildObjective(rawPrompt, intent.kind),
        deliverables,
        audience,
        channels,
        constraints,
        requirements,
        preferences,
        requiredCapabilities,
        outputRequirements: deliverables.map(
          (d) => d.expectedOutputType ?? d.type
        ),
        dependencies: deliverables.flatMap((d) => d.dependencies ?? []),
        priority: intent.kind === "campaign" || intent.kind === "website" ? "high" : "normal",
        missingInformation: missingFiltered,
        assumptions,
        confidence: {
          system: systemConfidence,
          extraction: intent.confidence,
        },
        status,
        provenance,
        createdAt: nowIso(),
      };

      return validateStructuredBrief(brief);
    } catch (err) {
      if (err instanceof BriefIntelligenceError) throw err;
      throw new BriefIntelligenceError(
        "BRIEF_GENERATION_FAILED",
        err instanceof Error ? err.message : "Brief generation failed"
      );
    }
  }
}

function mergeContext(
  metadata: Readonly<Record<string, unknown>> | undefined,
  available?: BriefAvailableContext
): BriefAvailableContext {
  return {
    brandId:
      available?.brandId ??
      (typeof metadata?.brandId === "string" ? metadata.brandId : undefined),
    brandName: available?.brandName,
    styleInstructions:
      available?.styleInstructions ??
      (typeof metadata?.styleInstructions === "string"
        ? metadata.styleInstructions
        : undefined),
    productService:
      available?.productService ??
      (typeof metadata?.service === "string" ? metadata.service : undefined),
    productCategory:
      available?.productCategory ??
      (typeof metadata?.category === "string" ? metadata.category : undefined),
    productPath:
      available?.productPath ??
      (typeof metadata?.productPath === "string" ? metadata.productPath : undefined),
    deliverableLabel:
      available?.deliverableLabel ??
      (typeof metadata?.deliverableLabel === "string"
        ? metadata.deliverableLabel
        : undefined),
    platform:
      available?.platform ??
      (typeof metadata?.platform === "string" ? metadata.platform : undefined),
    format:
      available?.format ??
      (typeof metadata?.format === "string" ? metadata.format : undefined),
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Number(n.toFixed(3))));
}

export function createBriefIntelligenceEngine(): IBriefIntelligenceEngine {
  return new BriefIntelligenceEngine();
}
