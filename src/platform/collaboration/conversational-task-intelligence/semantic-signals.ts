/**
 * Priority 4.5 — Semantic signal extraction (contextual, not phrase-command mapping).
 */

export type SemanticSignals = {
  readonly isQuestion: boolean;
  readonly isImperative: boolean;
  readonly isFeedback: boolean;
  readonly isApproval: boolean;
  readonly isRejection: boolean;
  readonly isContinuation: boolean;
  readonly isVariation: boolean;
  readonly isModification: boolean;
  readonly isRemoval: boolean;
  readonly isReplacement: boolean;
  readonly isReversion: boolean;
  readonly isComparison: boolean;
  readonly isExplanation: boolean;
  readonly isSummarization: boolean;
  readonly isTransformation: boolean;
  readonly isTaskSwitch: boolean;
  readonly isReset: boolean;
  readonly isSelection: boolean;
  readonly isCreation: boolean;
  readonly isExport: boolean;
  readonly exportFormat?: "pdf" | "pptx" | "docx" | "html" | "zip";
  readonly hasDeicticReference: boolean;
  readonly referencesExistingResult: boolean;
  readonly isAssetExtraction: boolean;
  readonly isDeliveryRequest: boolean;
  readonly hasOrdinalReference: boolean;
  readonly hasVersionReference: boolean;
  readonly hasSuperlativeReference: boolean;
  readonly persistentScope: boolean;
  readonly temporaryScope: boolean;
  readonly mentionsArtifactType?: string;
  readonly quantityHint?: "single" | "multiple";
};

const QUESTION_START =
  /^(why|what|how|when|where|who|which|can you|could you|would you|do you|is there|are there)\b/i;
const IMPERATIVE_START =
  /^(create|make|build|design|generate|write|draft|produce|develop|give me|show me|try|add|remove|change|update|export|summarize|explain|compare|approve|reject|undo|revert|start over|reset)\b/i;
const FEEDBACK_MARKERS =
  /\b(don't like|do not like|not quite|not what i wanted|dislike|too busy|too plain|feels off|misses the mark)\b/i;
const APPROVAL_MARKERS =
  /\b(yes|yep|yeah|sure|go ahead|do that|sounds good|looks good|approved|approve|proceed|let's do it|perfect)\b/i;
const REJECTION_MARKERS =
  /\b(no|nope|don't|do not|stop|cancel|never mind|nevermind|not that)\b/i;
const CONTINUATION_MARKERS =
  /\b(continue|keep going|next step|proceed|expand|build out|flesh out|develop further|carry on)\b/i;
const VARIATION_MARKERS =
  /\b(alternative|alternatives|variation|variations|option|options|direction|directions|another version|more versions|different take|different direction)\b/i;
const QUANTITY_VARIATION =
  /\b(more|another|additional|extra|few|several|some other|different)\b/i;
const MODIFICATION_MARKERS =
  /\b(make|change|update|adjust|refine|tweak|improve|polish|strengthen|soften|simplify|elevate|edit)\b/i;
const REMOVAL_MARKERS =
  /\b(remove|delete|drop|exclude|omit|take out|get rid of|without)\b/i;
const REPLACEMENT_MARKERS =
  /\b(replace|swap|switch to|use .+ instead|change .+ to|rather than)\b/i;
const REVERSION_MARKERS =
  /\b(undo|revert|go back|back to|restore|roll back|previous version|earlier version|original)\b/i;
const COMPARISON_MARKERS =
  /\b(compare|versus|vs\.?|difference between|which is better|pros and cons)\b/i;
const EXPLANATION_MARKERS =
  /\b(why did you|why do you|explain|reasoning|rationale|how did you decide)\b/i;
const SUMMARY_MARKERS =
  /\b(summarize|summary|recap|what have we decided|what did we decide)\b/i;
const TRANSFORM_MARKERS =
  /\b(now create|turn this into|convert this to|adapt this for|based on this|from this)\b/i;
const TASK_SWITCH_MARKERS =
  /\b(back to|return to|switch to|focus on|work on)\b/i;
const RESET_MARKERS = /\b(start over|start fresh|from scratch|reset|new project)\b/i;
const SELECTION_MARKERS =
  /\b(use|pick|choose|select|go with|keep)\b.*\b(first|second|third|one|version|route|option)\b/i;
const EXPORT_MARKERS =
  /\b(export|download|save as|get as|convert to|give me)\b.*\b(pdf|pptx|docx|html|zip|powerpoint|word|slide deck|svg|png)\b/i;
const EXISTING_RESULT_MARKERS =
  /\b(above|below|previous|prior|last|generated|from (?:the )?(?:generated )?route|route\s*#?\s*\d|route\d|the one|selected|these assets|the logos|that route|this route)\b/i;
const ASSET_EXTRACTION_MARKERS =
  /\b(each .+ individually|individually|separate(?:d|ly)?|split|one by one|broken out|broken down)\b/i;
const DELIVERY_MARKERS =
  /\b(download|so I can download|save (?:it|them)|get (?:it|them) as)\b/i;
const ROUTE_REFERENCE_MARKERS =
  /\b(?:route|option|direction|concept|choice)\s*#?\s*\d+\b|\broute\d+\b/i;

function parseExportFormat(text: string): SemanticSignals["exportFormat"] {
  const lower = text.toLowerCase();
  if (/\bpptx\b|powerpoint/.test(lower)) return "pptx";
  if (/\bdocx\b|\bword\b/.test(lower)) return "docx";
  if (/\bhtml\b/.test(lower)) return "html";
  if (/\bzip\b/.test(lower)) return "zip";
  if (/\bpdf\b/.test(lower)) return "pdf";
  return undefined;
}
const CREATION_MARKERS =
  /\b(create|make|build|design|generate|write|draft|produce|develop)\b/i;
const DEICTIC_MARKERS = /\b(this|that|it|these|those)\b/i;
const ORDINAL_MARKERS =
  /\b(first|second|third|fourth|1st|2nd|3rd|4th|#\d+|number \d+)\b/i;
const VERSION_MARKERS = /\b(version|v\d+|iteration)\b/i;
const SUPERLATIVE_MARKERS = /\b(latest|most recent|previous|prior|original|initial)\b/i;
const PERSISTENT_SCOPE = /\b(from now on|going forward|always|every time)\b/i;
const TEMPORARY_SCOPE = /\b(for this version|for now|just this time|this round only)\b/i;

const ARTIFACT_TYPE_PATTERNS: ReadonlyArray<{ type: string; pattern: RegExp }> = [
  { type: "website", pattern: /\b(website|site|landing page|web page|homepage)\b/i },
  { type: "image", pattern: /\b(image|photo|visual|graphic|illustration)\b/i },
  { type: "presentation", pattern: /\b(presentation|deck|slides|pitch)\b/i },
  { type: "document", pattern: /\b(document|doc|report|brief|pdf)\b/i },
  { type: "email", pattern: /\b(email|newsletter|mail)\b/i },
  { type: "video", pattern: /\b(video|clip|reel)\b/i },
  { type: "social", pattern: /\b(social|post|caption|ad creative)\b/i },
];

function detectArtifactType(text: string): string | undefined {
  for (const { type, pattern } of ARTIFACT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return undefined;
}

function detectQuantityHint(text: string): "single" | "multiple" | undefined {
  if (/\b(few|several|multiple|some|alternatives|options|directions)\b/i.test(text)) {
    return "multiple";
  }
  if (/\b(one|another|a different)\b/i.test(text)) {
    return "single";
  }
  return undefined;
}

function isConstraintPhrase(text: string): boolean {
  return (
    /\b(?:do not|don't|never|not)\s+use\b/i.test(text) ||
    /\b(?:without|exclude|avoid)\s+\w/i.test(text) ||
    /\bno\s+[a-z]/i.test(text) ||
    /\bspecifically\s+(?:said|mentioned|requested)\s+no\b/i.test(text) ||
    /\b(?:generate again|regenerate|redo|try again)\b/i.test(text)
  );
}

export function extractSemanticSignals(text: string): SemanticSignals {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const isQuestion =
    trimmed.endsWith("?") || QUESTION_START.test(trimmed);
  const hasVariationNoun = VARIATION_MARKERS.test(trimmed);
  const hasQuantityVariation = QUANTITY_VARIATION.test(trimmed);
  const isVariation =
    hasVariationNoun ||
    (hasQuantityVariation &&
      (hasVariationNoun ||
        CREATION_MARKERS.test(trimmed) ||
        /\b(try|give|show)\b/i.test(trimmed)));

  const hasDeicticReference = DEICTIC_MARKERS.test(trimmed);
  const referencesExistingResult =
    EXISTING_RESULT_MARKERS.test(trimmed) ||
    hasDeicticReference ||
    ROUTE_REFERENCE_MARKERS.test(trimmed) ||
    (VERSION_MARKERS.test(trimmed) && !CREATION_MARKERS.test(trimmed));
  const isAssetExtraction = ASSET_EXTRACTION_MARKERS.test(trimmed);
  const isDeliveryRequest =
    DELIVERY_MARKERS.test(trimmed) ||
    (/\b(give me|get me)\b/i.test(trimmed) &&
      referencesExistingResult &&
      !/\b(new|another|fresh)\b/i.test(trimmed));
  const explicitNewCreation =
    /\b(create a new|make a new|start fresh|from scratch|brand new)\b/i.test(trimmed);
  const isCreation =
    explicitNewCreation ||
    (CREATION_MARKERS.test(trimmed) &&
      !referencesExistingResult &&
      !hasDeicticReference);

  return Object.freeze({
    isQuestion,
    isImperative: IMPERATIVE_START.test(trimmed) && !isQuestion,
    isFeedback: FEEDBACK_MARKERS.test(trimmed),
    isApproval: APPROVAL_MARKERS.test(lower) && trimmed.length < 80,
    isRejection:
      REJECTION_MARKERS.test(lower) &&
      trimmed.length < 80 &&
      !isConstraintPhrase(trimmed),
    isContinuation: CONTINUATION_MARKERS.test(trimmed),
    isVariation,
    isModification: MODIFICATION_MARKERS.test(trimmed),
    isRemoval: REMOVAL_MARKERS.test(trimmed),
    isReplacement: REPLACEMENT_MARKERS.test(trimmed),
    isReversion: REVERSION_MARKERS.test(trimmed),
    isComparison: COMPARISON_MARKERS.test(trimmed),
    isExplanation: EXPLANATION_MARKERS.test(trimmed),
    isSummarization: SUMMARY_MARKERS.test(trimmed),
    isTransformation: TRANSFORM_MARKERS.test(trimmed),
    isTaskSwitch: TASK_SWITCH_MARKERS.test(trimmed),
    isReset: RESET_MARKERS.test(trimmed),
    isSelection: SELECTION_MARKERS.test(trimmed),
    isCreation,
    isExport: EXPORT_MARKERS.test(trimmed) || (isDeliveryRequest && /\b(svg|png|pdf|zip)\b/i.test(trimmed)),
    exportFormat: parseExportFormat(trimmed),
    hasDeicticReference,
    referencesExistingResult,
    isAssetExtraction,
    isDeliveryRequest,
    hasOrdinalReference: ORDINAL_MARKERS.test(trimmed),
    hasVersionReference: VERSION_MARKERS.test(trimmed),
    hasSuperlativeReference: SUPERLATIVE_MARKERS.test(trimmed),
    persistentScope: PERSISTENT_SCOPE.test(trimmed),
    temporaryScope: TEMPORARY_SCOPE.test(trimmed),
    mentionsArtifactType: detectArtifactType(trimmed),
    quantityHint: detectQuantityHint(trimmed),
  });
}
