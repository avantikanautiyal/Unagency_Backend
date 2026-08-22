/**
 * Mixed-service prompt handling — detect mismatch, compound workflows, and splits.
 * Uses SERVICE_OUTPUT_MAP as the single product taxonomy (not parallel regex rules).
 * @see docs/MIXED_SERVICES_REQUESTS.md
 */

import {
  formatProductContextLabel,
  normalizeServiceSlug,
  productContextsAligned,
  SERVICE_DISPLAY_LABELS,
} from "./service-output-map";

export type ServiceContextConfidence = "high" | "medium" | "low";

export type ServiceContextKind = "match" | "mismatch" | "compound" | "split";

export type ServiceContextSelection = {
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly productPath?: string;
  readonly label: string;
  readonly deliverableLabel?: string;
};

export type ServiceContextWorkflowPhase = {
  readonly order: number;
  readonly role: "primary" | "follow_up" | "independent";
  readonly selection: Omit<ServiceContextSelection, "productPath"> & {
    productPath?: string;
  };
  readonly promptSnippet?: string;
};

export type ServiceContextWorkflow = {
  readonly kind: "compound" | "split";
  readonly acknowledgment?: string;
  readonly phases: readonly ServiceContextWorkflowPhase[];
  readonly parentProjectTitle?: string;
};

export type ServiceContextClassification = {
  readonly kind: ServiceContextKind;
  readonly confidence: ServiceContextConfidence;
  readonly rationale: string;
  readonly message?: string;
  readonly selected: ServiceContextSelection;
  readonly detected?: ServiceContextSelection;
  readonly suggestedSelection?: ServiceContextSelection;
  readonly workflow?: ServiceContextWorkflow;
  readonly splitOptions?: readonly ServiceContextSelection[];
};

export type ClassifyServiceContextInput = {
  readonly prompt: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly productPath?: string;
  readonly deliverableLabel?: string;
};

/** Cross-service intent signals — map to service, not hardcoded subtype slugs. */
type CrossServiceSignal = {
  readonly id: string;
  readonly service: string;
  readonly subtype?: string;
  readonly label: string;
  readonly patterns: readonly RegExp[];
  readonly weight: number;
};

const CROSS_SERVICE_SIGNALS: readonly CrossServiceSignal[] = [
  {
    id: "logo",
    service: "branding",
    subtype: "logo-design",
    label: "Logo Design",
    patterns: [/\blogo\b/i, /\bwordmark\b/i, /\bbrand mark\b/i, /\blogotype\b/i],
    weight: 3,
  },
  {
    id: "visual_identity",
    service: "branding",
    subtype: "visual-identity",
    label: "Visual Identity",
    patterns: [/\bvisual identity\b/i, /\bbrand identity\b/i],
    weight: 3,
  },
  {
    id: "brochure",
    service: "print",
    subtype: "brochures",
    label: "Brochure",
    patterns: [/\bbrochure\b/i, /\bflyer\b/i, /\bleaflet\b/i, /\bpamphlet\b/i],
    weight: 3,
  },
  {
    id: "poster",
    service: "print",
    subtype: "posters",
    label: "Poster",
    patterns: [/\bposter\b/i, /\bbillboard\b/i, /\booh\b/i],
    weight: 2,
  },
  {
    id: "social_post",
    service: "social",
    subtype: "content-design",
    label: "Social Media Creative",
    patterns: [
      /\bsocial media\b/i,
      /\binstagram\b/i,
      /\blinkedin\b/i,
      /\btiktok\b/i,
      /\bfeed post\b/i,
      /\bcarousel\b/i,
      /\bstories\b/i,
      /\breels?\b/i,
    ],
    weight: 2,
  },
  {
    id: "packaging",
    service: "packaging",
    label: "Packaging Design",
    patterns: [/\bpackaging\b/i, /\bbox design\b/i, /\blabel design\b/i],
    weight: 3,
  },
  {
    id: "video",
    service: "video",
    label: "Video & Motion",
    patterns: [
      /\bvideo\b/i,
      /\bmotion graphics\b/i,
      /\banimation\b/i,
      /\bexplainer\b/i,
      /\bcorporate film\b/i,
    ],
    weight: 3,
  },
  {
    id: "website",
    service: "website",
    label: "Website",
    patterns: [/\bwebsite\b/i, /\blanding page\b/i, /\bweb page\b/i],
    weight: 3,
  },
  {
    id: "presentation",
    service: "presentations",
    label: "Presentations",
    patterns: [
      /\bpresentation\b/i,
      /\bpitch deck\b/i,
      /\bslide deck\b/i,
      /\bdeck\b/i,
      /\bslides?\b/i,
    ],
    weight: 3,
  },
  {
    id: "brand_strategy",
    service: "strategy",
    label: "Brand Strategy",
    patterns: [
      /\bbrand strategy\b/i,
      /\bstrategy deck\b/i,
      /\bstrategic plan\b/i,
      /\bgo-to-market\b/i,
      /\bgtm\b/i,
    ],
    weight: 2,
  },
  {
    id: "email",
    service: "email",
    label: "Email Design",
    patterns: [/\bemail newsletter\b/i, /\bnewsletter\b/i, /\bemail template\b/i],
    weight: 2,
  },
  {
    id: "ads",
    service: "ads",
    label: "Ad Campaign",
    patterns: [/\bad campaign\b/i, /\bmeta ads\b/i, /\bdisplay ad\b/i, /\bbanner ad\b/i],
    weight: 2,
  },
  {
    id: "merchandise",
    service: "merchandise",
    label: "Merchandise",
    patterns: [/\bmerchandise\b/i, /\bt-?shirt\b/i, /\bapparel\b/i],
    weight: 2,
  },
  {
    id: "copy",
    service: "social",
    subtype: "copywriting",
    label: "Copywriting",
    patterns: [
      /\bcopywriting\b/i,
      /\btagline\b/i,
      /\bheadline\b/i,
      /\bcaption only\b/i,
      /\bwrite copy\b/i,
    ],
    weight: 2,
  },
];

const SEQUENTIAL_RE =
  /\b(then|after that|afterwards|once (it's|its|that is|this is)? approved|when (it's|its|that is|this is)? approved|followed by|next,? create|next,? make)\b/i;

const INDEPENDENT_AND_RE =
  /\b(create|make|design|build|need)\b[^.]{0,80}\band\b[^.]{0,80}\b(create|make|design|build|need)\b/i;

function titleCaseId(id: string): string {
  return id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function labelForService(service?: string): string {
  if (!service) return "Creative";
  const normalized = normalizeServiceSlug(service);
  return SERVICE_DISPLAY_LABELS[normalized] ?? titleCaseId(service);
}

function buildSelection(input: {
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  productPath?: string;
  deliverableLabel?: string;
  label?: string;
}): ServiceContextSelection {
  const pathParts = [input.service, input.subtype, input.platform, input.format].filter(
    Boolean
  ) as string[];
  const productPath = input.productPath ?? (pathParts.length ? pathParts.join("/") : undefined);
  const label =
    input.label ??
    formatProductContextLabel({
      service: input.service,
      subtype: input.subtype,
      platform: input.platform,
      format: input.format,
      deliverableLabel: input.deliverableLabel,
    });
  return {
    service: input.service,
    subtype: input.subtype,
    platform: input.platform,
    format: input.format,
    productPath,
    deliverableLabel: input.deliverableLabel ?? label,
    label,
  };
}

function selectionFromSignal(signal: CrossServiceSignal): ServiceContextSelection {
  return buildSelection({
    service: signal.service,
    subtype: signal.subtype,
    label: formatProductContextLabel({
      service: signal.service,
      subtype: signal.subtype,
      deliverableLabel: signal.label,
    }),
  });
}

function selectionKey(sel: ServiceContextSelection): string {
  return [
    sel.service ?? "",
    sel.subtype ?? "",
    sel.platform ?? "",
    sel.format ?? "",
  ].join("|");
}

type ScoredSignal = {
  signal: CrossServiceSignal;
  hits: number;
  index: number;
};

function scoreSignals(prompt: string): ScoredSignal[] {
  const scored: ScoredSignal[] = [];
  for (const signal of CROSS_SERVICE_SIGNALS) {
    let hits = 0;
    for (const pattern of signal.patterns) {
      if (pattern.test(prompt)) hits += signal.weight;
    }
    if (hits > 0) {
      scored.push({ signal, hits, index: prompt.search(signal.patterns[0]!) });
    }
  }
  return scored.sort((a, b) => b.hits - a.hits || a.index - b.index);
}

function detectExplicitIgnoreSelection(prompt: string): boolean {
  return /\b(ignore (my )?selection|wrong service|not logo|not branding)\b/i.test(
    prompt
  );
}

function contextsAlignedForGate(
  selected: ServiceContextSelection,
  detected: ServiceContextSelection,
  prompt: string
): boolean {
  return productContextsAligned({
    selected: {
      service: selected.service,
      subtype: selected.subtype,
      productPath: selected.productPath,
      prompt,
    },
    detected: {
      service: detected.service,
      subtype: detected.subtype,
      productPath: detected.productPath,
      prompt,
    },
  });
}

/**
 * Classify only the user's brief — never OS/product/brand constraint prefixes.
 * Brand blocks contain "logo" / "wordmark" policy text that false-triggers Logo Design.
 */
export function extractUserBriefForServiceContext(prompt: string): string {
  let text = prompt.trim();
  const markers = ["[User brief]", "[User prompt]", "Original client brief:"] as const;
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      text = text.slice(idx + marker.length).trim();
      break;
    }
  }
  return text
    .replace(/\[Product selection[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Selected brand[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Refine OS constraints\][\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Brief[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Brand Context[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Knowledge Context[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** User explicitly chose this service — trust when brief signals that service. */
function selectedServiceSignalMatch(
  selected: ServiceContextSelection,
  scored: readonly ScoredSignal[]
): ScoredSignal | undefined {
  const selSvc = normalizeServiceSlug(selected.service);
  if (!selSvc) return undefined;
  return scored.find(
    (s) => normalizeServiceSlug(s.signal.service) === selSvc && s.hits >= 3
  );
}

export function classifyServiceContext(
  input: ClassifyServiceContextInput
): ServiceContextClassification {
  const prompt = extractUserBriefForServiceContext(input.prompt.trim());
  const selected = buildSelection({
    service: input.service,
    subtype: input.subtype,
    platform: input.platform,
    format: input.format,
    productPath: input.productPath,
    deliverableLabel: input.deliverableLabel,
  });

  if (!prompt) {
    return {
      kind: "match",
      confidence: "low",
      rationale: "Empty prompt",
      selected,
    };
  }

  const scored = scoreSignals(prompt);
  if (scored.length === 0) {
    return {
      kind: "match",
      confidence: "low",
      rationale: "No strong deliverable signals — stay in selected service",
      selected,
    };
  }

  const top = scored[0]!;
  const second = scored[1];
  const detected = selectionFromSignal(top.signal);
  const aligned = contextsAlignedForGate(selected, detected, prompt);

  const hasSequential = SEQUENTIAL_RE.test(prompt);
  const hasIndependentAnd = INDEPENDENT_AND_RE.test(prompt);
  const multipleStrong =
    Boolean(second) && second.hits >= top.hits * 0.7 && top.signal.id !== second.signal.id;

  if (detectExplicitIgnoreSelection(prompt) && !aligned) {
    return {
      kind: "mismatch",
      confidence: "high",
      rationale: "User asked to honor prompt over selection",
      selected,
      detected,
      suggestedSelection: detected,
      message: `Switching to ${detected.label} based on your brief.`,
    };
  }

  if (multipleStrong) {
    const ordered = [...scored].sort((a, b) => a.index - b.index);
    const firstSel = selectionFromSignal(ordered[0]!.signal);
    const secondSel = selectionFromSignal(ordered[1]!.signal);

    if (hasSequential || /\bthen\b/i.test(prompt)) {
      const primary =
        contextsAlignedForGate(selected, firstSel, prompt) ||
        contextsAlignedForGate(selected, secondSel, prompt)
          ? selected
          : firstSel;
      const followUp =
        selectionKey(primary) === selectionKey(firstSel) ? secondSel : firstSel;

      return {
        kind: "compound",
        confidence: "high",
        rationale: "Sequential multi-deliverable workflow detected",
        selected,
        detected: followUp,
        suggestedSelection: followUp,
        message: `Got it — we'll start with your ${primary.label.toLowerCase()} here. Once that's approved, we can continue with ${followUp.label.toLowerCase()}.`,
        workflow: {
          kind: "compound",
          acknowledgment: `Got it — we'll start with your ${primary.label.toLowerCase()} here. Once that's approved, we can continue with ${followUp.label.toLowerCase()}.`,
          parentProjectTitle: `${primary.label} → ${followUp.label}`,
          phases: [
            { order: 1, role: "primary", selection: primary, promptSnippet: prompt },
            {
              order: 2,
              role: "follow_up",
              selection: followUp,
              promptSnippet: `Continue using the approved ${primary.label.toLowerCase()} asset.`,
            },
          ],
        },
      };
    }

    if (hasIndependentAnd || /\band also\b/i.test(prompt)) {
      const options = scored.slice(0, 2).map((s) => selectionFromSignal(s.signal));
      return {
        kind: "split",
        confidence: "high",
        rationale: "Two independent deliverables detected",
        selected,
        detected: options.find((o) => !contextsAlignedForGate(selected, o, prompt)) ?? options[0],
        splitOptions: options,
        message: `This brief includes both ${options[0]!.label} and ${options[1]!.label}. Which should we start with?`,
        workflow: {
          kind: "split",
          phases: options.map((sel, idx) => ({
            order: idx + 1,
            role: "independent" as const,
            selection: sel,
            promptSnippet: prompt,
          })),
        },
      };
    }
  }

  if (aligned) {
    return {
      kind: "match",
      confidence: top.hits >= 3 ? "high" : "medium",
      rationale: "Prompt aligns with selected product context (taxonomy)",
      selected,
      detected,
    };
  }

  const trustedForSelection = selectedServiceSignalMatch(selected, scored);
  if (trustedForSelection && !multipleStrong) {
    return {
      kind: "match",
      confidence: trustedForSelection.hits >= 6 ? "high" : "medium",
      rationale: "User brief signals explicitly selected service",
      selected,
      detected: selectionFromSignal(trustedForSelection.signal),
    };
  }

  const confidence: ServiceContextConfidence =
    top.hits >= 6 ? "high" : top.hits >= 3 ? "medium" : "low";

  if (confidence === "low") {
    return {
      kind: "match",
      confidence: "low",
      rationale: "Weak mismatch signal — proceed in current service",
      selected,
      detected,
    };
  }

  const selectedLabel = selected.label || labelForService(selected.service);
  const detectedLabel = detected.label || labelForService(detected.service);
  return {
    kind: "mismatch",
    confidence,
    rationale: `Prompt strongly suggests ${detectedLabel}, not ${selectedLabel}`,
    selected,
    detected,
    suggestedSelection: detected,
    message: `You're in ${selectedLabel}, but this brief looks like ${detectedLabel}. What would you like to do?`,
  };
}
