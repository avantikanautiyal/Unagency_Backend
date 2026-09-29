/**
 * Preliminary deterministic requirement fidelity checks (M2).
 * Prefer M4 `validateCanonicalArtifact` for Presentation artifacts.
 * This helper remains for lightweight bag-level checks / backwards compatibility.
 */

import type { CdfRequirement } from "./types";

export type FidelityCheckResult = {
  ok: boolean;
  checks: Array<{
    key: string;
    kind: string;
    passed: boolean;
    detail: string;
  }>;
};

function active(reqs: CdfRequirement[]): CdfRequirement[] {
  return reqs.filter((r) => r.status === "active");
}

export function checkRequirementFidelity(
  requirements: CdfRequirement[],
  candidate?: {
    slideCount?: number;
    platform?: string;
    text?: string;
    colors?: string[];
    width?: number;
    height?: number;
    sections?: string[];
  },
): FidelityCheckResult {
  const a = active(requirements);
  const checks: FidelityCheckResult["checks"] = [];

  const slide = a.find((r) => r.key === "slide_count");
  if (slide && slide.value.kind === "number" && candidate?.slideCount != null) {
    const passed = candidate.slideCount === slide.value.value;
    checks.push({
      key: "slide_count",
      kind: "quantity",
      passed,
      detail: passed
        ? `slide_count=${slide.value.value}`
        : `expected ${slide.value.value}, got ${candidate.slideCount}`,
    });
  }

  const dims = a.find((r) => r.key === "dimensions");
  if (dims && dims.value.kind === "dimension" && candidate?.width != null) {
    const passed =
      candidate.width === dims.value.value.width &&
      (candidate.height == null ||
        candidate.height === dims.value.value.height);
    checks.push({
      key: "dimensions",
      kind: "dimension",
      passed,
      detail: passed
        ? "dimensions match"
        : `expected ${dims.displayValue}`,
    });
  }

  const platform = a.find((r) => r.key === "platform");
  if (platform && candidate?.platform) {
    const passed =
      platform.displayValue.toLowerCase() ===
      candidate.platform.toLowerCase();
    checks.push({
      key: "platform",
      kind: "platform",
      passed,
      detail: passed ? "platform match" : `expected ${platform.displayValue}`,
    });
  }

  for (const excl of a.filter((r) => r.category === "forbidden_content")) {
    if (!candidate?.text) continue;
    const needle = excl.displayValue.toLowerCase();
    const passed = !candidate.text.toLowerCase().includes(needle);
    checks.push({
      key: excl.key,
      kind: "forbidden_text",
      passed,
      detail: passed
        ? `exclusion "${excl.displayValue}" respected`
        : `forbidden content present: ${excl.displayValue}`,
    });
  }

  for (const mand of a.filter((r) => r.key === "mandatory_sections")) {
    if (mand.value.kind !== "string[]" || !candidate?.sections) continue;
    for (const sec of mand.value.value) {
      const passed = candidate.sections.includes(sec);
      checks.push({
        key: `section.${sec}`,
        kind: "mandatory_content",
        passed,
        detail: passed ? `has ${sec}` : `missing section ${sec}`,
      });
    }
  }

  for (const colorReq of a.filter(
    (r) =>
      r.key === "primary_background" ||
      r.key === "text_color" ||
      r.key === "accent_color",
  )) {
    if (!candidate?.colors?.length) continue;
    const passed = candidate.colors.some(
      (c) =>
        c.toLowerCase().includes(colorReq.displayValue.toLowerCase()) ||
        colorReq.displayValue.toLowerCase().includes(c.toLowerCase()),
    );
    checks.push({
      key: colorReq.key,
      kind: "color",
      passed,
      detail: passed
        ? `${colorReq.key} present`
        : `missing color ${colorReq.displayValue}`,
    });
  }

  return {
    ok: checks.every((c) => c.passed),
    checks,
  };
}
