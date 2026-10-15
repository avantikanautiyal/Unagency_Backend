/**
 * Artifact-level QA for a delivered website preview.
 *
 * A model response is not a finished website until the page it produced has
 * actually rendered. This gate combines deterministic HTML checks (always
 * available) with the shared browser runtime evaluator (desktop + mobile
 * render, runtime errors, failed loads, accessibility), applies one bounded
 * repair pass for mechanical defects, and re-validates.
 */

import type { BrowserRuntimeCheckResult } from "../evaluation/runtime/browser-runtime-evaluator";

export type WebsiteQualityIssue = {
  readonly id: string;
  readonly severity: "blocking" | "warning";
  readonly detail: string;
};

export type WebsiteQualityReport = {
  /** False when the page did not render or a blocking defect remains. */
  readonly passed: boolean;
  /** True when a real browser rendered the page (not just static checks). */
  readonly browserEvaluated: boolean;
  readonly browserSkipReason?: string;
  readonly repairsApplied: readonly string[];
  readonly attempts: number;
  readonly issues: readonly WebsiteQualityIssue[];
  readonly viewports?: readonly {
    readonly name: string;
    readonly width: number;
    readonly renderSuccess: boolean;
    readonly horizontalOverflow: boolean;
  }[];
};

export type WebsiteRuntimeCheck = (html: string) => Promise<BrowserRuntimeCheckResult>;

const MAX_REPAIR_PASSES = 1;

function count(re: RegExp, html: string): number {
  return (html.match(re) ?? []).length;
}

/** Deterministic checks on the HTML source — no browser needed. */
export function staticWebsiteChecks(html: string): WebsiteQualityIssue[] {
  const issues: WebsiteQualityIssue[] = [];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    issues.push({ id: "document.incomplete", severity: "blocking", detail: "Missing <html> or <body>" });
  }
  if (text.length < 80) {
    issues.push({ id: "content.empty", severity: "blocking", detail: `Only ${text.length} chars of visible text` });
  }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    issues.push({ id: "responsive.viewport_meta", severity: "warning", detail: "No viewport meta — mobile renders zoomed out" });
  }
  if (!/<html[^>]*\slang=["'][^"']+["']/i.test(html)) {
    issues.push({ id: "a11y.lang", severity: "warning", detail: "<html> has no lang attribute" });
  }
  if (!/<title>[^<]*\S[^<]*<\/title>/i.test(html)) {
    issues.push({ id: "seo.title", severity: "warning", detail: "Missing or empty <title>" });
  }
  const h1 = count(/<h1[\s>]/gi, html);
  if (h1 !== 1) {
    issues.push({ id: "structure.h1", severity: "warning", detail: `${h1} <h1> elements (expected 1)` });
  }
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((tag) => !/\salt=/i.test(tag)).length;
  if (noAlt) {
    issues.push({ id: "a11y.img_alt", severity: "warning", detail: `${noAlt} image(s) without alt text` });
  }
  const badSrc = imgs.filter((tag) => {
    const src = tag.match(/\ssrc=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
    return !src || src === "#" || /^(undefined|null|placeholder)$/i.test(src);
  }).length;
  if (badSrc) {
    issues.push({ id: "assets.img_src", severity: "blocking", detail: `${badSrc} image(s) with an empty or placeholder src` });
  }
  const ids = new Set(Array.from(html.matchAll(/\sid=["']([^"']+)["']/gi), (m) => m[1]!));
  const deadAnchors = Array.from(html.matchAll(/<a\b[^>]*href=["']#([^"']+)["']/gi), (m) => m[1]!).filter(
    (id) => !ids.has(id)
  );
  if (deadAnchors.length) {
    issues.push({
      id: "navigation.dead_anchor",
      severity: "warning",
      detail: `In-page links to missing sections: ${[...new Set(deadAnchors)].slice(0, 5).map((a) => `#${a}`).join(", ")}`,
    });
  }
  return issues;
}

function browserIssues(result: BrowserRuntimeCheckResult): WebsiteQualityIssue[] {
  const issues: WebsiteQualityIssue[] = [];
  if (result.status === "FAILED" || result.startupSucceeded === false) {
    issues.push({
      id: "render.failed",
      severity: "blocking",
      detail: result.runtimeErrors.slice(0, 3).join("; ") || "Page failed to render",
    });
  } else if (result.runtimeErrors.length) {
    issues.push({ id: "runtime.errors", severity: "blocking", detail: result.runtimeErrors.slice(0, 3).join("; ") });
  }
  for (const v of result.viewportResults ?? []) {
    if (!v.renderSuccess) {
      issues.push({ id: `render.${v.name}_empty`, severity: "blocking", detail: `${v.name} ${v.width}px rendered empty` });
    }
    if (v.horizontalOverflow) {
      issues.push({
        id: `responsive.${v.name}_overflow`,
        severity: v.name === "mobile" ? "blocking" : "warning",
        detail: `${v.name} ${v.width}px: content is ${v.documentWidth}px wide (horizontal scroll)`,
      });
    }
  }
  const failedLoads = result.failedResourceLoads ?? [];
  if (failedLoads.length) {
    issues.push({
      id: "assets.failed_loads",
      severity: "warning",
      detail: `${failedLoads.length} resource(s) failed to load: ${failedLoads.slice(0, 3).join("; ")}`,
    });
  }
  const a11y = result.browserAccessibility;
  if (a11y?.evaluated && a11y.criticalCount + a11y.seriousCount > 0) {
    issues.push({
      id: "a11y.serious",
      severity: "warning",
      detail: `${a11y.criticalCount} critical / ${a11y.seriousCount} serious accessibility violation(s)`,
    });
  }
  return issues;
}

const RESPONSIVE_SAFETY_CSS =
  "<style data-unagency-qa>*,*::before,*::after{box-sizing:border-box}" +
  "img,video,svg,canvas,iframe{max-width:100%;height:auto}" +
  "pre,table{max-width:100%;overflow-x:auto}" +
  "h1,h2,h3,p,a,li{overflow-wrap:anywhere}</style>";

/**
 * Mechanical repairs only — content and design are never rewritten here.
 * Returns the repaired HTML and the repairs applied (empty when none apply).
 */
export function repairWebsiteHtml(
  html: string,
  issues: readonly WebsiteQualityIssue[]
): { html: string; repairs: string[] } {
  const ids = new Set(issues.map((i) => i.id));
  const repairs: string[] = [];
  let out = html;
  const inHead = (snippet: string) => {
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (m) => `${m}${snippet}`)
      : out.replace(/<html[^>]*>/i, (m) => `${m}<head>${snippet}</head>`);
  };
  if (ids.has("responsive.viewport_meta")) {
    inHead('<meta name="viewport" content="width=device-width, initial-scale=1">');
    repairs.push("added viewport meta");
  }
  if (ids.has("a11y.lang")) {
    out = out.replace(/<html(?![^>]*\slang=)([^>]*)>/i, '<html lang="en"$1>');
    repairs.push('added lang="en"');
  }
  if (ids.has("a11y.img_alt")) {
    // Decorative by default; meaningful alt text needs the content model.
    out = out.replace(/<img\b(?![^>]*\salt=)/gi, '<img alt=""');
    repairs.push('added alt="" to images without alt');
  }
  if ((ids.has("responsive.mobile_overflow") || ids.has("responsive.desktop_overflow")) && !out.includes("data-unagency-qa")) {
    inHead(RESPONSIVE_SAFETY_CSS);
    repairs.push("added responsive media/box-sizing safety CSS");
  }
  return { html: out, repairs };
}

/**
 * Validate → repair once → re-validate. Never reports `passed` for a page
 * that did not render or still has a blocking defect.
 */
export async function evaluateWebsitePreview(input: {
  readonly html: string;
  readonly runtimeCheck?: WebsiteRuntimeCheck;
}): Promise<{ html: string; report: WebsiteQualityReport }> {
  let html = input.html;
  const repairsApplied: string[] = [];
  let attempts = 0;
  let issues: WebsiteQualityIssue[] = [];
  let runtime: BrowserRuntimeCheckResult | undefined;

  for (let pass = 0; pass <= MAX_REPAIR_PASSES; pass += 1) {
    attempts += 1;
    runtime = input.runtimeCheck ? await input.runtimeCheck(html) : undefined;
    issues = [
      ...staticWebsiteChecks(html),
      ...(runtime?.evaluated ? browserIssues(runtime) : []),
    ];
    if (pass === MAX_REPAIR_PASSES) break;
    const { html: repaired, repairs } = repairWebsiteHtml(html, issues);
    if (!repairs.length) break;
    html = repaired;
    repairsApplied.push(...repairs);
  }

  return {
    html,
    report: {
      passed: !issues.some((i) => i.severity === "blocking"),
      browserEvaluated: Boolean(runtime?.evaluated),
      ...(runtime && !runtime.evaluated && runtime.skipReason ? { browserSkipReason: runtime.skipReason } : {}),
      ...(!runtime ? { browserSkipReason: "runtime_check_not_configured" } : {}),
      repairsApplied,
      attempts,
      issues,
      ...(runtime?.viewportResults
        ? {
            viewports: runtime.viewportResults.map((v) => ({
              name: v.name,
              width: v.width,
              renderSuccess: v.renderSuccess,
              horizontalOverflow: v.horizontalOverflow,
            })),
          }
        : {}),
    },
  };
}
