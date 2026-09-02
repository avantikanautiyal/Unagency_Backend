/**
 * EmailPlan generation helpers — HTML emailers / newsletters.
 * Keeps email jobs off the DocumentPlan brochure path.
 */

export function emailContextFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  priorPrompt: string,
): {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly outputKind?: string;
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
  const brandName =
    typeof metadata?.brandName === "string"
      ? metadata.brandName.trim()
      : typeof metadata?.requiredBrandName === "string"
        ? metadata.requiredBrandName.trim()
        : undefined;

  let userBrief = priorPrompt.trim();
  const briefMarker = userBrief.indexOf("[User brief]");
  if (briefMarker >= 0) {
    userBrief = userBrief.slice(briefMarker + "[User brief]".length).trim();
  }

  return {
    userBrief,
    brandName,
    service,
    subtype,
    exampleDeliverable,
    outputKind,
  };
}

export function buildEmailPlanInstructionBlock(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
}): string {
  const service = (input.service ?? "").toLowerCase();
  const subtype = (input.subtype ?? "").toLowerCase();
  const deliverable =
    input.exampleDeliverable?.trim() ||
    (subtype.includes("newsletter")
      ? "Send-ready HTML newsletter"
      : service === "email"
        ? "Send-ready HTML email"
        : "Send-ready HTML email");

  const lines = [
    "[Email deliverable — NOT a brochure PDF or presentation]",
    `Selected service output: ${deliverable}.`,
    "Return ONLY JSON matching schema EmailPlan.",
    "Required keys: title, subject, preheader, html, textFallback.",
    "html must be a complete email-safe HTML document (table layout, inline CSS, max-width ~600px).",
    "Include a clear hero/header, body copy, and a primary CTA button/link.",
    "subject: compelling inbox subject line; preheader: short preview text.",
    "textFallback: plain-text version of the email for clients that strip HTML.",
    "Do NOT return DocumentPlan sections, slides, routes, concepts, or LaunchPlan steps.",
  ];

  if (input.brandName?.trim()) {
    lines.push(`Brand name (spell exactly): ${input.brandName.trim()}.`);
  }
  if (input.userBrief.trim()) {
    lines.push(`User brief:\n${input.userBrief.trim()}`);
  }
  return lines.join("\n");
}

export function orderEmailProviderPrompt(input: {
  readonly body: string;
  readonly brandName?: string;
  readonly exampleDeliverable?: string;
  readonly userBrief?: string;
  readonly service?: string;
  readonly subtype?: string;
}): string {
  const header = [
    input.brandName?.trim()
      ? `Brand: ${input.brandName.trim()}`
      : undefined,
    input.exampleDeliverable?.trim()
      ? `Deliverable: ${input.exampleDeliverable.trim()}`
      : undefined,
    input.service || input.subtype
      ? `Service: ${[input.service, input.subtype].filter(Boolean).join(" / ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const brief = input.userBrief?.trim();
  return [header, input.body.trim(), brief ? `[User brief]\n${brief}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

export type EmailPlan = {
  readonly title: string;
  readonly subject: string;
  readonly preheader: string;
  readonly html: string;
  readonly textFallback: string;
};

export function parseEmailPlan(data: unknown): EmailPlan | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  const title = typeof rec.title === "string" ? rec.title.trim() : "";
  const subject = typeof rec.subject === "string" ? rec.subject.trim() : "";
  const preheader =
    typeof rec.preheader === "string" ? rec.preheader.trim() : "";
  const html = typeof rec.html === "string" ? rec.html.trim() : "";
  const textFallback =
    typeof rec.textFallback === "string" ? rec.textFallback.trim() : "";
  if (!title || !subject || !html) return null;
  return {
    title,
    subject,
    preheader: preheader || subject,
    html,
    textFallback: textFallback || subject,
  };
}
