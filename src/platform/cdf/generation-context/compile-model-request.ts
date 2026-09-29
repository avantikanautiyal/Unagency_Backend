/**
 * CanonicalGenerationRequest → CanonicalModelRequest.
 * Phase 5: assembles Production Spec + output requirements into CMR
 * BEFORE provider mapping (no post-flatten application appends).
 */

import {
  countCanonicalContentParts,
  type CanonicalContentPart,
  type CanonicalMessage,
  type CanonicalModelRequest,
  type CanonicalMultimodalProviderDeliveryBag,
  type CanonicalRequestMetadata,
} from "../../ai/canonical-model-request";
import type {
  CanonicalAssemblyEnrichments,
  CanonicalOutputRequirementsEnrichment,
  CanonicalProductionSpecEnrichment,
} from "./resolve-assembly-enrichments";
import type { CanonicalGenerationRequest } from "./types";
import { composeGenerationSemanticObjective } from "./compose-semantic-objective";
import { composeDeliverableSemantics } from "./compose-deliverable-semantics";
import type { CompiledCreativeComposition } from "./compile-deliverable-composition";
import { projectUpstreamArtifactDataForGeneration } from "./project-upstream-for-generation";
import {
  compiledRequiresOnAssetCommunication,
  compositionAuthorityText,
  selectedDirectionAuthorityText,
} from "./composition-authority";

export type CompileCanonicalModelRequestOptions = {
  productionSpec?: CanonicalProductionSpecEnrichment;
  outputRequirements?: CanonicalOutputRequirementsEnrichment;
  deliverableComposition?: CompiledCreativeComposition;
};

/**
 * Compile provider-neutral model request from already-resolved generation context.
 * No artifact loads, no Requirement Engine queries, no CDF dependency resolution.
 */
export function compileCanonicalModelRequestFromGeneration(
  generation: CanonicalGenerationRequest,
  options?: CompileCanonicalModelRequestOptions,
): CanonicalModelRequest {
  const content: CanonicalContentPart[] = [];
  const messages: CanonicalMessage[] = [];

  // Developer / house guidance — Production Spec (distinct from user instruction).
  if (options?.productionSpec) {
    messages.push({
      role: "developer",
      content: [
        {
          type: "structured",
          name: "production_spec",
          semanticRole: "production_spec",
          schema: options.productionSpec.productionRuleId,
          version: options.productionSpec.version,
          data: {
            productionRuleId: options.productionSpec.productionRuleId,
            contentHash: options.productionSpec.contentHash,
            authorityStatus: options.productionSpec.authorityStatus,
            edition: options.productionSpec.edition,
            provenance: options.productionSpec.provenance,
            version: options.productionSpec.version,
            sections: options.productionSpec.sections,
            text: options.productionSpec.text,
          },
        },
      ],
    });
  }

  content.push({
    type: "structured",
    name: "current_task",
    semanticRole: "cdf_current_task",
    data: {
      Service: generation.cdfContext.serviceId,
      Phase: generation.cdfContext.phaseId,
      PhaseName: generation.cdfContext.phaseContext.name,
      Modality: generation.outputContract.generationModality,
      ExecutionStrategy: generation.cdfContext.phaseContext.executionStrategy,
      "Target artifact": generation.outputContract.artifactKey,
      SemanticRole: generation.cdfContext.phaseContext.uxType,
      SemanticObjective: composeGenerationSemanticObjective(generation, {
        deliverableCompositionPresent: Boolean(options?.deliverableComposition),
        requiredOnAssetCommunication: compiledRequiresOnAssetCommunication(
          options?.deliverableComposition,
        ),
      }),
      DeliverableSemantics: composeDeliverableSemantics({
        deliverableLabel: generation.cdfContext.phaseContext.outputLabel,
        phaseName: generation.cdfContext.phaseContext.name,
        artifactKey: generation.outputContract.artifactKey,
        generationModality: generation.outputContract.generationModality,
        productGrounding: generation.productGrounding,
      }).statement,
      ...(generation.cdfContext.phaseContext.choiceNoun
        ? { ChoiceNoun: generation.cdfContext.phaseContext.choiceNoun }
        : {}),
      // Phase UI copy is not the creative objective — retained for UX continuity only.
      ...(generation.cdfContext.phaseContext.entryMessage?.trim()
        ? {
            PhaseEntryMessage:
              generation.cdfContext.phaseContext.entryMessage.trim(),
          }
        : {}),
      ...(generation.productGrounding?.subtype
        ? { Subtype: generation.productGrounding.subtype }
        : {}),
      ...(generation.productGrounding?.platform
        ? { Platform: generation.productGrounding.platform }
        : {}),
      ...(generation.productGrounding?.format
        ? { Format: generation.productGrounding.format }
        : {}),
      ContextId: generation.cdfContext.contextId,
      ContextHash: generation.generationContextHash,
    },
  });

  content.push({
    type: "text",
    text: generation.currentUserInstruction.trim() || "(none)",
    semanticRole: "current_user_instruction",
  });

  // CTI rewritten instruction — advisory only; never authoritative.
  if (generation.conversationalInterpretation?.text.trim()) {
    content.push({
      type: "structured",
      name: "conversational_interpretation",
      semanticRole: "advisory_interpretation",
      data: {
        note: "Advisory CTI interpretation only. Does NOT override CURRENT USER INSTRUCTION, REQUIREMENTS, APPROVED DECISIONS, or SELECTED SEMANTIC DIRECTIONS.",
        role: generation.conversationalInterpretation.role,
        // Fingerprint-length only in structured logs; full text stays in CMR content for the model.
        text: generation.conversationalInterpretation.text.trim(),
      },
    });
  }

  // Phase 6 — resolved references (original instruction remains above, unchanged).
  if (generation.referenceResolution?.applied) {
    content.push({
      type: "structured",
      name: "resolved_references",
      semanticRole: "resolved_references",
      data: {
        originalUserInstruction:
          generation.referenceResolution.originalUserInstruction,
        resolvedCount: generation.referenceResolution.resolvedCount,
        unresolvedCount: generation.referenceResolution.unresolvedCount,
        ambiguousCount: generation.referenceResolution.ambiguousCount,
        references: generation.referenceResolution.references.map((r) => ({
          sourceText: r.sourceText,
          referenceType: r.referenceType,
          targetType: r.targetType,
          status: r.status,
          resolutionMethod: r.resolutionMethod,
          provenance: r.provenance,
          targetId: r.targetId,
          artifactId: r.artifactId,
          version: r.version,
          artifactKey: r.artifactKey,
          phaseId: r.phaseId,
          slideNumber: r.slideNumber,
          slideId: r.slideId,
          candidateSummaries: r.candidateSummaries,
          reason: r.reason,
        })),
      },
    });
  }

  // Phase 7 — working memory (contextual evidence; never overrides instruction/CDF).
  if (generation.workingMemory?.applied) {
    const wm = generation.workingMemory;
    content.push({
      type: "structured",
      name: "working_memory",
      semanticRole: "working_memory",
      data: {
        note: "Contextual conversational evidence only. Does NOT override CURRENT USER INSTRUCTION, REQUIREMENTS, APPROVED DECISIONS, RESOLVED REFERENCES, or UPSTREAM ARTIFACTS.",
        conversationId: wm.conversationId,
        selectionMethod: wm.selectionMethod,
        truncated: wm.truncated,
        turnCount: wm.turnCount,
        characterCount: wm.characterCount,
        bounds: wm.bounds,
        items: wm.items.map((item) => ({
          messageId: item.messageId,
          role: item.role,
          text: item.text,
          createdAt: item.createdAt,
          order: item.order,
          relevanceCategory: item.relevanceCategory,
          relevanceReason: item.relevanceReason,
          isExplicitUserStatement: item.isExplicitUserStatement,
          executionId: item.executionId,
          artifactId: item.artifactId,
        })),
      },
    });
  }

  // Phase 9 — multimodal context (attachments ≠ ArtifactVersions).
  // Phase 9A — raw url/storageRef live on multimodalProviderDeliveries (mapper bag),
  // not in the structured prompt/log surface.
  const multimodalProviderDeliveries: CanonicalMultimodalProviderDeliveryBag[] =
    [];
  if (generation.multimodalContext?.applied) {
    const mm = generation.multimodalContext;
    content.push({
      type: "structured",
      name: "multimodal_context",
      semanticRole: "multimodal_context",
      data: {
        note: "User/application-provided multimedia context. Not a replacement for ArtifactVersion UPSTREAM ARTIFACTS. Extracted text is not the original file.",
        selectionMethod: mm.selectionMethod,
        truncated: mm.truncated,
        imageCount: mm.imageCount,
        documentCount: mm.documentCount,
        spreadsheetCount: mm.spreadsheetCount,
        unsupportedCount: mm.unsupportedCount,
        extractedTextCount: mm.extractedTextCount,
        items: mm.items.map((item) => {
          if (
            item.providerDelivery &&
            (item.providerDelivery.url || item.providerDelivery.storageRef)
          ) {
            multimodalProviderDeliveries.push({
              itemId: item.itemId,
              assetId: item.assetId,
              attachmentId: item.attachmentId,
              mimeType: item.providerDelivery.mimeType ?? item.mimeType,
              filename: item.filename,
              url: item.providerDelivery.url,
              storageRef: item.providerDelivery.storageRef,
            });
          }
          return {
            itemId: item.itemId,
            sourceType: item.sourceType,
            modality: item.modality,
            mimeType: item.mimeType,
            filename: item.filename,
            assetId: item.assetId,
            attachmentId: item.attachmentId,
            messageId: item.messageId,
            conversationId: item.conversationId,
            provenance: item.provenance,
            relationshipLabel: item.relationshipLabel,
            ...(item.semanticReferenceRole
              ? { semanticReferenceRole: item.semanticReferenceRole }
              : {}),
            ...(item.referenceRoleResolutionSource
              ? {
                  referenceRoleResolutionSource:
                    item.referenceRoleResolutionSource,
                }
              : {}),
            accessKind: item.accessKind,
            hasVisualProviderRef: item.hasVisualProviderRef,
            deliveryStatus: item.deliveryStatus,
            extractedTextChars: item.extractedTextChars,
            // Include extracted text body for model context (bounded upstream).
            extractedText: item.extractedText,
            sizeBytes: item.sizeBytes,
            notes: item.notes,
            // Redacted delivery presence only — no signed URLs / storage refs here.
            ...(item.providerDelivery
              ? {
                  providerDelivery: {
                    mimeType: item.providerDelivery.mimeType ?? item.mimeType,
                    hasUrl: Boolean(item.providerDelivery.url),
                    hasStorageRef: Boolean(item.providerDelivery.storageRef),
                  },
                }
              : {}),
          };
        }),
      },
    });
  }

  if (generation.requirements.length) {
    content.push({
      type: "structured",
      name: "requirements",
      semanticRole: "requirements",
      data: generation.requirements.map((r) => ({
        key: r.key,
        displayValue: r.displayValue,
        priority: r.priority,
        explicit: r.explicit,
        status: (r as { status?: string }).status,
        source: (r as { source?: string }).source,
      })),
    });
  }

  if (generation.constraints.length) {
    content.push({
      type: "structured",
      name: "constraints",
      semanticRole: "constraints",
      data: generation.constraints.map((c) => ({
        key: c.key,
        displayValue: c.displayValue,
        priority: c.priority,
        source: c.source,
      })),
    });
  }

  if (generation.exclusions.length) {
    content.push({
      type: "structured",
      name: "exclusions",
      semanticRole: "exclusions",
      data: generation.exclusions.map((e) => ({
        key: e.key,
        displayValue: e.displayValue,
        priority: e.priority,
      })),
    });
  }

  if (generation.selections.length) {
    content.push({
      type: "structured",
      name: "selections",
      semanticRole: "selections",
      data: generation.selections.map((s) => ({
        phaseId: s.phaseId,
        label: s.label,
        ...(s.routeTitle ? { routeTitle: s.routeTitle } : {}),
        ...(s.routeIndex != null ? { routeIndex: s.routeIndex } : {}),
      })),
    });
  }

  // Deliverable composition — WHAT structure the asset must contain (registry-driven).
  if (options?.deliverableComposition) {
    const dc = options.deliverableComposition;
    content.push({
      type: "structured",
      name: "deliverable_composition",
      semanticRole: "deliverable_composition",
      data: {
        deliverableKind: dc.deliverableKind,
        deliverableIdentity: dc.deliverableIdentity,
        communicationMode: dc.communicationMode,
        requiredElements: dc.requiredElements,
        optionalElements: dc.optionalElements,
        hierarchy: dc.hierarchy,
        policies: dc.policies,
        filledSlots: dc.filledSlots,
        compositionGuidance: dc.compositionGuidance,
        requiredRenderedCommunication: dc.requiredRenderedCommunication,
        semanticRoleSeparation: dc.semanticRoleSeparation,
        lowerAuthorityQualification: dc.lowerAuthorityQualification,
        structuralCompletion: dc.structuralCompletion,
        structuralCompletionNote: dc.structuralCompletionNote,
        userInstructionAuthoritative: dc.userInstructionAuthoritative,
      },
    });
    const authorityLine = compositionAuthorityText(
      dc.lowerAuthorityQualification,
      dc.semanticRoleSeparation,
    );
    if (authorityLine) {
      content.push({
        type: "text",
        text: authorityLine,
        semanticRole: "composition_authority",
      });
    }
  }

  // Authoritative selected semantic direction(s) — exact slice of parent X@V.
  if (generation.selectedSemanticChoices?.length) {
    content.push({
      type: "structured",
      name: "selected_semantic_directions",
      semanticRole: "selected_semantic_direction",
      data: generation.selectedSemanticChoices.map((c) => ({
        phaseId: c.phaseId,
        artifactId: c.artifactId,
        version: c.version,
        artifactKey: c.artifactKey,
        selectedRouteIndex: c.selectedRouteIndex,
        optionNumber: c.optionNumber,
        choiceArrayKey: c.choiceArrayKey,
        semanticFieldNames: [...c.semanticFieldNames],
        choice: c.choice,
      })),
    });
    content.push({
      type: "text",
      text: selectedDirectionAuthorityText({
        compositionPresent: Boolean(options?.deliverableComposition),
        requiredOnAsset: compiledRequiresOnAssetCommunication(
          options?.deliverableComposition,
        ),
      }),
      semanticRole: "selected_direction_authority",
    });
  }

  // User-authorized generation continuation — exact clicked leaf / raw art_*.
  // Never replaces SELECTED SEMANTIC DIRECTION. The attached multimodal image
  // (when present) is the authoritative SOURCE ASSET for downstream adaptation.
  if (generation.userSelectedGenerationReference) {
    const ref = generation.userSelectedGenerationReference;
    const multimodalHasSource = Boolean(
      generation.multimodalContext?.items.some(
        (item) =>
          item.modality === "image" &&
          (item.assetId === ref.visualArtifactId ||
            item.relationshipLabel === "user_selected_generation_reference") &&
          item.providerDelivery &&
          (item.providerDelivery.url || item.providerDelivery.storageRef),
      ),
    );
    content.push({
      type: "structured",
      name: "user_selected_generation_reference",
      semanticRole: "user_selected_generation_reference",
      data: {
        note: "UPSTREAM SELECTED VISUAL is the authoritative SOURCE ASSET for this downstream phase. Preserve symbol geometry, wordmark, proportions, and essential construction. Adapt / systematize / apply it — do NOT invent a new creative direction or replacement mark. Diagnostic/raw status does not weaken source authority for continuation.",
        referenceRole: "subject_reference",
        authority: "authoritative",
        referenceBehavior: "source_asset",
        multimodalSourceAttached: multimodalHasSource,
        selectionKind: ref.selectionKind,
        sourcePhaseId: ref.sourcePhaseId,
        sourceArtifactKey: ref.sourceArtifactKey,
        executionId: ref.executionId,
        visualArtifactId: ref.visualArtifactId,
        visualArtifactVersion: ref.visualArtifactVersion,
        isDiagnosticRaw: ref.isDiagnosticRaw,
        generationFanoutGroupId: ref.generationFanoutGroupId,
        generationFanoutTargetId: ref.generationFanoutTargetId,
        providerId: ref.providerId,
        modelId: ref.modelId,
        presentationEligibilityStatus: ref.presentationEligibilityStatus,
        upstreamArtifactId: ref.upstreamArtifactId,
        upstreamArtifactVersion: ref.upstreamArtifactVersion,
        upstreamChoiceId: ref.upstreamChoiceId,
        upstreamRouteIndex: ref.upstreamRouteIndex,
      },
    });
    content.push({
      type: "text",
      text: [
        "UPSTREAM SELECTED VISUAL (authoritative SOURCE ASSET):",
        `sourcePhase=${ref.sourcePhaseId}`,
        `sourceExecution=${ref.executionId}`,
        ref.generationFanoutTargetId
          ? `sourceGenerationTarget=${ref.generationFanoutTargetId}`
          : null,
        `sourceArtifact=${ref.visualArtifactId}${
          ref.visualArtifactVersion != null
            ? `@${ref.visualArtifactVersion}`
            : ""
        }`,
        ref.upstreamChoiceId
          ? `sourceChoice=${ref.upstreamChoiceId}`
          : null,
        ref.isDiagnosticRaw
          ? "selection=user_selected_generation_reference (diagnostic/raw media — still authoritative source for continuation)"
          : "selection=user_selected_generation_reference (canonical pin)",
        multimodalHasSource
          ? "media=attached multimodal image bytes (SOURCE ASSET)"
          : "media=UNRESOLVED — must not generate a replacement visual",
        "REFERENCE ROLE = subject_reference / authority = authoritative.",
        "Build the downstream deliverable FROM this exact selected visual.",
        "Do NOT reinterpret it as inspiration. Do NOT invent a new mark or concept.",
        "Preserve identity; refine / adapt / systematize / apply / create variants as the phase contract requires.",
      ]
        .filter(Boolean)
        .join("\n"),
      semanticRole: "user_selected_generation_reference",
    });
  }

  if (generation.brandContext && generation.brandContext.facts.length > 0) {
    content.push({
      type: "structured",
      name: "brand_context",
      semanticRole: "brand_context",
      data: {
        note: "SELECTED BRAND CONTEXT is authoritative for brand identity. Historical brand preferences are advisory when CURRENT USER INSTRUCTION intentionally overrides them for this turn. Does NOT replace CURRENT USER INSTRUCTION.",
        brandId: generation.brandContext.brandId,
        ...(generation.brandContext.brandName
          ? { brandName: generation.brandContext.brandName }
          : {}),
        ...(generation.brandContext.provenanceLine
          ? { provenanceLine: generation.brandContext.provenanceLine }
          : {}),
        facts: generation.brandContext.facts,
        negatives: generation.brandContext.negatives,
      },
    });
  }

  if (generation.productGrounding) {
    content.push({
      type: "structured",
      name: "product_grounding",
      semanticRole: "product_grounding",
      data: {
        ...(generation.productGrounding.service
          ? { service: generation.productGrounding.service }
          : {}),
        ...(generation.productGrounding.subtype
          ? { subtype: generation.productGrounding.subtype }
          : {}),
        ...(generation.productGrounding.platform
          ? { platform: generation.productGrounding.platform }
          : {}),
        ...(generation.productGrounding.format
          ? { format: generation.productGrounding.format }
          : {}),
        ...(generation.productGrounding.category
          ? { category: generation.productGrounding.category }
          : {}),
      },
    });
  }

  if (generation.approvedDecisions.length) {
    content.push({
      type: "structured",
      name: "approved_decisions",
      semanticRole: "approved_decisions",
      data: generation.approvedDecisions.map((d) => ({
        phaseId: d.phaseId,
        label: d.label,
      })),
    });
  }

  if (generation.cdfContext.activeBriefId) {
    content.push({
      type: "structured",
      name: "active_brief",
      semanticRole: "active_brief",
      data: {
        activeBriefId: generation.cdfContext.activeBriefId,
        activeBriefVersion: generation.cdfContext.activeBriefVersion,
        note: "ActiveBrief requirements are represented in the REQUIREMENTS part",
      },
    });
  }

  content.push({
    type: "structured",
    name: "cdf_context",
    semanticRole: "cdf_phase",
    data: {
      phaseId: generation.cdfContext.phaseId,
      uxType: generation.cdfContext.phaseContext.uxType,
      generationModality: generation.cdfContext.phaseContext.generationModality,
      dependencies: generation.cdfContext.phaseContext.dependencyPhaseIds,
      activeBriefId: generation.cdfContext.activeBriefId ?? "(none)",
      activeBriefVersion: generation.cdfContext.activeBriefVersion ?? "(none)",
      sessionVersion: generation.cdfContext.sessionVersion,
      sessionId: generation.cdfContext.sessionId,
      serviceId: generation.cdfContext.serviceId,
      contextId: generation.cdfContext.contextId,
      contextHash: generation.cdfContext.contextHash,
      status: generation.cdfContext.status,
      generationContextHash: generation.generationContextHash,
    },
  });

  if (generation.upstreamArtifacts.length) {
    for (const u of generation.upstreamArtifacts) {
      const projected = projectUpstreamArtifactDataForGeneration({
        upstream: u,
        selectedChoices: generation.selectedSemanticChoices ?? [],
        projectionMode: u.artifactProjectionMode ?? "full",
      });
      content.push({
        type: "structured",
        name: "upstream_artifact",
        semanticRole: u.role,
        schema: u.artifactKey,
        version: String(u.version),
        data: {
          artifactId: u.artifactId,
          version: u.version,
          artifactKey: u.artifactKey,
          phaseId: u.phaseId,
          role: u.role,
          status: u.status,
          schemaVersion: u.schemaVersion,
          sessionRole: u.sessionRole,
          required: u.required,
          lineage: u.lineage,
          artifactProjectionMode: projected.projectionMode,
          projectedSelectedOnly: projected.projectedSelectedOnly,
          data: projected.data,
        },
      });
    }
  } else {
    content.push({
      type: "structured",
      name: "upstream_artifacts_empty",
      semanticRole: "upstream_artifacts",
      data: { empty: true },
    });
  }

  // Phase / CDF output contract (generation modality instructions).
  const deliverableSemantics = composeDeliverableSemantics({
    deliverableLabel: generation.cdfContext.phaseContext.outputLabel,
    phaseName: generation.cdfContext.phaseContext.name,
    artifactKey: generation.outputContract.artifactKey,
    generationModality: generation.outputContract.generationModality,
    productGrounding: generation.productGrounding,
  });
  content.push({
    type: "structured",
    name: "output_contract",
    semanticRole: "output_contract",
    data: {
      instructions: [
        deliverableSemantics.statement,
        ...generation.outputContract.instructions,
      ],
      deliverableSemantics: deliverableSemantics.statement,
      deliverableConcreteLabel: deliverableSemantics.concreteLabel,
      deliverableSemanticsSource: deliverableSemantics.source,
      canonicalFullDeck: generation.outputContract.canonicalFullDeck,
      phaseId: generation.outputContract.phaseId,
      artifactKey: generation.outputContract.artifactKey,
      generationModality: generation.outputContract.generationModality,
      serviceId: generation.outputContract.serviceId,
    },
  });

  // Service-map deliverable requirements (formerly appendOutputRequirementsToPrompt).
  if (options?.outputRequirements) {
    content.push({
      type: "structured",
      name: "output_requirements",
      semanticRole: "output_requirements",
      data: {
        deliverable: options.outputRequirements.deliverable,
        kind: options.outputRequirements.kind,
        modalities: options.outputRequirements.modalities,
        mockupRole: options.outputRequirements.mockupRole,
        lines: options.outputRequirements.lines,
        promptBlock: options.outputRequirements.promptBlock,
      },
    });
  }

  content.push({
    type: "structured",
    name: "authority",
    semanticRole: "authority",
    data: {
      lines: [
        "Canonical ArtifactVersion data above is authoritative for upstream content.",
        "SELECTED SEMANTIC DIRECTION (when present) is the authoritative creative choice (HOW) — not UI labels, Option N, promptPreview, or route titles alone.",
        "DELIVERABLE COMPOSITION (when present) defines required structural/communication elements (WHAT) — distinct from creative direction, production spec, and user instruction. Required composition properties outrank lower-authority creative preferences when they conflict.",
        "BRAND CONTEXT (when present) is the authoritative selected brand — not app/product/organization names.",
        "Do not treat truncated approval notes as the source of truth when UPSTREAM ARTIFACT Content is present.",
        "CURRENT USER INSTRUCTION outranks Production Spec defaults when they conflict.",
        "Production Spec is technical production constraint guidance — not a replacement for explicit user requirements, selected creative direction, or client brand identity.",
        "Production Spec section titles and framework labels are NOT brand names/logos/wordmarks to render in the creative.",
        "WORKING MEMORY is contextual conversational evidence only — it does not override CURRENT USER INSTRUCTION, REQUIREMENTS, APPROVED DECISIONS, RESOLVED REFERENCES, SELECTED SEMANTIC DIRECTION, DELIVERABLE COMPOSITION, or UPSTREAM ARTIFACTS.",
        "MULTIMODAL CONTEXT is user/application attachment context — distinct from UPSTREAM ARTIFACTS (CDF ArtifactVersions). Extracted text is not the original file.",
      ],
    },
  });

  messages.push({
    role: "user",
    content,
  });

  const counts = countCanonicalContentParts({ messages });

  return {
    messages,
    context: {
      requirements: generation.requirements,
      constraints: generation.constraints,
      exclusions: generation.exclusions,
      selections: generation.selections,
      approvedDecisions: generation.approvedDecisions,
      cdfPhase: {
        phaseId: generation.cdfContext.phaseId,
        sessionId: generation.cdfContext.sessionId,
        serviceId: generation.cdfContext.serviceId,
        phaseContext: generation.cdfContext.phaseContext,
      },
      currentTask: {
        phaseId: generation.cdfContext.phaseId,
        artifactKey: generation.outputContract.artifactKey,
      },
    },
    outputContract: {
      name: generation.outputContract.artifactKey,
      required: true,
      instructions: generation.outputContract.instructions,
      phaseId: generation.outputContract.phaseId,
      artifactKey: generation.outputContract.artifactKey,
      generationModality: generation.outputContract.generationModality,
      canonicalFullDeck: generation.outputContract.canonicalFullDeck,
      version: "1",
    },
    metadata: {
      generationContextHash: generation.generationContextHash,
      cdfSessionId: generation.cdfContext.sessionId,
      cdfPhaseId: generation.cdfContext.phaseId,
      serviceId: generation.cdfContext.serviceId,
      source: "cdf_canonical_generation",
      productionSpecPresent: Boolean(options?.productionSpec),
      outputRequirementsPresent: Boolean(options?.outputRequirements),
      deliverableCompositionPresent: Boolean(options?.deliverableComposition),
      referenceResolutionApplied: Boolean(
        generation.referenceResolution?.applied,
      ),
      resolvedReferenceCount:
        generation.referenceResolution?.resolvedCount ?? 0,
      unresolvedReferenceCount:
        generation.referenceResolution?.unresolvedCount ?? 0,
      ambiguousReferenceCount:
        generation.referenceResolution?.ambiguousCount ?? 0,
      workingMemoryApplied: Boolean(generation.workingMemory?.applied),
      workingMemoryItemCount: generation.workingMemory?.turnCount ?? 0,
      workingMemoryCharacterCount:
        generation.workingMemory?.characterCount ?? 0,
      workingMemoryTruncated: Boolean(generation.workingMemory?.truncated),
      multimodalContextApplied: Boolean(generation.multimodalContext?.applied),
      multimodalItemCount: generation.multimodalContext?.items.length ?? 0,
      multimodalImageCount: generation.multimodalContext?.imageCount ?? 0,
      multimodalDocumentCount: generation.multimodalContext?.documentCount ?? 0,
      multimodalUnsupportedCount:
        generation.multimodalContext?.unsupportedCount ?? 0,
      multimodalExtractedTextCount:
        generation.multimodalContext?.extractedTextCount ?? 0,
      ...counts,
    } as CanonicalRequestMetadata,
    ...(multimodalProviderDeliveries.length > 0
      ? { multimodalProviderDeliveries }
      : {}),
  };
}

/** Compile CMR with Production Spec + output enrichments from metadata. */
export function assembleCanonicalModelRequest(
  generation: CanonicalGenerationRequest,
  enrichments: CanonicalAssemblyEnrichments,
): CanonicalModelRequest {
  return compileCanonicalModelRequestFromGeneration(generation, {
    productionSpec: enrichments.productionSpec,
    outputRequirements: enrichments.outputRequirements,
    deliverableComposition: enrichments.deliverableComposition,
  });
}

export type CanonicalSectionsPresentExtended = Record<
  | "currentTask"
  | "currentUserInstruction"
  | "resolvedReferences"
  | "workingMemory"
  | "conversationalInterpretation"
  | "multimodalContext"
  | "requirements"
  | "constraints"
  | "exclusions"
  | "selections"
  | "selectedSemanticDirections"
  | "brandContext"
  | "productGrounding"
  | "approvedDecisions"
  | "activeBrief"
  | "cdfPhase"
  | "upstreamArtifacts"
  | "productionSpec"
  | "outputContract"
  | "outputRequirements"
  | "deliverableComposition"
  | "authority",
  boolean
>;

/** Structured section presence without flattening to a prompt. */
export function detectCanonicalSectionsFromModelRequest(
  request: CanonicalModelRequest,
): CanonicalSectionsPresentExtended {
  const names = new Set<string>();
  let hasInstruction = false;
  for (const m of request.messages) {
    for (const p of m.content) {
      if (p.type === "text" && p.semanticRole === "current_user_instruction") {
        hasInstruction = true;
      }
      if (p.type === "structured") {
        names.add(p.name);
      }
    }
  }
  return {
    currentTask: names.has("current_task"),
    currentUserInstruction: hasInstruction,
    resolvedReferences: names.has("resolved_references"),
    workingMemory: names.has("working_memory"),
    conversationalInterpretation: names.has("conversational_interpretation"),
    multimodalContext: names.has("multimodal_context"),
    requirements: names.has("requirements"),
    constraints: names.has("constraints"),
    exclusions: names.has("exclusions"),
    selections: names.has("selections"),
    selectedSemanticDirections: names.has("selected_semantic_directions"),
    brandContext: names.has("brand_context"),
    productGrounding: names.has("product_grounding"),
    approvedDecisions: names.has("approved_decisions"),
    activeBrief: names.has("active_brief"),
    cdfPhase: names.has("cdf_context"),
    upstreamArtifacts:
      names.has("upstream_artifact") || names.has("upstream_artifacts_empty"),
    productionSpec: names.has("production_spec"),
    outputContract: names.has("output_contract"),
    outputRequirements: names.has("output_requirements"),
    deliverableComposition: names.has("deliverable_composition"),
    authority: names.has("authority"),
  };
}
