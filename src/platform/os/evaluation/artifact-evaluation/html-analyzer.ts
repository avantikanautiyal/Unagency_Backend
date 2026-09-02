/**
 * Deterministic HTML artifact analysis — SEO, accessibility heuristics, visual hierarchy.
 * Operates on actual HTML bytes, not model claims.
 */

import type {
  AccessibilityEvaluationEvidence,
  AccessibilityViolation,
  SeoEvaluationEvidence,
  SeoFinding,
  VisualDimensionEvidence,
} from "./types";

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function matchAll(html: string, re: RegExp): RegExpMatchArray[] {
  return [...html.matchAll(re)];
}

export function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.trim().replace(/\s+/g, " ");
}

export function extractMetaDescription(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m?.[1]?.trim();
}

export function extractCanonical(html: string): string | undefined {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  return m?.[1]?.trim();
}

export function extractRobots(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);
  return m?.[1]?.trim();
}

export function headingLevels(html: string): readonly number[] {
  return matchAll(html, /<h([1-6])[^>]*>/gi).map((m) => Number(m[1]));
}

export function analyzeSeo(html: string): SeoEvaluationEvidence {
  const findings: SeoFinding[] = [];
  const evidence: string[] = [];

  const title = extractTitle(html);
  findings.push({
    checkId: "title_present",
    passed: Boolean(title && title.length > 0),
    detail: title ? `title="${title.slice(0, 80)}"` : "missing <title>",
  });

  const description = extractMetaDescription(html);
  findings.push({
    checkId: "meta_description",
    passed: Boolean(description && description.length >= 20),
    detail: description ? `description length=${description.length}` : "missing meta description",
  });

  const hLevels = headingLevels(html);
  const h1Count = hLevels.filter((l) => l === 1).length;
  findings.push({
    checkId: "single_h1",
    passed: h1Count === 1,
    detail: `h1 count=${h1Count}`,
  });

  let hierarchyOk = true;
  for (let i = 1; i < hLevels.length; i += 1) {
    if (hLevels[i]! - hLevels[i - 1]! > 1) {
      hierarchyOk = false;
      break;
    }
  }
  findings.push({
    checkId: "heading_hierarchy",
    passed: hierarchyOk,
    detail: hierarchyOk ? "heading levels sequential" : "heading level skip detected",
  });

  const imgs = matchAll(html, /<img\b[^>]*>/gi);
  const missingAlt = imgs.filter((m) => !/\balt=["'][^"']+["']/i.test(m[0]!)).length;
  findings.push({
    checkId: "image_alt_text",
    passed: imgs.length === 0 || missingAlt === 0,
    detail: `images=${imgs.length}, missing alt=${missingAlt}`,
  });

  const canonical = extractCanonical(html);
  findings.push({
    checkId: "canonical_url",
    passed: Boolean(canonical),
    detail: canonical ? `canonical=${canonical}` : "no canonical link",
  });

  const robots = extractRobots(html);
  findings.push({
    checkId: "robots_meta",
    passed: Boolean(robots),
    detail: robots ? `robots=${robots}` : "no robots meta (optional)",
  });

  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1];
  findings.push({
    checkId: "html_lang",
    passed: Boolean(lang),
    detail: lang ? `lang=${lang}` : "missing html lang attribute",
  });

  const passed = findings.filter((f) => f.passed).length;
  const score = findings.length > 0 ? Math.round((passed / findings.length) * 100) : 0;
  evidence.push(`SEO checks passed ${passed}/${findings.length} (${score}%)`);

  return Object.freeze({
    evaluated: true,
    findings: Object.freeze(findings),
    score,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeAccessibility(html: string): AccessibilityEvaluationEvidence {
  const violations: AccessibilityViolation[] = [];
  const evidence: string[] = [];

  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1];
  if (!lang) {
    violations.push({
      id: "html-missing-lang",
      impact: "serious",
      description: "html element missing lang attribute",
    });
  }

  const imgs = matchAll(html, /<img\b[^>]*>/gi);
  for (const [index, m] of imgs.entries()) {
    const tag = m[0]!;
    if (!/\balt=["'][^"']*["']/i.test(tag)) {
      violations.push({
        id: "image-alt-missing",
        impact: "critical",
        description: `img[${index}] missing non-empty alt attribute`,
        selector: `img:nth-of-type(${index + 1})`,
      });
    }
  }

  const inputs = matchAll(html, /<input\b[^>]*>/gi);
  for (const [index, m] of inputs.entries()) {
    const tag = m[0]!;
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "text";
    if (type === "hidden") continue;
    const hasLabel =
      /\bid=["']([^"']+)["']/i.test(tag) &&
      html.includes(`for="${tag.match(/\bid=["']([^"']+)["']/i)?.[1]}"`);
    const hasAria = /\baria-label=["'][^"']+["']/i.test(tag);
    if (!hasLabel && !hasAria) {
      violations.push({
        id: "input-missing-label",
        impact: "serious",
        description: `input[${index}] missing associated label or aria-label`,
      });
    }
  }

  const emptyLinks = matchAll(html, /<a\b[^>]*>\s*<\/a>/gi);
  for (const [index] of emptyLinks.entries()) {
    violations.push({
      id: "empty-link",
      impact: "moderate",
      description: `a[${index}] has no accessible text`,
    });
  }

  const criticalCount = violations.filter((v) => v.impact === "critical").length;
  const seriousCount = violations.filter((v) => v.impact === "serious").length;
  const violationCount = violations.length;

  const score =
    violationCount === 0
      ? 100
      : Math.max(0, 100 - criticalCount * 25 - seriousCount * 10 - (violationCount - criticalCount - seriousCount) * 5);

  evidence.push(
    `accessibility heuristic scan: ${violationCount} issues (${criticalCount} critical, ${seriousCount} serious)`,
  );

  return Object.freeze({
    evaluated: true,
    violationCount,
    criticalCount,
    seriousCount,
    violations: Object.freeze(violations),
    score,
    confidence: "heuristic",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeVisualHierarchy(html: string): VisualDimensionEvidence {
  const evidence: string[] = [];
  let score = 0;

  const hLevels = headingLevels(html);
  const h1Count = hLevels.filter((l) => l === 1).length;
  if (h1Count === 1) {
    score += 25;
    evidence.push("single primary h1 present");
  } else {
    evidence.push(`h1 count=${h1Count} (expected 1)`);
  }

  const hasMain = /<main\b/i.test(html);
  const hasNav = /<nav\b/i.test(html);
  const hasHeader = /<header\b/i.test(html);
  if (hasMain || hasHeader) {
    score += 20;
    evidence.push("semantic landmark present (main/header)");
  }
  if (hasNav) {
    score += 10;
    evidence.push("nav landmark present");
  }

  const ctaMatches = matchAll(html, /<(?:a|button)\b[^>]*>([^<]{2,80})<\/(?:a|button)>/gi);
  const ctaLike = ctaMatches.filter((m) =>
    /\b(get started|contact|sign up|learn more|buy|shop|cta|start)\b/i.test(m[1] ?? ""),
  );
  if (ctaLike.length > 0) {
    score += 15;
    evidence.push(`CTA-like controls detected: ${ctaLike.length}`);
  }

  const text = stripTags(html);
  if (text.length > 120) {
    score += 15;
    evidence.push(`primary text content length=${text.length}`);
  }

  let hierarchyOk = true;
  for (let i = 1; i < hLevels.length; i += 1) {
    if (hLevels[i]! - hLevels[i - 1]! > 1) hierarchyOk = false;
  }
  if (hierarchyOk && hLevels.length > 0) {
    score += 15;
    evidence.push("heading hierarchy sequential");
  }

  score = Math.min(100, score);

  return Object.freeze({
    dimensionId: "quality.visual_hierarchy",
    score,
    confidence: "heuristic",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeVisualQualityFromHtml(html: string): VisualDimensionEvidence {
  const evidence: string[] = [];
  let score = 0;

  if (/<style\b/i.test(html) || /\bclass=["'][^"']+["']/i.test(html)) {
    score += 20;
    evidence.push("styled markup detected");
  }
  if (/<img\b/i.test(html)) {
    score += 15;
    evidence.push("visual assets present");
  }
  const sections = matchAll(html, /<(?:section|article|div)[^>]*class=["'][^"']*(?:hero|banner|section|card)[^"']*["']/gi);
  if (sections.length > 0) {
    score += 20;
    evidence.push(`layout sections detected: ${sections.length}`);
  }
  const text = stripTags(html);
  if (text.length > 200) {
    score += 15;
    evidence.push("substantive visible text");
  }
  if (/<footer\b/i.test(html)) {
    score += 10;
    evidence.push("footer region present");
  }
  if (/<meta[^>]+viewport/i.test(html)) {
    score += 20;
    evidence.push("viewport meta for responsive layout");
  }

  score = Math.min(100, score);

  return Object.freeze({
    dimensionId: "quality.visual_quality",
    score,
    confidence: "heuristic",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeBrandAdherence(input: {
  readonly html: string;
  readonly brandColors?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly brandAvoidTerms?: readonly string[];
}): import("./types").BrandAdherenceEvidence {
  const evidence: string[] = [];
  const lower = input.html.toLowerCase();
  const matchedColors: string[] = [];
  const matchedTerms: string[] = [];

  for (const color of input.brandColors ?? []) {
    const normalized = color.trim().toLowerCase();
    if (normalized && lower.includes(normalized)) {
      matchedColors.push(color);
    }
  }

  for (const term of input.brandPreferredTerms ?? []) {
    const t = term.trim().toLowerCase();
    if (t.length > 2 && lower.includes(t)) {
      matchedTerms.push(term);
    }
  }

  let avoidHits = 0;
  for (const term of input.brandAvoidTerms ?? []) {
    const t = term.trim().toLowerCase();
    if (t.length > 2 && lower.includes(t)) {
      avoidHits += 1;
      evidence.push(`avoid term detected: ${term}`);
    }
  }

  const colorScore =
    (input.brandColors?.length ?? 0) > 0
      ? Math.round((matchedColors.length / input.brandColors!.length) * 50)
      : 25;
  const termScore =
    (input.brandPreferredTerms?.length ?? 0) > 0
      ? Math.round((matchedTerms.length / input.brandPreferredTerms!.length) * 40)
      : 25;
  const penalty = avoidHits * 15;
  const score = Math.max(0, Math.min(100, colorScore + termScore + 10 - penalty));

  if (matchedColors.length) evidence.push(`matched brand colors: ${matchedColors.join(", ")}`);
  if (matchedTerms.length) evidence.push(`matched brand terms: ${matchedTerms.join(", ")}`);

  return Object.freeze({
    evaluated: (input.brandColors?.length ?? 0) > 0 || (input.brandPreferredTerms?.length ?? 0) > 0,
    score,
    matchedColors: Object.freeze(matchedColors),
    matchedTerms: Object.freeze(matchedTerms),
    confidence: "heuristic",
    evidence: Object.freeze(evidence.length ? evidence : ["no brand context supplied"]),
  });
}
