/**
 * DocumentPlan generation helpers — print brochures, leaflets, guidelines, etc.
 * Keeps document jobs off the presentation/pitch-deck path.
 */

import {
  buildPresentationMustUseBlock,
  extractBrandNameFromMegaprompt,
  extractPresentationMustUseFacts,
  extractAnchorTokens,
  type PresentationMustUseFact,
} from "./presentation-generation";

export type DocumentRelevanceResult = {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly anchorHits: number;
  readonly anchorTotal: number;
};

export function documentContextFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  priorPrompt: string
): {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly outputKind?: string;
  readonly mustUseFacts: readonly PresentationMustUseFact[];
} {
  const service =
    typeof metadata?.service === "string" ? metadata.service.trim() : undefined;
  const subtype =
    typeof metadata?.subtype === "string" ? metadata.subtype.trim() : undefined;
  const exampleDeliverable =
    typeof metadata?.exampleDeliverable === "string"
      ? metadata.exampleDeliverable.trim()
      : undefined;
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.trim()
      : undefined;

  let userBrief = priorPrompt.trim();
  const briefMarker = userBrief.indexOf("[User brief]");
  if (briefMarker >= 0) {
    userBrief = userBrief.slice(briefMarker + "[User brief]".length).trim();
  }

  const brandName =
    (typeof metadata?.brandName === "string" && metadata.brandName.trim()) ||
    (typeof metadata?.requiredBrandName === "string" &&
      metadata.requiredBrandName.trim()) ||
    extractBrandNameFromMegaprompt(userBrief) ||
    extractBrandNameFromMegaprompt(priorPrompt) ||
    undefined;

  const mustUseFacts = extractPresentationMustUseFacts({
    userBrief,
    brandName,
    metadata,
  });

  return {
    userBrief,
    brandName,
    service,
    subtype,
    exampleDeliverable,
    outputKind,
    mustUseFacts,
  };
}

export function buildDocumentPlanInstructionBlock(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly mustUseFacts?: readonly PresentationMustUseFact[];
}): string {
  const service = (input.service ?? "").toLowerCase();
  const subtype = (input.subtype ?? "").toLowerCase();
  const deliverable =
    input.exampleDeliverable?.trim() ||
    (service === "print" && subtype === "brochures"
      ? "Multipage brochure suitable for print or digital distribution"
      : service === "print"
        ? "Print document"
        : "Structured multipage document");

  const lines = [
    "[Document deliverable — NOT a pitch deck or presentation]",
    `Selected service output: ${deliverable}.`,
    "Return ONLY JSON matching schema DocumentPlan.",
    "Required keys: title (string), summary (string), sections (array of { heading, body }).",
    "Produce 3–10 substantive sections with clear headings and body copy ready for PDF export.",
    "This is a DOCUMENT (brochure / leaflet / guidelines / report) — do NOT return slides, routes, concepts, or LaunchPlan steps.",
    "Prioritise readability and one coherent publication system over decorative filler.",
  ];

  if (input.brandName?.trim()) {
    lines.push(
      `Brand name (spell exactly in title, summary, and at least one section): ${input.brandName.trim()}.`,
    );
  }

  const mustUse = buildPresentationMustUseBlock(input.mustUseFacts);
  if (mustUse) {
    lines.push(mustUse);
  }

  if (service === "print" && /brochure|leaflet/.test(subtype)) {
    lines.push(
      "Brochure layout intent: cover/intro, offer or story, product/service details, proof, and a clear CTA/contact section.",
    );
  }

  if (input.userBrief.trim()) {
    lines.push("", "[Client brief — honour every concrete requirement]", input.userBrief.trim());
  }

  return lines.join("\n");
}

/** Lightweight brief/brand gate before document PDF/DOCX export (mirrors presentation). */
export function validateDocumentPlanRelevance(input: {
  readonly data: unknown;
  readonly userBrief: string;
  readonly brandName?: string;
}): DocumentRelevanceResult {
  const plan =
    input.data && typeof input.data === "object"
      ? (input.data as Record<string, unknown>)
      : null;
  const sections = Array.isArray(plan?.sections) ? plan!.sections : [];
  if (!plan || sections.length === 0) {
    return {
      ok: false,
      reasons: ["empty_document"],
      anchorHits: 0,
      anchorTotal: 0,
    };
  }

  const blob = JSON.stringify(plan).toLowerCase();
  const reasons: string[] = [];
  const brand = input.brandName?.trim();
  if (brand && brand.length >= 2 && !blob.includes(brand.toLowerCase())) {
    reasons.push("missing_brand_name");
  }

  const anchors = extractAnchorTokens(input.userBrief, brand);
  const anchorHits = anchors.filter((a) => blob.includes(a)).length;
  const anchorTotal = anchors.length;
  if (anchorTotal >= 4 && anchorHits === 0) {
    reasons.push("low_brief_overlap");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    anchorHits,
    anchorTotal,
  };
}

export function orderDocumentProviderPrompt(input: {
  readonly body: string;
  readonly brandName?: string;
  readonly exampleDeliverable?: string;
  readonly userBrief: string;
  readonly service?: string;
  readonly subtype?: string;
}): string {
  const header = [
    "SYSTEM ROLE: senior editorial designer producing a multipage document plan.",
    input.exampleDeliverable
      ? `DELIVERABLE: ${input.exampleDeliverable}`
      : "DELIVERABLE: structured document (DocumentPlan JSON)",
    input.brandName ? `BRAND: ${input.brandName}` : undefined,
    input.service || input.subtype
      ? `SERVICE PATH: ${[input.service, input.subtype].filter(Boolean).join("/")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${input.body}`.trim();
}

export type SynthesizedDocumentPlan = {
  readonly title: string;
  readonly summary: string;
  readonly sections: ReadonlyArray<{
    readonly heading: string;
    readonly body: string;
  }>;
};

/**
 * Soft-recover a DocumentPlan when the model returned prose (or near-miss JSON)
 * instead of schema-valid structured output — keeps document jobs from hard-failing.
 */
export function synthesizeDocumentPlanFromText(
  text: string
): SynthesizedDocumentPlan | null {
  const trimmed = text.trim();
  if (trimmed.length < 40) return null;

  const fenced = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)```\s*$/);
  let body = (fenced?.[1] ?? trimmed).trim();

  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const fromJson = documentPlanFromLooseObject(
          parsed as Record<string, unknown>
        );
        if (fromJson) return fromJson;
      }
    } catch {
      // Fall through to prose recovery.
    }
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const fromJson = documentPlanFromLooseObject(
            parsed as Record<string, unknown>
          );
          if (fromJson) return fromJson;
        }
      } catch {
        // Fall through.
      }
    }
  }

  const headingChunks = body.split(/\n(?=#{1,3}\s+)/);
  if (headingChunks.length >= 2) {
    const sections: Array<{ heading: string; body: string }> = [];
    let title = "Document";
    for (const chunk of headingChunks) {
      const match = chunk.match(/^#{1,3}\s+(.+)\n?([\s\S]*)$/);
      if (!match) continue;
      const heading = match[1].trim();
      const sectionBody = match[2].trim();
      if (!heading || !sectionBody) continue;
      if (sections.length === 0) title = heading;
      sections.push({ heading, body: sectionBody });
    }
    if (sections.length >= 1) {
      while (sections.length < 3) {
        sections.push({
          heading: `Section ${sections.length + 1}`,
          body: sections[0].body,
        });
      }
      return {
        title,
        summary: sections[0].body.slice(0, 240),
        sections,
      };
    }
  }

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return null;

  const titleLine = paragraphs[0]
    .replace(/^#+\s*/, "")
    .split(/\n/)[0]
    .trim()
    .slice(0, 120);
  const title = titleLine || "Document";
  const contentParas =
    paragraphs.length > 1 && paragraphs[0].length < 160
      ? paragraphs.slice(1)
      : paragraphs;

  const sections: Array<{ heading: string; body: string }> = [];
  const chunkSize = Math.max(1, Math.ceil(contentParas.length / 5));
  for (let i = 0; i < contentParas.length && sections.length < 8; i += chunkSize) {
    const chunk = contentParas.slice(i, i + chunkSize).join("\n\n").trim();
    if (!chunk) continue;
    const firstLine = chunk.split(/\n/)[0].trim().slice(0, 80);
    sections.push({
      heading:
        sections.length === 0
          ? "Overview"
          : firstLine.length > 12 && firstLine.length < 80
            ? firstLine.replace(/[:.\-–—]+$/, "")
            : `Section ${sections.length + 1}`,
      body: chunk,
    });
  }
  if (sections.length === 0) {
    sections.push({ heading: "Overview", body });
  }
  while (sections.length < 3) {
    sections.push({
      heading: `Section ${sections.length + 1}`,
      body: sections[0].body,
    });
  }

  return {
    title,
    summary: sections[0].body.slice(0, 240),
    sections,
  };
}

function documentPlanFromLooseObject(
  data: Record<string, unknown>
): SynthesizedDocumentPlan | null {
  if (
    Array.isArray(data.routes) ||
    Array.isArray(data.concepts) ||
    (Array.isArray(data.slides) && !Array.isArray(data.sections))
  ) {
    return null;
  }
  const title =
    (typeof data.title === "string" && data.title.trim()) ||
    (typeof data.deliverable === "string" && data.deliverable.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    "";
  const summary =
    (typeof data.summary === "string" && data.summary.trim()) ||
    (typeof data.overview === "string" && data.overview.trim()) ||
    title;
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray(data.chapters)
      ? data.chapters
      : Array.isArray(data.pages)
        ? data.pages
        : [];
  // Never treat LaunchPlan steps[] as brochure/document sections.
  if (Array.isArray(data.steps) && !Array.isArray(data.sections)) {
    return null;
  }
  const sections: Array<{ heading: string; body: string }> = [];
  for (const item of rawSections) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const heading =
      (typeof row.heading === "string" && row.heading.trim()) ||
      (typeof row.title === "string" && row.title.trim()) ||
      (typeof row.name === "string" && row.name.trim()) ||
      "";
    const body =
      (typeof row.body === "string" && row.body.trim()) ||
      (typeof row.content === "string" && row.content.trim()) ||
      (typeof row.description === "string" && row.description.trim()) ||
      (typeof row.text === "string" && row.text.trim()) ||
      "";
    if (heading && body) sections.push({ heading, body });
  }
  if (!title || sections.length === 0) return null;
  while (sections.length < 3) {
    sections.push({
      heading: `Section ${sections.length + 1}`,
      body: summary || title,
    });
  }
  return { title, summary: summary || title, sections };
}
