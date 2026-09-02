/**
 * Priority 4.2 — Objective email artifact inspection (not cross-client rendering claims).
 */

import type { EmailArtifactEvidence } from "./types";

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function analyzeEmailHtml(input: {
  readonly html: string;
  readonly subject?: string;
  readonly preheader?: string;
}): EmailArtifactEvidence {
  const evidence: string[] = ["email objective inspection (not cross-client rendering test)"];
  const html = input.html;

  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasBodyTag = /<body[\s>]/i.test(html);
  const htmlValid = hasHtmlTag && hasBodyTag;
  if (htmlValid) evidence.push("html/body structure present");
  else evidence.push("missing html or body element");

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const subjectPresent = Boolean(
    (input.subject && input.subject.trim().length > 0) ||
      (title && title.length > 0),
  );
  if (subjectPresent) {
    evidence.push(`subject/title present: "${(input.subject ?? title ?? "").slice(0, 60)}"`);
  }

  const visibleText = stripTags(html);
  const contentPresent = visibleText.length >= 20;
  if (contentPresent) evidence.push(`visible text length=${visibleText.length}`);
  else evidence.push(`empty or minimal content (${visibleText.length} chars)`);

  const ctaMatches = [...html.matchAll(/<(?:a|button)\b[^>]*>([^<]{2,80})<\/(?:a|button)>/gi)];
  const ctaPresent = ctaMatches.some((m) => (m[1] ?? "").trim().length > 0);
  if (ctaPresent) evidence.push(`CTA controls=${ctaMatches.length}`);

  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']*)["']/gi)];
  const linkCount = links.length;
  if (linkCount > 0) evidence.push(`links=${linkCount}`);

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  let brokenImageRefs = 0;
  for (const m of imgs) {
    const tag = m[0]!;
    const src = tag.match(/\bsrc=["']([^"']*)["']/i)?.[1];
    if (!src || src.trim().length === 0) brokenImageRefs += 1;
  }
  if (imgs.length > 0) {
    evidence.push(`images=${imgs.length}, broken_refs=${brokenImageRefs}`);
  }

  const viewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  if (viewportMeta) evidence.push("viewport meta present (responsive structure signal)");

  const tableLayout = /<table\b/i.test(html);
  if (tableLayout) evidence.push("table layout detected");

  return Object.freeze({
    evaluated: true,
    htmlValid,
    subjectPresent,
    contentPresent,
    ctaPresent,
    linkCount,
    imageCount: imgs.length,
    brokenImageRefs,
    viewportMeta,
    tableLayout,
    visibleTextLength: visibleText.length,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}
