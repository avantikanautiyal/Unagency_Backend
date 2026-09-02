/**
 * Output contract registry foundation — Phase 0 + Step 1 canonical contracts.
 * Capability-level contracts (KNOWN) + service-level contracts via ServiceOutputContractRegistry.
 */

import type { IOutputContractRegistry } from "../contracts/layer-ports";
import type { OsLayerImplementationStatus } from "../contracts/layer-status";
import {
  defaultServiceOutputContractRegistry,
  resolveServiceOutputContractId,
} from "./output-contracts/service-contract-registry";

export {
  defaultServiceOutputContractRegistry,
  resolveServiceOutputContractId,
  ServiceOutputContractRegistry,
} from "./output-contracts/service-contract-registry";
export * from "./output-contracts";

const KNOWN: Readonly<
  Record<
    string,
    {
      readonly inputSchemaRef?: string;
      readonly outputSchemaRef?: string;
      readonly requiredArtifacts?: readonly string[];
      readonly status: OsLayerImplementationStatus;
    }
  >
> = {
  "text.generate": {
    inputSchemaRef: "prompt+metadata",
    outputSchemaRef: "providers/tools/structured-output | freeform text",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "image.generate": {
    inputSchemaRef: "prompt+image_params",
    outputSchemaRef: "media artifact",
    requiredArtifacts: ["image"],
    status: "partial",
  },
  "video.generate": {
    inputSchemaRef: "prompt+video_params",
    outputSchemaRef: "async media artifact",
    requiredArtifacts: ["video"],
    status: "partial",
  },
  "audio.transcribe": {
    inputSchemaRef: "audio blob",
    outputSchemaRef: "transcript text",
    requiredArtifacts: ["transcript"],
    status: "partial",
  },
  "embedding.generate": {
    inputSchemaRef: "text",
    outputSchemaRef: "embedding vector",
    requiredArtifacts: ["embedding"],
    status: "partial",
  },
  "reasoning.analyze": {
    inputSchemaRef: "prompt+context",
    outputSchemaRef: "analysis text",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "research.search": {
    inputSchemaRef: "query",
    outputSchemaRef: "research findings",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "audio.speech": {
    inputSchemaRef: "text",
    outputSchemaRef: "audio artifact",
    requiredArtifacts: ["audio"],
    status: "partial",
  },
  // Phase 4 — planner deliverable contracts (referenced by ExecutionPlan tasks)
  "output.social_caption": {
    inputSchemaRef: "brief+brand+knowledge",
    outputSchemaRef: "social caption text",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.copy": {
    inputSchemaRef: "brief+brand+knowledge",
    outputSchemaRef: "copy text",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.campaign_strategy": {
    inputSchemaRef: "brief+brand+knowledge",
    outputSchemaRef: "strategy document",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.messaging_framework": {
    inputSchemaRef: "strategy",
    outputSchemaRef: "messaging framework",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.creative_direction": {
    inputSchemaRef: "messaging",
    outputSchemaRef: "creative direction",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.instagram_content": {
    inputSchemaRef: "creative_direction",
    outputSchemaRef: "instagram posts",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.meta_ad_copy": {
    inputSchemaRef: "creative_direction",
    outputSchemaRef: "ad variants",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.landing_page": {
    inputSchemaRef: "creative_direction+product_facts",
    outputSchemaRef: "landing page structure",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.website": {
    inputSchemaRef: "brief+pages",
    outputSchemaRef: "website structure",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.presentation": {
    inputSchemaRef: "brief+brand+knowledge",
    outputSchemaRef: "PresentationRoutes (3 decks) + pptx/pdf artifacts",
    requiredArtifacts: ["text", "pptx", "pdf"],
    status: "partial",
  },
  "output.document": {
    inputSchemaRef: "brief+brand+knowledge",
    outputSchemaRef: "DocumentPlan + pdf/docx artifacts",
    requiredArtifacts: ["text", "pdf", "docx"],
    status: "partial",
  },
  "output.image": {
    inputSchemaRef: "prompt+brand.visual",
    outputSchemaRef: "image artifact",
    requiredArtifacts: ["image"],
    status: "partial",
  },
  "output.video": {
    inputSchemaRef: "prompt+brand",
    outputSchemaRef: "video artifact",
    requiredArtifacts: ["video"],
    status: "partial",
  },
  "output.research_report": {
    inputSchemaRef: "research query",
    outputSchemaRef: "research report",
    requiredArtifacts: ["text"],
    status: "partial",
  },
  "output.analysis": {
    inputSchemaRef: "analysis prompt",
    outputSchemaRef: "analysis text",
    requiredArtifacts: ["text"],
    status: "partial",
  },
};

export class OutputContractRegistry implements IOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus = "partial";

  /** Service-level canonical contracts (Step 1). */
  readonly serviceContracts = defaultServiceOutputContractRegistry;

  getContract(capabilityId: string) {
    const known = KNOWN[capabilityId];
    if (!known) {
      return {
        capabilityId,
        status: "not_implemented" as const,
      };
    }
    return { capabilityId, ...known };
  }
}

export const defaultOutputContractRegistry = new OutputContractRegistry();
