/**
 * Classify requirements by verification capability (M4).
 */

import type { CdfRequirement } from "../requirements/types";
import type {
  CdfVerificationCapability,
  CdfVerificationType,
} from "./types";

const SEMANTIC_KEY_RE =
  /^(tone\.|style\.|preference\.|feel\.|mood\.)|premium|modern|professional|sophisticated|beautiful|elegant/i;

export function classifyRequirement(
  req: CdfRequirement,
): {
  capability: CdfVerificationCapability;
  verificationType: CdfVerificationType;
} {
  if (SEMANTIC_KEY_RE.test(req.key) || req.category === "tone" || req.category === "preference") {
    // tone.premium etc. from extractor
    if (req.key.startsWith("tone.") || req.category === "tone" || req.category === "preference") {
      return {
        capability: "semantic_review_required",
        verificationType: "semantic_manual_review",
      };
    }
  }

  switch (req.key) {
    case "slide_count":
    case "route_count":
    case "design_route_count":
    case "sku_count":
      return { capability: "machine_verifiable", verificationType: "count" };
    case "dimensions":
      return { capability: "machine_verifiable", verificationType: "dimensions" };
    case "aspect_ratio":
      return { capability: "machine_verifiable", verificationType: "aspect_ratio" };
    case "platform":
    case "presentation_type":
    case "industry":
      return { capability: "machine_verifiable", verificationType: "enum" };
    case "audience":
      // Free-text intent: paraphrase is correct output, so substring match cannot gate completion.
      return {
        capability: "semantic_review_required",
        verificationType: "semantic_manual_review",
      };
    case "mandatory_sections":
      return {
        capability: "machine_verifiable",
        verificationType: "structural_presence",
      };
    case "primary_background":
    case "text_color":
    case "accent_color":
    case "brand_colors":
      return { capability: "machine_verifiable", verificationType: "contains" };
    case "exact_headline":
    case "exact_wording":
    case "headline.exact":
      return { capability: "machine_verifiable", verificationType: "exact_match" };
    case "required_logo":
    case "reference.asset":
      return {
        capability: "machine_verifiable",
        verificationType: "structural_presence",
      };
    default:
      break;
  }

  if (req.category === "forbidden_content") {
    return { capability: "machine_verifiable", verificationType: "not_contains" };
  }
  if (req.category === "mandatory_content") {
    return {
      capability: "machine_verifiable",
      verificationType: "structural_presence",
    };
  }
  if (req.category === "quantity") {
    return { capability: "machine_verifiable", verificationType: "count" };
  }
  if (req.category === "dimension") {
    return { capability: "machine_verifiable", verificationType: "dimensions" };
  }
  if (req.category === "color") {
    return { capability: "machine_verifiable", verificationType: "contains" };
  }
  if (req.key.startsWith("approval.") || req.key.startsWith("selection.")) {
    return {
      capability: "machine_verifiable",
      verificationType: "reference_match",
    };
  }
  if (req.key === "brief.raw" || req.key.startsWith("brief.message.")) {
    return {
      capability: "unable_to_verify",
      verificationType: "semantic_manual_review",
    };
  }
  if (req.key.startsWith("tone.") || req.category === "style") {
    return {
      capability: "semantic_review_required",
      verificationType: "semantic_manual_review",
    };
  }

  // Default: if explicit string constraint with known patterns
  if (req.value.kind === "string" && /exact/i.test(req.key)) {
    return { capability: "machine_verifiable", verificationType: "exact_match" };
  }

  return {
    capability: "unable_to_verify",
    verificationType: "semantic_manual_review",
  };
}
