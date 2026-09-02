/**
 * Priority 4.1 — Extended browser DOM accessibility inspection (MEASURED, not axe-core).
 */

import type {
  AccessibilityEvaluationEvidence,
  AccessibilityViolation,
} from "../artifact-evaluation/types";

export type BrowserDomViolation = {
  readonly id: string;
  readonly impact: "critical" | "serious" | "moderate" | "minor";
  readonly description: string;
  readonly selector?: string;
};

/** Serializable DOM snapshot collected inside page.evaluate. */
export type BrowserDomAccessibilitySnapshot = {
  readonly lang?: string;
  readonly imagesMissingAlt: readonly { readonly index: number; readonly src?: string }[];
  readonly inputsMissingLabel: readonly { readonly index: number; readonly type?: string }[];
  readonly emptyLinks: readonly { readonly index: number; readonly href?: string }[];
  readonly emptyButtons: readonly { readonly index: number }[];
  readonly missingMainLandmark: boolean;
  readonly missingNavLandmark: boolean;
  readonly headingHierarchyIssues: readonly { readonly level: number; readonly text?: string }[];
  readonly documentTitle?: string;
  readonly landmarkSummary?: readonly string[];
};

export function inspectBrowserDomAccessibility(
  snapshot: BrowserDomAccessibilitySnapshot,
): AccessibilityEvaluationEvidence {
  const violations: AccessibilityViolation[] = [];
  const evidence: string[] = ["browser DOM accessibility inspection (heuristic DOM rules, not axe-core)"];

  if (!snapshot.lang) {
    violations.push({
      id: "html-missing-lang",
      impact: "serious",
      description: "document.documentElement.lang is missing or empty",
    });
  }

  for (const img of snapshot.imagesMissingAlt) {
    violations.push({
      id: "image-alt-missing",
      impact: "critical",
      description: `img[${img.index}] missing alt attribute in rendered DOM`,
      selector: `img:nth-of-type(${img.index + 1})`,
    });
  }

  for (const input of snapshot.inputsMissingLabel) {
    violations.push({
      id: "input-missing-label",
      impact: "serious",
      description: `input[${input.index}] type=${input.type ?? "text"} missing label or aria-label in rendered DOM`,
    });
  }

  for (const link of snapshot.emptyLinks) {
    violations.push({
      id: "empty-link",
      impact: "moderate",
      description: `a[${link.index}] has no accessible text in rendered DOM`,
    });
  }

  for (const button of snapshot.emptyButtons) {
    violations.push({
      id: "empty-button",
      impact: "moderate",
      description: `button[${button.index}] has no accessible text or aria-label in rendered DOM`,
    });
  }

  if (snapshot.missingMainLandmark) {
    violations.push({
      id: "missing-main-landmark",
      impact: "moderate",
      description: "no main landmark element in rendered DOM",
    });
  }

  if (snapshot.missingNavLandmark) {
    violations.push({
      id: "missing-nav-landmark",
      impact: "minor",
      description: "no nav landmark element in rendered DOM",
    });
  }

  for (const heading of snapshot.headingHierarchyIssues) {
    violations.push({
      id: "heading-hierarchy-skip",
      impact: "moderate",
      description: `heading level ${heading.level} may skip hierarchy${heading.text ? `: "${heading.text.slice(0, 60)}"` : ""}`,
    });
  }

  const criticalCount = violations.filter((v) => v.impact === "critical").length;
  const seriousCount = violations.filter((v) => v.impact === "serious").length;
  const violationCount = violations.length;
  const score =
    violationCount === 0
      ? 100
      : Math.max(
          0,
          100 -
            criticalCount * 25 -
            seriousCount * 10 -
            (violationCount - criticalCount - seriousCount) * 5,
        );

  evidence.push(
    `browser DOM scan: ${violationCount} issues (${criticalCount} critical, ${seriousCount} serious)`,
  );
  if (snapshot.documentTitle) {
    evidence.push(`document.title="${snapshot.documentTitle.slice(0, 80)}"`);
  }
  if (snapshot.landmarkSummary?.length) {
    evidence.push(`landmarks: ${snapshot.landmarkSummary.join(", ")}`);
  }
  evidence.push("measurementMethod=browser_dom_heuristic (axe-core NOT wired)");

  return Object.freeze({
    evaluated: true,
    violationCount,
    criticalCount,
    seriousCount,
    violations: Object.freeze(violations),
    score,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}

/** Script body executed inside puppeteer page.evaluate — must be self-contained. */
export const BROWSER_DOM_ACCESSIBILITY_SCRIPT = `
(() => {
  const imagesMissingAlt = [];
  document.querySelectorAll("img").forEach((img, index) => {
    const alt = img.getAttribute("alt");
    if (alt == null) {
      imagesMissingAlt.push({ index, src: img.getAttribute("src") ?? undefined });
    }
  });
  const inputsMissingLabel = [];
  document.querySelectorAll("input,select,textarea").forEach((input, index) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    if (type === "hidden") return;
    const id = input.getAttribute("id");
    const hasLabel = Boolean(id && document.querySelector('label[for="' + id + '"]'));
    const hasAria = Boolean(input.getAttribute("aria-label") || input.getAttribute("aria-labelledby"));
    if (!hasLabel && !hasAria) {
      inputsMissingLabel.push({ index, type });
    }
  });
  const emptyLinks = [];
  document.querySelectorAll("a").forEach((a, index) => {
    const text = (a.textContent ?? "").trim();
    const aria = a.getAttribute("aria-label");
    if (!text && !aria) {
      emptyLinks.push({ index, href: a.getAttribute("href") ?? undefined });
    }
  });
  const emptyButtons = [];
  document.querySelectorAll("button").forEach((btn, index) => {
    const text = (btn.textContent ?? "").trim();
    const aria = btn.getAttribute("aria-label");
    if (!text && !aria) {
      emptyButtons.push({ index });
    }
  });
  const headingHierarchyIssues = [];
  let lastLevel = 0;
  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    const level = parseInt(h.tagName.slice(1), 10);
    if (lastLevel > 0 && level > lastLevel + 1) {
      headingHierarchyIssues.push({
        level,
        text: (h.textContent ?? "").trim().slice(0, 80) || undefined,
      });
    }
    lastLevel = level;
  });
  const landmarkSummary = [];
  ["header","nav","main","footer","aside"].forEach((tag) => {
    if (document.querySelector(tag)) landmarkSummary.push(tag);
  });
  return {
    lang: document.documentElement.lang || undefined,
    imagesMissingAlt,
    inputsMissingLabel,
    emptyLinks,
    emptyButtons,
    missingMainLandmark: !document.querySelector("main"),
    missingNavLandmark: !document.querySelector("nav"),
    headingHierarchyIssues,
    documentTitle: document.title || undefined,
    landmarkSummary,
  };
})()
`;
