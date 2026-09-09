/**
 * Phase 2 — Shared structured hygiene checks from the Service & Hygiene Reference.
 * Reused across service-default ProductionRules; Admin checklists keep string lines.
 */

import { hygieneCheck } from "./helpers";
import type { ProductionHygieneCheck } from "../types";

const freezeChecks = (
  checks: readonly ProductionHygieneCheck[],
): readonly ProductionHygieneCheck[] => Object.freeze([...checks]);

/** SERVICE 01 — Social Media hygiene. */
export const SOCIAL_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "placement",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Exact intended placement is named; never approve an asset for “All”.",
    promptLine:
      "Name the exact intended placement; never generate a single asset for “All”.",
  }),
  hygieneCheck({
    id: "brand-upfront",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Identify brand within the first second of short social video; on stills, immediately visible.",
    promptLine:
      "Identify the brand within the first second of short social video; on stills keep identity immediately visible.",
  }),
  hygieneCheck({
    id: "safe-zones",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Logo, copy and CTA clear of current placement overlay and live preview chrome.",
    promptLine:
      "Keep logo, copy and CTA clear of current platform UI overlays and safe zones.",
  }),
  hygieneCheck({
    id: "sound-independence",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Meaning remains clear with sound muted; captions convey spoken essentials.",
    promptLine:
      "Ensure the story works muted; captions must carry spoken essentials.",
  }),
  hygieneCheck({
    id: "readable-message",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Export readable on a phone; no essential text depends on zooming.",
    promptLine:
      "Keep essential text phone-readable without zooming.",
  }),
  hygieneCheck({
    id: "publication",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Caption, link, cover, alt text and native CTA checked separately.",
    promptLine:
      "Treat caption, link, cover, alt text and native CTA as separate deliverables.",
  }),
]);

/** SERVICE 02 — Web Tech hygiene. */
export const WEB_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "responsive",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No horizontal overflow at agreed widths; content reflows instead of scaling a screenshot.",
    promptLine:
      "Design responsive layouts that reflow; never fake responsiveness by scaling a screenshot.",
  }),
  hygieneCheck({
    id: "interaction",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Links, forms, error handling and keyboard focus work.",
    promptLine:
      "Include working links/forms paths with error, loading and empty states; support keyboard focus.",
  }),
  hygieneCheck({
    id: "hierarchy",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "One primary action per screen; clear labels and feedback.",
    promptLine: "One primary action per screen with clear labels and feedback.",
  }),
  hygieneCheck({
    id: "access",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Use the approved accessibility test plan; automated checks alone are insufficient.",
    promptLine:
      "Meet the approved accessibility target; do not rely on automated checks alone.",
  }),
  hygieneCheck({
    id: "performance",
    weight: "weighted",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Agree load budgets before build; test representative mobile conditions.",
    promptLine: "Respect agreed load budgets under representative mobile conditions.",
  }),
  hygieneCheck({
    id: "privacy",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "No live data capture until notices, consent needs and security review are approved.",
    promptLine:
      "Do not capture live user data until notices, consent and security review are approved.",
  }),
]);

/** SERVICE 03 — Branding & Logo hygiene. */
export const BRANDING_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "master-integrity",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Use the supplied artwork; never retype, stretch, trace or add effects.",
    promptLine:
      "Use the supplied wordmark/artwork exactly; never retype, stretch, trace or add effects.",
  }),
  hygieneCheck({
    id: "clear-space",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Keep at least 0.5 logo-height clear on every side.",
    promptLine:
      "Keep at least half the logo height clear on every side of the wordmark.",
  }),
  hygieneCheck({
    id: "contrast",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Black on light; white on dark; move away from busy image detail.",
    promptLine:
      "Use black on light or white on dark; keep identity off busy image detail.",
  }),
  hygieneCheck({
    id: "minimum-size",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "House starting point: 180 px digital or 35 mm print wide.",
    promptLine:
      "Do not render the wordmark below house minimums (180 px digital / 35 mm print) without an approved small-size variant.",
  }),
  hygieneCheck({
    id: "rights",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Record approval and rights for identity elements and fonts.",
    promptLine: "Only use identity elements and fonts with recorded approval and rights.",
  }),
  hygieneCheck({
    id: "delivery",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "All versions are named; source and exports visually match.",
    promptLine: "Deliver named versions whose source and exports visually match.",
  }),
]);

/** SERVICE 04 — Packaging hygiene. */
export const PACKAGING_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "dieline",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition: "Artwork matches the approved dieline; cut/fold guides are non-printing.",
    promptLine:
      "Compose on the approved 1:1 vendor dieline; keep cut/fold guides non-printing.",
  }),
  hygieneCheck({
    id: "brand-product-truth",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No alteration to approved identity, product representation or mandatory claims.",
    promptLine:
      "Do not alter approved identity, product representation or mandatory claims.",
  }),
  hygieneCheck({
    id: "safety-zones",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Keep live matter clear of seals, cuts and folds to vendor tolerance.",
    promptLine:
      "Keep live matter clear of seals, cuts and folds per vendor tolerance.",
  }),
  hygieneCheck({
    id: "color",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Use agreed CMYK/spot colors and printer profile; approve physical colour proof.",
    promptLine:
      "Use agreed CMYK/spot colours; screen appearance is not production colour approval.",
  }),
  hygieneCheck({
    id: "code-readability",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition: "Scan a printed barcode/QR proof at actual size.",
    promptLine:
      "Place barcode/QR to the supplied specification; leave clear quiet zone.",
  }),
  hygieneCheck({
    id: "hierarchy",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Name, variant and key information remain legible when assembled.",
    promptLine:
      "Keep name, variant and key information legible when the pack is assembled.",
  }),
]);

/** SERVICE 05 — Print & OOH hygiene. */
export const PRINT_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "scale",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition:
      "Dimensions and units declared; effective image resolution calculated at final size.",
    promptLine:
      "Declare final physical dimensions/units and calculate effective PPI at final size.",
  }),
  hygieneCheck({
    id: "bleed",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition: "3 mm house starting point for small print; vendor requirements override.",
    promptLine:
      "Include required bleed (3 mm house starting point for small print unless vendor overrides).",
  }),
  hygieneCheck({
    id: "readability",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Print/view at intended reading distance; do not approve only at screen zoom.",
    promptLine:
      "Design for intended viewing distance; do not rely on screen zoom readability.",
  }),
  hygieneCheck({
    id: "prepress",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Fonts, overprint, linked images, color profile and separations checked.",
    promptLine:
      "Deliver prepress-ready files: fonts, overprint, linked images, colour profile and separations.",
  }),
  hygieneCheck({
    id: "finishing",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Folds, trims, binds and mounts do not cut essential content.",
    promptLine:
      "Keep essential content clear of folds, trims, binds and mounts.",
  }),
  hygieneCheck({
    id: "message",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "OOH house target: headline up to 8 words and one action.",
    promptLine:
      "For OOH, target headline ≤8 words and one clear action.",
  }),
]);

/** SERVICE 06 — Video & Motion hygiene. */
export const VIDEO_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "export",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition:
      "House web delivery: MP4/H.264, progressive, Rec.709; match approved frame rate.",
    promptLine:
      "Deliver MP4/H.264 progressive Rec.709 matching the approved/source frame rate.",
  }),
  hygieneCheck({
    id: "timing",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Default short promo 15 s; longer formats follow the brief, not a universal cap.",
    promptLine:
      "Follow the briefed duration (house short promo example 15 s; not a platform maximum).",
  }),
  hygieneCheck({
    id: "brand-upfront",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Short social: identity by 1 s; long-form: establish identity by 5 s.",
    promptLine:
      "Establish brand identity by 1 s in short social and by 5 s in long-form.",
  }),
  hygieneCheck({
    id: "audio",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No clipping; voice intelligible; music licensed; sound-off story works where required.",
    promptLine:
      "Keep audio clean and licensed; ensure the story works muted when required.",
  }),
  hygieneCheck({
    id: "text",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Captions accurate and readable; overlays remain in placement-safe regions.",
    promptLine:
      "Provide accurate readable captions; keep overlays in placement-safe regions.",
  }),
  hygieneCheck({
    id: "continuity",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No stray frames, broken transitions, missing media or unwanted end black.",
    promptLine:
      "No stray frames, broken transitions, missing media or unwanted end black.",
  }),
]);

/** SERVICE 07 — Presentations hygiene. */
export const PRESENTATION_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "legibility",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Titles 32 pt+, body 20 pt+, references 12 pt+; test projected view.",
    promptLine:
      "House legibility: titles ≥32 pt, body ≥20 pt, references ≥12 pt; design for projected view.",
  }),
  hygieneCheck({
    id: "evidence",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Every external number has a source/date; examples are labeled.",
    promptLine:
      "Source every external number with date; label examples clearly — never invent stats.",
  }),
  hygieneCheck({
    id: "layout",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "No overflow, unwanted font substitution or inconsistent margins.",
    promptLine:
      "No overflow, font substitution or inconsistent margins.",
  }),
  hygieneCheck({
    id: "editability",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Charts and text stay editable when requested; images are not fake editable slides.",
    promptLine:
      "Keep charts and text editable when requested; do not fake editability with flat images.",
  }),
  hygieneCheck({
    id: "playback",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Test video, audio, links and animations in delivery environment.",
    promptLine:
      "Ensure video, audio, links and animations work in the delivery environment.",
  }),
  hygieneCheck({
    id: "narrative",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Slide headline states the takeaway; remove competing messages.",
    promptLine:
      "Each slide headline states one useful takeaway; remove competing messages.",
  }),
]);

/** SERVICE 08 — Email hygiene. */
export const EMAIL_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "live-text",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Essential message and CTA are not a single flat image.",
    promptLine:
      "Keep essential message and CTA as live text/HTML — not one flat image.",
  }),
  hygieneCheck({
    id: "cta",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "One primary CTA; use a real link and descriptive action.",
    promptLine: "One primary CTA with a real link and descriptive action label.",
  }),
  hygieneCheck({
    id: "fallback",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Image-off, mobile and dark-mode views remain usable.",
    promptLine:
      "Design so image-off, mobile and dark-mode views remain usable.",
  }),
  hygieneCheck({
    id: "type",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "House minimum body 16 px; button tap region 44 px high.",
    promptLine:
      "Body text ≥16 px; primary button tap region ≥44 px high.",
  }),
  hygieneCheck({
    id: "links",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Every link, tracking parameter, footer and unsubscribe mechanism tested.",
    promptLine:
      "Every link, tracking parameter, footer and unsubscribe must be real and testable.",
  }),
  hygieneCheck({
    id: "content",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Subject, preheader, personalization fallbacks and proofread body approved.",
    promptLine:
      "Include approved subject, preheader, personalization fallbacks and proofread body.",
  }),
]);

/** SERVICE 09 — POS / In-Store hygiene. */
export const POS_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "fit",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition:
      "Fixture measurements signed off; artwork avoids hardware and concealed regions.",
    promptLine:
      "Match signed fixture measurements; keep artwork clear of hardware and concealed regions.",
  }),
  hygieneCheck({
    id: "hierarchy",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Identity, main benefit and action read in that order.",
    promptLine:
      "Hierarchy: identity → main benefit → action, readable at a glance.",
  }),
  hygieneCheck({
    id: "offer",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Price, dates and terms agree across every touchpoint.",
    promptLine:
      "Keep price, dates and terms consistent across every touchpoint.",
  }),
  hygieneCheck({
    id: "access",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Placement does not obstruct navigation, sight lines or required safety information.",
    promptLine:
      "Do not obstruct navigation, sight lines or required safety information.",
  }),
  hygieneCheck({
    id: "production",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Color/material and mount approved through supplier sample.",
    promptLine:
      "Colour, material and mount require supplier sample approval before batch.",
  }),
  hygieneCheck({
    id: "context",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Approve shopper-eye-level mockup, not just flat artwork.",
    promptLine:
      "Design for shopper eye-level context, not only flat artwork.",
  }),
]);

/** SERVICE 10 — Merchandise hygiene. */
export const MERCHANDISE_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "method",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Art suits embroidery, transfer, screen print, engraving or sublimation as selected.",
    promptLine:
      "Design for the selected decoration method (embroidery, transfer, screen, engraving, sublimation).",
  }),
  hygieneCheck({
    id: "integrity",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "No automatic simplification or stretching of wordmark.",
    promptLine:
      "Do not auto-simplify or stretch the wordmark for decoration.",
  }),
  hygieneCheck({
    id: "scale",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Physical sample confirms letter gaps and edge definition.",
    promptLine:
      "Keep letter gaps and edge definition printable at the physical sample size.",
  }),
  hygieneCheck({
    id: "color",
    weight: "weighted",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Match physical material swatch; screen mockup is not colour approval.",
    promptLine:
      "Match physical material swatches; screen mockups are not colour approval.",
  }),
  hygieneCheck({
    id: "placement",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Sizes, orientation and garment side are explicit.",
    promptLine:
      "State print size, orientation and garment/item side explicitly.",
  }),
  hygieneCheck({
    id: "sample",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Signed production sample required before batch release.",
    promptLine:
      "Require a signed production sample before batch release.",
  }),
]);

/** SERVICE 11 — Illustration hygiene. */
export const ILLUSTRATION_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "consistency",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Line weight, perspective, shading and palette match across the set.",
    promptLine:
      "Keep line weight, perspective, shading and palette consistent across the set.",
  }),
  hygieneCheck({
    id: "accuracy",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Technical objects and charts reviewed against approved source.",
    promptLine:
      "Ground technical objects and charts in approved source — invent nothing.",
  }),
  hygieneCheck({
    id: "originality",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "No unlicensed tracing, stock impersonation or third-party marks.",
    promptLine:
      "No unlicensed tracing, stock impersonation or third-party marks.",
  }),
  hygieneCheck({
    id: "structure",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Named layers and clean paths; no stray points or hidden draft elements.",
    promptLine:
      "Deliver named layers and clean paths with no stray draft elements.",
  }),
  hygieneCheck({
    id: "output",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition: "Raster resolution and vector delivery match intended use.",
    promptLine:
      "Match raster resolution and vector delivery to intended use.",
  }),
  hygieneCheck({
    id: "small-size-test",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Key shape still reads at final display size.",
    promptLine:
      "Ensure the key shape still reads at final display size.",
  }),
]);

/** SERVICE 12 — Visual Production / photography hygiene. */
export const PHOTOGRAPHY_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "truth",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Do not alter product branding, claims, shape or functional details without approval.",
    promptLine:
      "Do not alter product branding, claims, shape or functional details without approval.",
  }),
  hygieneCheck({
    id: "edges",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Inspect cutouts at 100%; no halos, clipped foreground or accidental transparency.",
    promptLine:
      "Cutouts must be clean at 100% — no halos, clipped edges or accidental transparency.",
  }),
  hygieneCheck({
    id: "color",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Consistent white balance; approved product colour reference.",
    promptLine:
      "Keep white balance consistent and match approved product colour reference.",
  }),
  hygieneCheck({
    id: "sharpness",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No artificial detail sold as faithful capture; disclose generated/composited assets.",
    promptLine:
      "Do not sell artificial detail as faithful capture; disclose generated or composited assets.",
  }),
  hygieneCheck({
    id: "rights",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Model/property/music rights and usage dates recorded where applicable.",
    promptLine:
      "Respect model, property and music rights with recorded usage dates.",
  }),
  hygieneCheck({
    id: "delivery",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Master and derivative crops named; full subject retained when requested.",
    promptLine:
      "Name masters and derivative crops; retain the full subject when requested.",
  }),
]);

/** SERVICE 13 — Brand Strategy hygiene. */
export const STRATEGY_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "evidence",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Claims link to actual research; assumptions clearly tagged.",
    promptLine:
      "Link claims to actual research; clearly tag assumptions — never invent findings.",
  }),
  hygieneCheck({
    id: "focus",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "One priority audience/problem per proposition.",
    promptLine: "One priority audience and problem per proposition.",
  }),
  hygieneCheck({
    id: "actionability",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Every recommendation changes a message, design choice or delivery plan.",
    promptLine:
      "Every recommendation must change a message, design choice or delivery plan.",
  }),
  hygieneCheck({
    id: "alignment",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Decision owner signs off before identity or campaign rollout.",
    promptLine:
      "Require decision-owner sign-off before identity or campaign rollout.",
  }),
  hygieneCheck({
    id: "measurement",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "State KPI, baseline owner and review point.",
    promptLine: "State KPI, baseline owner and review point.",
  }),
  hygieneCheck({
    id: "consistency",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Final strategy and downstream creative briefs do not contradict each other.",
    promptLine:
      "Keep strategy and downstream creative briefs non-contradictory.",
  }),
]);

/** SERVICE 14 — Ad Campaigns hygiene. */
export const ADS_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "message-match",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Offer and CTA match the landing page exactly.",
    promptLine: "Offer and CTA must match the landing page exactly.",
  }),
  hygieneCheck({
    id: "native-cta",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Configure the platform button separately; artwork text is not an interactive button.",
    promptLine:
      "Treat native platform CTA separately; artwork text is not the interactive button.",
  }),
  hygieneCheck({
    id: "tracking",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Asset ID and measurement links reconciled before launch.",
    promptLine:
      "Reconcile asset IDs and measurement links before launch.",
  }),
  hygieneCheck({
    id: "experiment",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition: "Document what changes and what remains constant.",
    promptLine:
      "Change one test variable at a time; document constants vs changes.",
  }),
  hygieneCheck({
    id: "pre-post-check",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Preview in the bought placement before and after launch.",
    promptLine:
      "Preview in the bought placement before release.",
  }),
  hygieneCheck({
    id: "claims",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition: "No unsupported performance promises or fabricated results.",
    promptLine:
      "No unsupported performance promises or fabricated results.",
  }),
]);

/** SERVICE 15 — Event Branding hygiene. */
export const EVENT_HYGIENE = freezeChecks([
  hygieneCheck({
    id: "venue-fit",
    weight: "gate",
    evaluationMethod: "MEASURED",
    passDefinition: "Actual screen maps and print dimensions confirmed.",
    promptLine:
      "Use confirmed venue screen maps and print dimensions — no assumed sizes.",
  }),
  hygieneCheck({
    id: "wayfinding",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Direction, destination and hierarchy readable at decision points.",
    promptLine:
      "Wayfinding must read direction, destination and hierarchy at decision points.",
  }),
  hygieneCheck({
    id: "content",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition: "Dates, venue, speaker names and agenda approved.",
    promptLine:
      "Use only approved dates, venue, speaker names and agenda.",
  }),
  hygieneCheck({
    id: "safety",
    weight: "gate",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "No design covers required exits, access routes or safety signage.",
    promptLine:
      "Never cover required exits, access routes or safety signage.",
  }),
  hygieneCheck({
    id: "system",
    weight: "weighted",
    evaluationMethod: "HEURISTIC",
    passDefinition:
      "Repeated assets use one grid, type hierarchy and identifier scheme.",
    promptLine:
      "Keep one grid, type hierarchy and identifier scheme across touchpoints.",
  }),
  hygieneCheck({
    id: "rehearsal",
    weight: "gate",
    evaluationMethod: "NOT_AUTOMATED",
    passDefinition:
      "Test loops, playback, legibility and physical installation onsite.",
    promptLine:
      "Design for onsite rehearsal of loops, playback, legibility and install.",
  }),
]);
