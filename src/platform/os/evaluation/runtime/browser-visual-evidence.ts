/**
 * Priority 4.1 — Objective browser render/visual evidence (not subjective quality judgement).
 */

import type { ObjectiveMetric } from "../evaluation-plane/types";
import {
  BROWSER_RUNTIME_EVALUATOR_ID,
  BROWSER_RUNTIME_EVALUATOR_VERSION,
} from "./browser-runtime-constants";

export type BrowserVisualEvidence = {
  readonly screenshotGenerated: boolean;
  readonly screenshotWidth?: number;
  readonly screenshotHeight?: number;
  readonly visibleContentChars: number;
  readonly semanticSections: readonly string[];
  readonly ctaPresent: boolean;
  readonly majorHeadings: readonly string[];
  readonly evidence: readonly string[];
};

export const BROWSER_VISUAL_DOM_SCRIPT = `
(() => {
  const body = document.body;
  const text = (body?.innerText ?? "").trim();
  const sections = [];
  if (document.querySelector("header")) sections.push("header");
  if (document.querySelector("nav")) sections.push("nav");
  if (document.querySelector("main")) sections.push("main");
  if (document.querySelector("footer")) sections.push("footer");
  if (document.querySelector("aside")) sections.push("aside");
  const headings = [];
  document.querySelectorAll("h1,h2,h3").forEach((h, i) => {
    if (i < 5) headings.push((h.textContent ?? "").trim().slice(0, 80));
  });
  const ctaPattern = /(sign up|get started|buy now|contact|learn more|subscribe|register|shop now)/i;
  let ctaPresent = false;
  document.querySelectorAll("a,button,[role='button']").forEach((el) => {
    const label = ((el.textContent ?? "") + " " + (el.getAttribute("aria-label") ?? "")).trim();
    if (label && ctaPattern.test(label)) ctaPresent = true;
  });
  return {
    visibleContentChars: text.length,
    semanticSections: sections,
    ctaPresent,
    majorHeadings: headings.filter(Boolean),
    documentWidth: Math.max(document.documentElement.scrollWidth, body?.scrollWidth ?? 0),
    documentHeight: Math.max(document.documentElement.scrollHeight, body?.scrollHeight ?? 0),
  };
})()
`;

export type BrowserVisualDomSnapshot = {
  readonly visibleContentChars: number;
  readonly semanticSections: readonly string[];
  readonly ctaPresent: boolean;
  readonly majorHeadings: readonly string[];
  readonly documentWidth: number;
  readonly documentHeight: number;
};

export function buildBrowserVisualEvidence(input: {
  readonly dom: BrowserVisualDomSnapshot;
  readonly screenshotGenerated: boolean;
  readonly screenshotWidth?: number;
  readonly screenshotHeight?: number;
}): BrowserVisualEvidence {
  const evidence: string[] = [];
  if (input.screenshotGenerated) {
    evidence.push(
      `screenshot generated ${input.screenshotWidth ?? "?"}x${input.screenshotHeight ?? "?"}`,
    );
  } else {
    evidence.push("screenshot not captured");
  }
  evidence.push(`visible content chars=${input.dom.visibleContentChars}`);
  if (input.dom.semanticSections.length > 0) {
    evidence.push(`semantic sections: ${input.dom.semanticSections.join(", ")}`);
  }
  evidence.push(`ctaPresent=${input.dom.ctaPresent}`);
  if (input.dom.majorHeadings.length > 0) {
    evidence.push(`headings: ${input.dom.majorHeadings.join(" | ")}`);
  }
  evidence.push(`document dimensions ${input.dom.documentWidth}x${input.dom.documentHeight}`);

  return Object.freeze({
    screenshotGenerated: input.screenshotGenerated,
    screenshotWidth: input.screenshotWidth,
    screenshotHeight: input.screenshotHeight,
    visibleContentChars: input.dom.visibleContentChars,
    semanticSections: Object.freeze([...input.dom.semanticSections]),
    ctaPresent: input.dom.ctaPresent,
    majorHeadings: Object.freeze([...input.dom.majorHeadings]),
    evidence: Object.freeze(evidence),
  });
}

export function buildBrowserVisualMetrics(input: {
  readonly visual: BrowserVisualEvidence;
  readonly artifactId?: string;
}): ObjectiveMetric[] {
  const { visual, artifactId } = input;
  const metrics: ObjectiveMetric[] = [];

  metrics.push(
    Object.freeze({
      metricId: "render.screenshot_generated",
      dimension: "quality.visual_quality",
      value: visual.screenshotGenerated,
      unit: "boolean",
      status: visual.screenshotGenerated ? "PASS" : "UNVERIFIED",
      measurementMethod: "browser_render_observation",
      evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
      evaluatorVersion: BROWSER_RUNTIME_EVALUATOR_VERSION,
      measurementStatus: visual.screenshotGenerated ? "MEASURED" : "NOT_AUTOMATED",
      evidence: visual.evidence,
      confidence: visual.screenshotGenerated ? "MEASURED" : "NOT_AUTOMATED",
      artifactId,
    }),
  );

  metrics.push(
    Object.freeze({
      metricId: "render.visible_content_chars",
      dimension: "quality.visual_quality",
      value: visual.visibleContentChars,
      unit: "count",
      threshold: 1,
      status: visual.visibleContentChars > 0 ? "PASS" : "FAIL",
      measurementMethod: "browser_render_observation",
      evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
      evaluatorVersion: BROWSER_RUNTIME_EVALUATOR_VERSION,
      measurementStatus: "MEASURED",
      evidence: Object.freeze([`visibleContentChars=${visual.visibleContentChars}`]),
      confidence: "MEASURED",
      artifactId,
    }),
  );

  metrics.push(
    Object.freeze({
      metricId: "render.semantic_sections",
      dimension: "quality.visual_hierarchy",
      value: visual.semanticSections.length,
      unit: "count",
      threshold: 1,
      status: visual.semanticSections.length > 0 ? "PASS" : "UNVERIFIED",
      measurementMethod: "browser_render_observation",
      evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
      evaluatorVersion: BROWSER_RUNTIME_EVALUATOR_VERSION,
      measurementStatus: "MEASURED",
      evidence: Object.freeze([
        visual.semanticSections.length > 0
          ? `sections=${visual.semanticSections.join(",")}`
          : "no semantic landmarks detected",
      ]),
      confidence: "MEASURED",
      artifactId,
    }),
  );

  metrics.push(
    Object.freeze({
      metricId: "render.cta_present",
      dimension: "quality.ux",
      value: visual.ctaPresent,
      unit: "boolean",
      status: "UNVERIFIED",
      measurementMethod: "browser_render_observation",
      evaluatorId: BROWSER_RUNTIME_EVALUATOR_ID,
      evaluatorVersion: BROWSER_RUNTIME_EVALUATOR_VERSION,
      measurementStatus: "MEASURED",
      evidence: Object.freeze([`ctaPresent=${visual.ctaPresent}`]),
      confidence: "MEASURED",
      artifactId,
    }),
  );

  return metrics;
}
