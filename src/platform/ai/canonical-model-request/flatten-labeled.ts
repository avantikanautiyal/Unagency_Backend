/**
 * Deterministic labeled-text serialization for providers that require a string.
 * This is the ONLY place CanonicalModelRequest is flattened.
 * No silent truncation. Stable field order. No timestamps / random IDs.
 */

import type {
  CanonicalContentPart,
  CanonicalModelRequest,
  CanonicalStructuredPart,
} from "./types";

function section(title: string, body: string): string {
  return `===== ${title} =====\n${body.trim()}`;
}

/** Deterministic JSON for structured parts (sorted object keys). */
export function stableSerializeCanonicalData(value: unknown): string {
  return stableJson(value, 0);
}

function stableJson(value: unknown, depth: number): string {
  if (depth > 40) return '"[MaxDepth]"';
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJson(v, depth + 1)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k], depth + 1)}`)
    .join(",")}}`;
}

function prettyStableJson(value: unknown): string {
  // Pretty-print with stable key order for model readability.
  try {
    return JSON.stringify(JSON.parse(stableSerializeCanonicalData(value)), null, 2);
  } catch {
    return stableSerializeCanonicalData(value);
  }
}

function formatStructuredPart(part: CanonicalStructuredPart): string {
  const headerLines = [
    `name: ${part.name}`,
    part.semanticRole ? `semanticRole: ${part.semanticRole}` : null,
    part.schema ? `schema: ${part.schema}` : null,
    part.version ? `version: ${part.version}` : null,
  ].filter((l): l is string => Boolean(l));

  if (part.name === "upstream_artifact" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    const meta = [
      `Role: ${String(d.role ?? part.semanticRole ?? "")}`,
      `Artifact: ${String(d.artifactKey ?? "")}`,
      `ArtifactId: ${String(d.artifactId ?? "")}`,
      `Version: ${String(d.version ?? "")}`,
      `Phase: ${String(d.phaseId ?? "")}`,
      `Status: ${String(d.status ?? "")}`,
      `SessionRole: ${String(d.sessionRole ?? "")}`,
      `SchemaVersion: ${String(d.schemaVersion ?? "")}`,
      `Required: ${String(d.required ?? "")}`,
      d.projectedSelectedOnly === true ? `ProjectedSelectedOnly: true` : null,
      d.artifactProjectionMode
        ? `ArtifactProjectionMode: ${String(d.artifactProjectionMode)}`
        : null,
    ]
      .filter((l): l is string => Boolean(l))
      .join("\n");
    const inner =
      d.data !== undefined && typeof d.data === "object"
        ? (d.data as Record<string, unknown>)
        : undefined;
    const proj = inner?.generationProjection as
      | Record<string, unknown>
      | undefined;
    if (proj?.mode === "selected_only") {
      const provenance = [
        "Content: (provenance only — creative choice is authoritative in SELECTED SEMANTIC DIRECTIONS)",
        `ProjectionMode: selected_only`,
        proj.choiceArrayKey != null
          ? `ChoiceArrayKey: ${String(proj.choiceArrayKey)}`
          : null,
        proj.selectedIndex != null
          ? `SelectedIndex: ${String(proj.selectedIndex)}`
          : null,
        proj.siblingChoiceCount != null
          ? `SiblingChoiceCount: ${String(proj.siblingChoiceCount)}`
          : null,
        inner?.schemaId ? `SchemaId: ${String(inner.schemaId)}` : null,
      ]
        .filter((l): l is string => Boolean(l))
        .join("\n");
      return `${meta}\n${provenance}`;
    }
    const content =
      d.data !== undefined ? prettyStableJson(d.data) : prettyStableJson(d);
    return `${meta}\nContent:\n${content}`;
  }

  if (
    part.name === "selected_semantic_directions" &&
    Array.isArray(part.data)
  ) {
    const blocks = (part.data as Array<Record<string, unknown>>).map(
      (entry, index) => {
        const choice = (entry.choice ?? entry) as Record<string, unknown>;
        const header = [
          `--- SELECTED DIRECTION ${index + 1} ---`,
          entry.artifactId ? `ArtifactId: ${String(entry.artifactId)}` : null,
          entry.version != null ? `Version: ${String(entry.version)}` : null,
          entry.choiceArrayKey
            ? `ChoiceArrayKey: ${String(entry.choiceArrayKey)}`
            : null,
          entry.selectedRouteIndex != null
            ? `SelectedRouteIndex: ${String(entry.selectedRouteIndex)}`
            : null,
        ]
          .filter((l): l is string => Boolean(l))
          .join("\n");
        const fieldLines = Object.keys(choice)
          .sort()
          .filter((k) => choice[k] != null && choice[k] !== "")
          .map((k) => `${k}: ${formatScalar(choice[k])}`);
        return `${header}\n${fieldLines.join("\n")}`;
      },
    );
    return blocks.join("\n\n");
  }

  if (part.name === "requirements" && Array.isArray(part.data)) {
    const lines = (part.data as Array<Record<string, unknown>>).map((r) => {
      const key = String(r.key ?? "");
      const display = String(r.displayValue ?? "");
      const priority = r.priority != null ? String(r.priority) : "";
      const explicit = r.explicit === true ? " (explicit)" : "";
      return `- ${key}: ${display}${priority ? ` [${priority}]` : ""}${explicit}`;
    });
    return lines.join("\n");
  }

  if (part.name === "constraints" && Array.isArray(part.data)) {
    const lines = (part.data as Array<Record<string, unknown>>).map((c) => {
      const source = String(c.source ?? "");
      const key = String(c.key ?? "");
      const display = String(c.displayValue ?? "");
      const priority = String(c.priority ?? "").toUpperCase();
      if (source === "exclusion" || priority === "HARD" || priority === "HARD_CONSTRAINT") {
        return `HARD CONSTRAINT — ${key}: ${display}`;
      }
      return `- [${source}] ${key}: ${display}`;
    });
    return lines.join("\n");
  }

  if (part.name === "exclusions" && Array.isArray(part.data)) {
    const lines = (part.data as Array<Record<string, unknown>>).map((e) => {
      const key = String(e.key ?? "");
      const display = String(e.displayValue ?? "");
      return `HARD CONSTRAINT — Do NOT include ${display || key}.`;
    });
    return lines.join("\n");
  }

  if (part.name === "selections" && Array.isArray(part.data)) {
    const lines = (part.data as Array<Record<string, unknown>>).map(
      (s) => `- ${String(s.phaseId ?? "")}: ${String(s.label ?? "")}`,
    );
    return lines.join("\n");
  }

  if (part.name === "approved_decisions" && Array.isArray(part.data)) {
    const lines = (part.data as Array<Record<string, unknown>>).map(
      (d) => `- ${String(d.phaseId ?? "")}: ${String(d.label ?? "")}`,
    );
    return lines.join("\n");
  }

  if (
    (part.name === "cdf_context" ||
      part.name === "current_task" ||
      part.name === "output_contract" ||
      part.name === "authority" ||
      part.name === "active_brief") &&
    part.data &&
    typeof part.data === "object"
  ) {
    const d = part.data as Record<string, unknown>;
    if (part.name === "output_contract" && Array.isArray(d.instructions)) {
      const mode =
        d.canonicalFullDeck === true
          ? "Mode: canonical_full_deck (approved slide-content + design-system)"
          : "Mode: phase_scoped_generation";
      return [...(d.instructions as string[]), mode].join("\n");
    }
    if (part.name === "authority" && Array.isArray(d.lines)) {
      return (d.lines as string[]).join("\n");
    }
    if (part.name === "current_task" || part.name === "cdf_context" || part.name === "active_brief") {
      return Object.keys(d)
        .sort()
        .map((k) => `${k}: ${formatScalar(d[k])}`)
        .join("\n");
    }
  }

  if (
    part.name === "deliverable_composition" &&
    part.data &&
    typeof part.data === "object"
  ) {
    const d = part.data as Record<string, unknown>;
    const identity = d.deliverableIdentity as Record<string, unknown> | undefined;
    const policies = d.policies as Record<string, unknown> | undefined;
    const textPolicy = policies?.text as Record<string, unknown> | undefined;
    const visualPolicy = policies?.visual as Record<string, unknown> | undefined;
    const brandPolicy = policies?.brand as Record<string, unknown> | undefined;
    const rrc = d.requiredRenderedCommunication as
      | Record<string, unknown>
      | undefined;
    const roleSep = d.semanticRoleSeparation as Record<string, unknown> | undefined;
    const lines: string[] = [
      `Deliverable kind: ${String(d.deliverableKind ?? "")}`,
      identity?.concreteLabel
        ? `Deliverable identity: ${String(identity.concreteLabel)}`
        : null,
      d.communicationMode
        ? `Communication mode: ${String(d.communicationMode)}`
        : null,
      Array.isArray(d.requiredElements)
        ? `Required elements: ${(d.requiredElements as unknown[]).map(String).join(", ")}`
        : null,
      Array.isArray(d.optionalElements) && (d.optionalElements as unknown[]).length
        ? `Optional elements: ${(d.optionalElements as unknown[]).map(String).join(", ")}`
        : null,
      Array.isArray(d.hierarchy) && (d.hierarchy as unknown[]).length
        ? `Hierarchy:\n${(d.hierarchy as Array<Record<string, unknown>>)
            .map(
              (h) =>
                `  - ${String(h.role ?? "")} (precedence ${String(h.precedence ?? "")})`,
            )
            .join("\n")}`
        : null,
      textPolicy
        ? `Text policy: placement=${String(textPolicy.placement ?? "")}, required=${String(textPolicy.required ?? false)}`
        : null,
      visualPolicy
        ? `Visual policy: subjectRequired=${String(visualPolicy.subjectRequired ?? false)}${visualPolicy.layoutIntent ? `, layoutIntent=${String(visualPolicy.layoutIntent)}` : ""}`
        : null,
      brandPolicy
        ? `Brand integration: markRole=${String(brandPolicy.markRole ?? "")}`
        : null,
    ].filter((l): l is string => Boolean(l));

    if (rrc && rrc.active === true) {
      lines.push(
        "REQUIRED RENDERED COMMUNICATION (must appear on asset; distinct from creative direction / brand signature / visual subject):",
      );
      if (typeof rrc.note === "string" && rrc.note.trim()) {
        lines.push(`  ${rrc.note}`);
      }
      const surfaces = Array.isArray(rrc.surfaces)
        ? (rrc.surfaces as Array<Record<string, unknown>>)
        : [];
      for (const s of surfaces) {
        if (s.resolutionStatus === "unresolved") {
          lines.push(
            `  - [${String(s.semanticClass ?? "required_rendered_communication")}] ${String(s.element ?? "")}: UNRESOLVED (must not reach provider)`,
          );
          continue;
        }
        lines.push(
          `  - [${String(s.semanticClass ?? "required_rendered_communication")}] ${String(s.element ?? "")}: ${String(s.text ?? "")} [provenance=${String(s.provenance ?? s.source ?? "")}]`,
        );
      }
      const modelAuthored = Array.isArray(rrc.modelAuthoredElements)
        ? (rrc.modelAuthoredElements as unknown[])
        : [];
      for (const el of modelAuthored) {
        lines.push(
          `  - [model_authored] ${String(el)}: legible text composed from deliverable guidance (no exact message declared)`,
        );
      }
    }

    if (typeof roleSep?.note === "string" && roleSep.note.trim()) {
      lines.push(`Semantic role separation: ${roleSep.note}`);
    }

    if (Array.isArray(d.filledSlots) && (d.filledSlots as unknown[]).length) {
      lines.push(
        "Filled composition slots:",
        ...(d.filledSlots as Array<Record<string, unknown>>).map(
          (s) =>
            `  - ${String(s.element ?? "")}: ${String(s.value ?? "")} [${String(s.source ?? "")}]`,
        ),
      );
    }
    if (
      Array.isArray(d.compositionGuidance) &&
      (d.compositionGuidance as unknown[]).length
    ) {
      lines.push(
        "Composition guidance:",
        ...(d.compositionGuidance as string[]).map((g) => `  - ${g}`),
      );
    }
    if (
      Array.isArray(d.structuralCompletion) &&
      (d.structuralCompletion as unknown[]).length
    ) {
      lines.push(
        "Structural completion (not aesthetic quality):",
        ...(d.structuralCompletion as Array<Record<string, unknown>>).map(
          (c) => `  - ${String(c.criterion ?? "")}`,
        ),
      );
    }
    if (typeof d.structuralCompletionNote === "string") {
      lines.push(String(d.structuralCompletionNote));
    }
    return lines.join("\n");
  }

  if (part.name === "production_spec" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    if (typeof d.text === "string" && d.text.trim()) {
      return [
        "TECHNICAL PRODUCTION CONSTRAINTS ONLY.",
        "Labels and section titles in this block are framework metadata — NOT brand names, logos, or wordmarks to render.",
        "Render only the selected client brand identity from BRAND CONTEXT and attached brand reference artwork.",
        d.text.trim(),
      ].join("\n");
    }
  }

  if (part.name === "output_requirements" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    if (typeof d.promptBlock === "string" && d.promptBlock.trim()) {
      return d.promptBlock.trim();
    }
    if (Array.isArray(d.lines)) {
      return `[Output requirements]\n${(d.lines as string[]).join("\n")}`;
    }
  }

  if (part.name === "resolved_references" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    const refs = Array.isArray(d.references)
      ? (d.references as Array<Record<string, unknown>>)
      : [];
    const lines = refs.map((r) => {
      const src = String(r.sourceText ?? "");
      const status = String(r.status ?? "");
      const target =
        r.targetId != null
          ? String(r.targetId)
          : r.artifactId != null
            ? `${String(r.artifactKey ?? "artifact")} ${String(r.artifactId)}@${String(r.version ?? "?")}`
            : r.slideNumber != null
              ? `slide ${String(r.slideNumber)}`
              : "(unresolved)";
      const method = String(r.resolutionMethod ?? "");
      return `- "${src}" → ${target} [${status}/${method}]`;
    });
    return lines.join("\n") || "(none)";
  }

  if (part.name === "working_memory" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    const note =
      typeof d.note === "string"
        ? d.note
        : "Contextual conversational evidence only.";
    const items = Array.isArray(d.items)
      ? (d.items as Array<Record<string, unknown>>)
      : [];
    const lines = items.map((item) => {
      const role = String(item.role ?? "unknown");
      const cat = String(item.relevanceCategory ?? "");
      const text = String(item.text ?? "").trim();
      const label =
        role === "user"
          ? "Previous user clarification"
          : "Recent conversation context";
      return `- ${label} [${cat}]: ${text}`;
    });
    return `${note}\n${lines.join("\n")}`.trim();
  }

  if (part.name === "multimodal_context" && part.data && typeof part.data === "object") {
    const d = part.data as Record<string, unknown>;
    const note =
      typeof d.note === "string"
        ? d.note
        : "User/application multimedia context (not ArtifactVersions).";
    const items = Array.isArray(d.items)
      ? (d.items as Array<Record<string, unknown>>)
      : [];
    const blocks = items.map((item, idx) => {
      const header = [
        `Item ${idx + 1}:`,
        `  sourceType: ${String(item.sourceType ?? "")}`,
        `  modality: ${String(item.modality ?? "")}`,
        `  mimeType: ${String(item.mimeType ?? "")}`,
        item.filename ? `  filename: ${String(item.filename)}` : null,
        item.assetId ? `  assetId: ${String(item.assetId)}` : null,
        item.attachmentId
          ? `  attachmentId: ${String(item.attachmentId)}`
          : null,
        `  deliveryStatus: ${String(item.deliveryStatus ?? "")}`,
        `  hasVisualProviderRef: ${String(item.hasVisualProviderRef ?? false)}`,
        item.relationshipLabel
          ? `  relationship: ${String(item.relationshipLabel)}`
          : null,
        item.semanticReferenceRole
          ? `  semanticReferenceRole: ${String(item.semanticReferenceRole)}`
          : null,
        item.referenceRoleResolutionSource
          ? `  referenceRoleResolutionSource: ${String(item.referenceRoleResolutionSource)}`
          : null,
      ]
        .filter((l): l is string => Boolean(l))
        .join("\n");
      const notes = Array.isArray(item.notes)
        ? `\n  notes: ${(item.notes as unknown[]).map(String).join("; ")}`
        : "";
      const extracted =
        typeof item.extractedText === "string" && item.extractedText.trim()
          ? `\n  extractedText (not original file):\n${String(item.extractedText).trim()}`
          : "";
      return `${header}${notes}${extracted}`;
    });
    return `${note}\n${blocks.join("\n\n")}`.trim();
  }

  return `${headerLines.join("\n")}\n${prettyStableJson(part.data)}`.trim();
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "(none)";
  if (Array.isArray(v)) return v.map(String).join(", ") || "(none)";
  if (typeof v === "object") return prettyStableJson(v);
  return String(v);
}

function sectionTitleForPart(part: CanonicalContentPart): string | null {
  if (part.type === "text") {
    if (part.semanticRole === "current_user_instruction") {
      return "CURRENT USER INSTRUCTION";
    }
    return null;
  }
  switch (part.name) {
    case "current_task":
      return "CURRENT TASK";
    case "requirements":
      return "REQUIREMENTS";
    case "constraints":
      return "CONSTRAINTS";
    case "exclusions":
      return "EXCLUSIONS";
    case "selections":
      return "SELECTIONS";
    case "approved_decisions":
      return "APPROVED DECISIONS";
    case "cdf_context":
      return "CDF PHASE";
    case "upstream_artifact":
      return null; // grouped under UPSTREAM ARTIFACTS
    case "deliverable_composition":
      return "DELIVERABLE COMPOSITION";
    case "output_contract":
      return "OUTPUT CONTRACT";
    case "output_requirements":
      return "OUTPUT REQUIREMENTS";
    case "resolved_references":
      return "RESOLVED REFERENCES";
    case "working_memory":
      return "WORKING MEMORY";
    case "multimodal_context":
      return "MULTIMODAL CONTEXT";
    case "active_brief":
      return "ACTIVE BRIEF";
    case "authority":
      return "AUTHORITY";
    case "production_spec":
      return "PRODUCTION SPEC";
    default:
      return part.name.toUpperCase().replace(/_/g, " ");
  }
}

/**
 * Flatten CanonicalModelRequest into the labeled prompt format expected by
 * current text providers. Side-effect free. No truncation.
 *
 * Sections are emitted in semantic precedence order so creative authority
 * (instruction / direction / brand) is not buried under production constraints.
 */
export function flattenCanonicalModelRequestToLabeledPrompt(
  request: CanonicalModelRequest,
): string {
  type LabeledSection = { readonly rank: number; readonly body: string };
  const labeled: LabeledSection[] = [];
  const upstreamBlocks: string[] = [];
  let ordinal = 0;

  const sectionRank = (title: string | null, semanticRole?: string): number => {
    if (semanticRole === "current_user_instruction" || title === "CURRENT USER INSTRUCTION")
      return 10;
    if (title === "CURRENT TASK") return 20;
    if (title === "DELIVERABLE COMPOSITION") return 25;
    if (semanticRole === "composition_authority") return 26;
    if (title === "SELECTED SEMANTIC DIRECTIONS") return 30;
    if (semanticRole === "selected_direction_authority") return 31;
    if (title === "BRAND CONTEXT") return 40;
    if (title === "PRODUCT GROUNDING") return 50;
    if (title === "REQUIREMENTS") return 60;
    if (title === "SELECTIONS" || title === "APPROVED DECISIONS") return 70;
    if (title === "OUTPUT CONTRACT" || title === "OUTPUT REQUIREMENTS") return 80;
    if (title === "MULTIMODAL CONTEXT") return 90;
    if (title === "ACTIVE BRIEF" || title === "CDF PHASE") return 100;
    if (title === "RESOLVED REFERENCES" || title === "WORKING MEMORY") return 110;
    if (title === "CONSTRAINTS" || title === "EXCLUSIONS") return 120;
    if (title === "PRODUCTION SPEC") return 200;
    if (title === "AUTHORITY") return 210;
    if (title === "UPSTREAM ARTIFACTS") return 150;
    return 140;
  };

  const pushLabeled = (
    title: string | null,
    body: string,
    semanticRole?: string,
  ) => {
    const text = title ? section(title, body) : body;
    labeled.push({
      rank: sectionRank(title, semanticRole) * 1000 + ordinal++,
      body: text,
    });
  };

  for (const message of request.messages) {
    for (const part of message.content) {
      if (part.type === "structured" && part.name === "upstream_artifact") {
        upstreamBlocks.push(
          `--- UPSTREAM ARTIFACT ${upstreamBlocks.length + 1} ---\n${formatStructuredPart(part)}`,
        );
        continue;
      }
      if (part.type === "text" && part.semanticRole === "current_user_instruction") {
        pushLabeled(
          "CURRENT USER INSTRUCTION",
          part.text.trim() || "(none)",
          part.semanticRole,
        );
        continue;
      }
      if (part.type === "text") {
        pushLabeled(null, part.text, part.semanticRole);
        continue;
      }
      const title = sectionTitleForPart(part);
      if (title) {
        pushLabeled(title, formatStructuredPart(part), part.semanticRole);
      } else {
        pushLabeled(null, formatStructuredPart(part), part.semanticRole);
      }
    }
  }

  if (upstreamBlocks.length) {
    pushLabeled("UPSTREAM ARTIFACTS", upstreamBlocks.join("\n\n"));
  } else {
    const hasExplicitEmpty = request.messages.some((m) =>
      m.content.some(
        (p) =>
          p.type === "structured" &&
          p.name === "upstream_artifacts_empty",
      ),
    );
    if (hasExplicitEmpty) {
      pushLabeled(
        "UPSTREAM ARTIFACTS",
        "(none — no exact canonical upstream pins for this phase)",
      );
    }
  }

  labeled.sort((a, b) => a.rank - b.rank);
  return labeled
    .map((s) => s.body)
    .join("\n\n")
    .trim();
}
