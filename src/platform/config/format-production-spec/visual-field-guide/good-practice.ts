/**
 * Visual Field Guide — Keep / Avoid / Confirm (page 30) + final hygiene notes.
 */

import type { GoodPracticeRow } from "./types";

export const VISUAL_GOOD_PRACTICE: readonly GoodPracticeRow[] = Object.freeze([
  Object.freeze({
    id: "one_headline",
    keep: "One headline with one job.",
    avoid: "Several equally loud messages.",
    confirm: "Message fits the audience and objective.",
    promptLine:
      "One headline with one job — do not stack several equally loud messages.",
  }),
  Object.freeze({
    id: "wordmark_form",
    keep: "Wordmark in approved form.",
    avoid: "Distortion, recoloring or invented mark.",
    confirm: "Actual size and contrast.",
    promptLine:
      "Use the wordmark only in approved form — no distortion, recoloring, or invented mark.",
  }),
  Object.freeze({
    id: "live_text",
    keep: "Live text in web/email/decks.",
    avoid: "Flattening everything into an image.",
    confirm: "Required editability and accessibility.",
    promptLine:
      "Prefer live text for web/email/decks; do not flatten the essential message into one image.",
  }),
  Object.freeze({
    id: "deliberate_crop",
    keep: "A deliberate crop per placement.",
    avoid: "Auto-stretching one master.",
    confirm: "Platform UI, safe region and preview.",
    promptLine:
      "Compose a deliberate crop per placement — never auto-stretch one master across ratios.",
  }),
  Object.freeze({
    id: "product_truth",
    keep: "Approved product truth.",
    avoid: "Invented details or changed packaging.",
    confirm: "Color, shape and source provenance.",
    promptLine:
      "Preserve approved product truth — no invented details or altered packaging claims.",
  }),
  Object.freeze({
    id: "physical_proof",
    keep: "Physical proof for physical work.",
    avoid: "Treating a mockup as manufacturing approval.",
    confirm: "Vendor profile, size, finish and assembly.",
    promptLine:
      "Treat mockups as illustrative only — physical work needs supplier proof before release.",
  }),
  Object.freeze({
    id: "claim_evidence",
    keep: "Evidence for claims and numbers.",
    avoid: "Fictional statistics in polished graphics.",
    confirm: "Approval, source and checked date.",
    promptLine:
      "Never invent research statistics or fabricated results; tag assumptions clearly.",
  }),
]);

/** Final hygiene mantra (page 29) for prompt / QC. */
export const VISUAL_FINAL_HYGIENE_LINES: readonly string[] = Object.freeze([
  "Nothing leaves unchecked: brief, identity, copy, dimensions, rights, readability, destination, editable package.",
  "Creator and reviewer sign the same version.",
  "Physical items require supplier proof; digital items require inspection in the actual publishing context.",
  "PASS = ready. REVISE = fix and recheck. REVIEW = obtain evidence. HOLD = do not deliver.",
]);
