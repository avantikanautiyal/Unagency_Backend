/**
 * Phase 7 — Deterministic output-aware question bank (decision-tree roots).
 * LLM never owns question authority; schema-validated bank only.
 */

import type { RefinementQuestion } from "../contracts/refinement-question";
import type { RefinementOutputType } from "../contracts/refinement-request";

function opts(
  items: readonly {
    id: string;
    label: string;
    value: string;
    signal: string;
    preserve?: string;
  }[]
) {
  return items.map((i) => ({
    optionId: i.id,
    label: i.label,
    value: i.value,
    refinementSignal: i.signal,
    preserveHint: i.preserve,
  }));
}

/** Shared follow-ups */
const TONE_Q: RefinementQuestion = {
  questionId: "q_tone_direction",
  outputType: "*",
  dimension: "tone",
  question: "How should the tone change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "tone_premium", label: "More premium", value: "premium", signal: "tone.premium" },
    { id: "tone_friendly", label: "More friendly", value: "friendly", signal: "tone.friendly" },
    { id: "tone_concise", label: "More concise", value: "concise", signal: "tone.concise" },
    { id: "tone_bold", label: "More bold", value: "bold", signal: "tone.bold" },
    {
      id: "tone_other",
      label: "Other",
      value: "other",
      signal: "tone.other",
      preserve: "core_message",
    },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const LENGTH_Q: RefinementQuestion = {
  questionId: "q_length_direction",
  outputType: "*",
  dimension: "length",
  question: "What length do you prefer?",
  required: true,
  selectionType: "single",
  options: opts([
    { id: "len_shorter", label: "Shorter", value: "shorter", signal: "length.shorter" },
    { id: "len_longer", label: "Longer", value: "longer", signal: "length.longer" },
    { id: "len_same", label: "Similar length", value: "similar", signal: "length.similar", preserve: "length" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const VISUAL_Q: RefinementQuestion = {
  questionId: "q_visual_direction",
  outputType: "*",
  dimension: "visual_style",
  question: "What visual direction do you prefer?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "vis_minimal", label: "More minimal", value: "minimal", signal: "visual_style.minimal" },
    { id: "vis_premium", label: "More premium", value: "premium", signal: "visual_style.premium" },
    { id: "vis_bold", label: "More bold", value: "bold", signal: "visual_style.bold" },
    { id: "vis_playful", label: "More playful", value: "playful", signal: "visual_style.playful" },
  ]),
  defaultNextQuestionId: "q_color_direction",
};

const COLOR_Q: RefinementQuestion = {
  questionId: "q_color_direction",
  outputType: "*",
  dimension: "color",
  question: "How should colors change?",
  required: true,
  selectionType: "single",
  options: opts([
    { id: "col_muted", label: "More muted", value: "muted", signal: "color.muted" },
    { id: "col_vibrant", label: "More vibrant", value: "vibrant", signal: "color.vibrant" },
    { id: "col_brand", label: "Closer to brand palette", value: "brand", signal: "color.brand", preserve: "brand_palette" },
    { id: "col_keep", label: "Keep colors", value: "keep", signal: "color.keep", preserve: "colors" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const LAYOUT_Q: RefinementQuestion = {
  questionId: "q_layout_direction",
  outputType: "*",
  dimension: "layout",
  question: "How should the layout change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "lay_cleaner", label: "Cleaner hierarchy", value: "cleaner", signal: "layout.cleaner" },
    { id: "lay_dense", label: "More content density", value: "dense", signal: "layout.dense" },
    { id: "lay_sections", label: "Reorganize sections", value: "sections", signal: "layout.sections" },
    { id: "lay_keep", label: "Keep structure", value: "keep", signal: "layout.keep", preserve: "structure" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const CTA_Q: RefinementQuestion = {
  questionId: "q_cta_direction",
  outputType: "*",
  dimension: "cta",
  question: "How should the call-to-action change?",
  required: true,
  selectionType: "single",
  options: opts([
    { id: "cta_stronger", label: "Stronger CTA", value: "stronger", signal: "cta.stronger" },
    { id: "cta_softer", label: "Softer CTA", value: "softer", signal: "cta.softer" },
    { id: "cta_clearer", label: "Clearer CTA wording", value: "clearer", signal: "cta.clearer" },
    {
      id: "cta_keep",
      label: "Keep CTA (required)",
      value: "keep",
      signal: "cta.keep",
      preserve: "cta",
    },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const COPY_Q: RefinementQuestion = {
  questionId: "q_copy_direction",
  outputType: "*",
  dimension: "copy",
  question: "What should change in the copy?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "copy_clarity", label: "Clarity", value: "clarity", signal: "copy.clarity" },
    { id: "copy_persuasion", label: "Persuasiveness", value: "persuasion", signal: "copy.persuasion" },
    { id: "copy_hook", label: "Opening hook", value: "hook", signal: "copy.hook" },
    { id: "copy_keep", label: "Keep messaging", value: "keep", signal: "copy.keep", preserve: "messaging" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const BRAND_ALIGN_Q: RefinementQuestion = {
  questionId: "q_brand_align",
  outputType: "*",
  dimension: "brand_alignment",
  question: "What brand mismatch concerns you?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "ba_tone", label: "Tone / voice", value: "tone", signal: "brand_alignment.tone" },
    { id: "ba_visual", label: "Visual identity", value: "visual", signal: "brand_alignment.visual" },
    { id: "ba_claims", label: "Claims / messaging", value: "claims", signal: "brand_alignment.claims" },
    { id: "ba_vocab", label: "Terminology", value: "vocab", signal: "brand_alignment.vocabulary" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const STRATEGY_Q: RefinementQuestion = {
  questionId: "q_strategy_focus",
  outputType: "campaign_strategy",
  dimension: "strategy",
  question: "Which strategy area should change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "st_audience", label: "Audience", value: "audience", signal: "strategy.audience" },
    { id: "st_positioning", label: "Positioning", value: "positioning", signal: "strategy.positioning" },
    { id: "st_channels", label: "Channels", value: "channels", signal: "strategy.channels" },
    { id: "st_offer", label: "Offer", value: "offer", signal: "strategy.offer" },
    { id: "st_depth", label: "Strategy depth", value: "depth", signal: "strategy.depth" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const PRESERVE_Q: RefinementQuestion = {
  questionId: "q_preserve",
  outputType: "*",
  dimension: "preserve",
  question: "What should stay the same?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "pr_message", label: "Core message", value: "message", signal: "preserve.message", preserve: "core_message" },
    { id: "pr_structure", label: "Structure / sections", value: "structure", signal: "preserve.structure", preserve: "structure" },
    { id: "pr_cta", label: "CTA", value: "cta", signal: "preserve.cta", preserve: "cta" },
    { id: "pr_brand", label: "Brand voice", value: "brand", signal: "preserve.brand_voice", preserve: "brand_voice" },
    { id: "pr_nothing", label: "Nothing specific", value: "none", signal: "preserve.none" },
  ]),
};

// ---------------------------------------------------------------------------
// Logo-specific questions
// ---------------------------------------------------------------------------

const LOGO_SYMBOL_Q: RefinementQuestion = {
  questionId: "q_logo_symbol",
  outputType: "logo",
  dimension: "symbol",
  question: "What should change about the symbol / icon?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "sym_simpler", label: "Make it simpler", value: "simpler", signal: "symbol.simpler" },
    { id: "sym_bolder", label: "Make it bolder", value: "bolder", signal: "symbol.bolder" },
    { id: "sym_abstract", label: "More abstract", value: "abstract", signal: "symbol.abstract" },
    { id: "sym_literal", label: "More literal / recognisable", value: "literal", signal: "symbol.literal" },
    { id: "sym_modern", label: "More modern", value: "modern", signal: "symbol.modern" },
    { id: "sym_traditional", label: "More traditional", value: "traditional", signal: "symbol.traditional" },
    { id: "sym_keep", label: "Keep the symbol as-is", value: "keep", signal: "symbol.keep", preserve: "symbol" },
  ]),
  defaultNextQuestionId: "q_logo_typeface",
};

const LOGO_TYPEFACE_Q: RefinementQuestion = {
  questionId: "q_logo_typeface",
  outputType: "logo",
  dimension: "typeface",
  question: "What should change about the typeface / lettering?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "type_bolder", label: "Bolder weight", value: "bolder", signal: "typeface.bolder" },
    { id: "type_lighter", label: "Lighter / elegant", value: "lighter", signal: "typeface.lighter" },
    { id: "type_serif", label: "Switch to serif", value: "serif", signal: "typeface.serif" },
    { id: "type_sans", label: "Switch to sans-serif", value: "sans", signal: "typeface.sans_serif" },
    { id: "type_custom", label: "More unique / custom feel", value: "custom", signal: "typeface.custom" },
    { id: "type_keep", label: "Keep the typeface", value: "keep", signal: "typeface.keep", preserve: "typeface" },
  ]),
  defaultNextQuestionId: "q_logo_color_palette",
};

const LOGO_COLOR_PALETTE_Q: RefinementQuestion = {
  questionId: "q_logo_color_palette",
  outputType: "logo",
  dimension: "color_palette",
  question: "How should the colour palette change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "pal_vibrant", label: "More vibrant / saturated", value: "vibrant", signal: "color_palette.vibrant" },
    { id: "pal_muted", label: "More muted / subtle", value: "muted", signal: "color_palette.muted" },
    { id: "pal_dark", label: "Darker tones", value: "dark", signal: "color_palette.dark" },
    { id: "pal_light", label: "Lighter / pastel", value: "light", signal: "color_palette.light" },
    { id: "pal_mono", label: "Monochrome / single colour", value: "monochrome", signal: "color_palette.monochrome" },
    { id: "pal_brand", label: "Align closer to brand colours", value: "brand", signal: "color_palette.brand", preserve: "brand_palette" },
    { id: "pal_keep", label: "Keep the colours", value: "keep", signal: "color_palette.keep", preserve: "colors" },
  ]),
  defaultNextQuestionId: "q_logo_preserve",
};

const LOGO_PRESERVE_Q: RefinementQuestion = {
  questionId: "q_logo_preserve",
  outputType: "logo",
  dimension: "preserve",
  question: "What must stay exactly the same?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "lpr_symbol", label: "The symbol / icon shape", value: "symbol", signal: "preserve.symbol", preserve: "symbol" },
    { id: "lpr_typeface", label: "The typeface", value: "typeface", signal: "preserve.typeface", preserve: "typeface" },
    { id: "lpr_colors", label: "The colour palette", value: "colors", signal: "preserve.colors", preserve: "colors" },
    { id: "lpr_layout", label: "Symbol + text arrangement", value: "layout", signal: "preserve.layout", preserve: "structure" },
    { id: "lpr_nothing", label: "Nothing specific — open to full rework", value: "none", signal: "preserve.none" },
  ]),
};

const LOGO_ROOT: RefinementQuestion = {
  questionId: "q_logo_root",
  outputType: "logo",
  dimension: "dissatisfaction",
  question: "What would you like to refine about this logo?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "logo_symbol", label: "Symbol / icon", value: "symbol", signal: "dissatisfaction.symbol" },
    { id: "logo_typeface", label: "Typeface / lettering", value: "typeface", signal: "dissatisfaction.typeface" },
    { id: "logo_colors", label: "Colour palette", value: "colors", signal: "dissatisfaction.colors" },
    { id: "logo_layout", label: "Layout / spacing", value: "layout", signal: "dissatisfaction.layout" },
    { id: "logo_style", label: "Overall style / feel", value: "style", signal: "dissatisfaction.style" },
    { id: "logo_other", label: "Something else", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["logo_symbol"], nextQuestionId: "q_logo_symbol" },
    { whenOptionIds: ["logo_typeface"], nextQuestionId: "q_logo_typeface" },
    { whenOptionIds: ["logo_colors"], nextQuestionId: "q_logo_color_palette" },
    { whenOptionIds: ["logo_layout", "logo_style"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["logo_other"], nextQuestionId: "q_logo_preserve" },
  ],
  defaultNextQuestionId: "q_logo_symbol",
};

// ---------------------------------------------------------------------------
// Brochure-specific questions
// ---------------------------------------------------------------------------

const BROCHURE_ROOT: RefinementQuestion = {
  questionId: "q_brochure_root",
  outputType: "brochure",
  dimension: "dissatisfaction",
  question: "What would you like to change about this brochure?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "br_layout", label: "Layout / page structure", value: "layout", signal: "dissatisfaction.layout" },
    { id: "br_visual", label: "Visual design / imagery", value: "visual", signal: "dissatisfaction.visual" },
    { id: "br_copy", label: "Copy / content", value: "copy", signal: "dissatisfaction.copy" },
    { id: "br_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
    { id: "br_cta", label: "Call-to-action", value: "cta", signal: "dissatisfaction.cta" },
    { id: "br_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["br_layout"], nextQuestionId: "q_layout_direction" },
    { whenOptionIds: ["br_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["br_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["br_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["br_cta"], nextQuestionId: "q_cta_direction" },
    { whenOptionIds: ["br_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_layout_direction",
};

// ---------------------------------------------------------------------------
// Email-specific questions
// ---------------------------------------------------------------------------

const EMAIL_SUBJECT_Q: RefinementQuestion = {
  questionId: "q_email_subject",
  outputType: "email",
  dimension: "subject_line",
  question: "How should the subject line change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "sub_punchy", label: "More punchy / urgent", value: "punchy", signal: "subject_line.punchy" },
    { id: "sub_clear", label: "Clearer / direct", value: "clear", signal: "subject_line.clear" },
    { id: "sub_personal", label: "More personalised", value: "personal", signal: "subject_line.personal" },
    { id: "sub_keep", label: "Keep subject line", value: "keep", signal: "subject_line.keep", preserve: "subject_line" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const EMAIL_ROOT: RefinementQuestion = {
  questionId: "q_email_root",
  outputType: "email",
  dimension: "dissatisfaction",
  question: "What would you like to change about this email?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "em_subject", label: "Subject line", value: "subject", signal: "dissatisfaction.subject" },
    { id: "em_copy", label: "Body copy / content", value: "copy", signal: "dissatisfaction.copy" },
    { id: "em_cta", label: "Call-to-action", value: "cta", signal: "dissatisfaction.cta" },
    { id: "em_tone", label: "Tone / voice", value: "tone", signal: "dissatisfaction.tone" },
    { id: "em_length", label: "Length", value: "length", signal: "dissatisfaction.length" },
    { id: "em_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["em_subject"], nextQuestionId: "q_email_subject" },
    { whenOptionIds: ["em_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["em_cta"], nextQuestionId: "q_cta_direction" },
    { whenOptionIds: ["em_tone"], nextQuestionId: "q_tone_direction" },
    { whenOptionIds: ["em_length"], nextQuestionId: "q_length_direction" },
    { whenOptionIds: ["em_brand"], nextQuestionId: "q_brand_align" },
  ],
  defaultNextQuestionId: "q_copy_direction",
};

// ---------------------------------------------------------------------------
// Strategy-specific questions
// ---------------------------------------------------------------------------

const STRATEGY_DEPTH_Q: RefinementQuestion = {
  questionId: "q_strategy_depth",
  outputType: "strategy",
  dimension: "depth",
  question: "What level of depth do you need?",
  required: true,
  selectionType: "single",
  options: opts([
    { id: "dep_executive", label: "Executive summary — concise", value: "executive", signal: "depth.executive" },
    { id: "dep_tactical", label: "Tactical detail — action steps", value: "tactical", signal: "depth.tactical" },
    { id: "dep_full", label: "Full strategy — all sections", value: "full", signal: "depth.full" },
  ]),
  defaultNextQuestionId: "q_preserve",
};

const STRATEGY_ROOT: RefinementQuestion = {
  questionId: "q_strategy_root",
  outputType: "strategy",
  dimension: "dissatisfaction",
  question: "What would you like to refine in this strategy?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "str_audience", label: "Target audience / personas", value: "audience", signal: "dissatisfaction.audience" },
    { id: "str_positioning", label: "Positioning / differentiation", value: "positioning", signal: "dissatisfaction.positioning" },
    { id: "str_channels", label: "Channels / tactics", value: "channels", signal: "dissatisfaction.channels" },
    { id: "str_messaging", label: "Key messaging", value: "messaging", signal: "dissatisfaction.copy" },
    { id: "str_depth", label: "Level of detail", value: "depth", signal: "dissatisfaction.depth" },
    { id: "str_brand", label: "Brand voice / alignment", value: "brand", signal: "dissatisfaction.brand" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["str_audience", "str_positioning", "str_channels"], nextQuestionId: "q_strategy_focus" },
    { whenOptionIds: ["str_messaging"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["str_depth"], nextQuestionId: "q_strategy_depth" },
    { whenOptionIds: ["str_brand"], nextQuestionId: "q_brand_align" },
  ],
  defaultNextQuestionId: "q_strategy_focus",
};

const CAPTION_ROOT: RefinementQuestion = {
  questionId: "q_caption_root",
  outputType: "caption",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "cap_tone", label: "Tone", value: "tone", signal: "dissatisfaction.tone" },
    { id: "cap_length", label: "Length", value: "length", signal: "dissatisfaction.length" },
    { id: "cap_hook", label: "Hook", value: "hook", signal: "dissatisfaction.hook" },
    { id: "cap_cta", label: "CTA", value: "cta", signal: "dissatisfaction.cta" },
    { id: "cap_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["cap_tone"], nextQuestionId: "q_tone_direction" },
    { whenOptionIds: ["cap_length"], nextQuestionId: "q_length_direction" },
    { whenOptionIds: ["cap_hook"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["cap_cta"], nextQuestionId: "q_cta_direction" },
    { whenOptionIds: ["cap_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const SOCIAL_ROOT: RefinementQuestion = {
  questionId: "q_social_root",
  outputType: "social_creative",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "soc_visual", label: "Visual design", value: "visual", signal: "dissatisfaction.visual" },
    { id: "soc_copy", label: "Copy / content", value: "copy", signal: "dissatisfaction.copy" },
    { id: "soc_layout", label: "Layout / composition", value: "layout", signal: "dissatisfaction.layout" },
    { id: "soc_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
    { id: "soc_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["soc_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["soc_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["soc_layout"], nextQuestionId: "q_layout_direction" },
    { whenOptionIds: ["soc_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["soc_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const LANDING_ROOT: RefinementQuestion = {
  questionId: "q_landing_root",
  outputType: "landing_page",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "lp_visual", label: "Visual design", value: "visual", signal: "dissatisfaction.visual" },
    { id: "lp_copy", label: "Copy / content", value: "copy", signal: "dissatisfaction.copy" },
    { id: "lp_layout", label: "Layout", value: "layout", signal: "dissatisfaction.layout" },
    { id: "lp_cta", label: "CTA", value: "cta", signal: "dissatisfaction.cta" },
    { id: "lp_brand", label: "Branding", value: "brand", signal: "dissatisfaction.brand" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["lp_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["lp_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["lp_layout"], nextQuestionId: "q_layout_direction" },
    { whenOptionIds: ["lp_cta"], nextQuestionId: "q_cta_direction" },
    { whenOptionIds: ["lp_brand"], nextQuestionId: "q_brand_align" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const WEBSITE_ROOT: RefinementQuestion = {
  questionId: "q_website_root",
  outputType: "website",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "web_layout", label: "Layout / navigation", value: "layout", signal: "dissatisfaction.layout" },
    { id: "web_visual", label: "Visual design", value: "visual", signal: "dissatisfaction.visual" },
    { id: "web_content", label: "Content", value: "content", signal: "dissatisfaction.copy" },
    { id: "web_brand", label: "Branding", value: "brand", signal: "dissatisfaction.brand" },
    { id: "web_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["web_layout"], nextQuestionId: "q_layout_direction" },
    { whenOptionIds: ["web_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["web_content"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["web_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["web_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const CAMPAIGN_ROOT: RefinementQuestion = {
  questionId: "q_campaign_root",
  outputType: "campaign_strategy",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "camp_strategy", label: "Strategy focus", value: "strategy", signal: "dissatisfaction.strategy" },
    { id: "camp_message", label: "Messaging", value: "messaging", signal: "dissatisfaction.copy" },
    { id: "camp_audience", label: "Audience", value: "audience", signal: "dissatisfaction.audience" },
    { id: "camp_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
    { id: "camp_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["camp_strategy"], nextQuestionId: "q_strategy_focus" },
    { whenOptionIds: ["camp_message"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["camp_audience"], nextQuestionId: "q_strategy_focus" },
    { whenOptionIds: ["camp_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["camp_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const VIDEO_ROOT: RefinementQuestion = {
  questionId: "q_video_root",
  outputType: "video",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "vid_pace", label: "Pacing", value: "pacing", signal: "dissatisfaction.pacing" },
    { id: "vid_visual", label: "Visuals", value: "visual", signal: "dissatisfaction.visual" },
    { id: "vid_script", label: "Script", value: "script", signal: "dissatisfaction.copy" },
    { id: "vid_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
    { id: "vid_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["vid_pace"], nextQuestionId: "q_length_direction" },
    { whenOptionIds: ["vid_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["vid_script"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["vid_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["vid_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const PRESENTATION_ROOT: RefinementQuestion = {
  questionId: "q_presentation_root",
  outputType: "presentation",
  dimension: "dissatisfaction",
  question: "What would you like to change in this deck?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "deck_structure", label: "Slide structure / flow", value: "structure", signal: "dissatisfaction.layout" },
    { id: "deck_visual", label: "Visual design / theme", value: "visual", signal: "dissatisfaction.visual" },
    { id: "deck_copy", label: "Copy / messaging", value: "copy", signal: "dissatisfaction.copy" },
    { id: "deck_brand", label: "Brand / colors", value: "brand", signal: "dissatisfaction.brand" },
    { id: "deck_length", label: "Length / density", value: "length", signal: "dissatisfaction.length" },
    { id: "deck_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["deck_structure"], nextQuestionId: "q_layout_direction" },
    { whenOptionIds: ["deck_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["deck_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["deck_brand"], nextQuestionId: "q_color_direction" },
    { whenOptionIds: ["deck_length"], nextQuestionId: "q_length_direction" },
    { whenOptionIds: ["deck_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const GENERIC_ROOT: RefinementQuestion = {
  questionId: "q_generic_root",
  outputType: "generic",
  dimension: "dissatisfaction",
  question: "What would you like to change?",
  required: true,
  selectionType: "multi",
  options: opts([
    { id: "gen_tone", label: "Tone", value: "tone", signal: "dissatisfaction.tone" },
    { id: "gen_copy", label: "Content", value: "copy", signal: "dissatisfaction.copy" },
    { id: "gen_visual", label: "Visual / presentation", value: "visual", signal: "dissatisfaction.visual" },
    { id: "gen_brand", label: "Brand alignment", value: "brand", signal: "dissatisfaction.brand" },
    { id: "gen_other", label: "Other", value: "other", signal: "dissatisfaction.other" },
  ]),
  nextQuestionRules: [
    { whenOptionIds: ["gen_tone"], nextQuestionId: "q_tone_direction" },
    { whenOptionIds: ["gen_copy"], nextQuestionId: "q_copy_direction" },
    { whenOptionIds: ["gen_visual"], nextQuestionId: "q_visual_direction" },
    { whenOptionIds: ["gen_brand"], nextQuestionId: "q_brand_align" },
    { whenOptionIds: ["gen_other"], nextQuestionId: "q_preserve" },
  ],
  defaultNextQuestionId: "q_preserve",
};

const ALL_QUESTIONS: readonly RefinementQuestion[] = [
  // Root questions (output-type specific)
  CAPTION_ROOT,
  SOCIAL_ROOT,
  LANDING_ROOT,
  WEBSITE_ROOT,
  CAMPAIGN_ROOT,
  VIDEO_ROOT,
  PRESENTATION_ROOT,
  LOGO_ROOT,
  BROCHURE_ROOT,
  EMAIL_ROOT,
  STRATEGY_ROOT,
  GENERIC_ROOT,
  // Shared follow-ups
  TONE_Q,
  LENGTH_Q,
  VISUAL_Q,
  COLOR_Q,
  LAYOUT_Q,
  CTA_Q,
  COPY_Q,
  BRAND_ALIGN_Q,
  STRATEGY_Q,
  STRATEGY_DEPTH_Q,
  PRESERVE_Q,
  // Logo-specific follow-ups
  LOGO_SYMBOL_Q,
  LOGO_TYPEFACE_Q,
  LOGO_COLOR_PALETTE_Q,
  LOGO_PRESERVE_Q,
  // Email-specific follow-ups
  EMAIL_SUBJECT_Q,
];

// ---------------------------------------------------------------------------
// Output-type-specific question text overrides
// ---------------------------------------------------------------------------

type QuestionTextMap = Partial<Record<string, { question: string; options?: Partial<Record<string, string>> }>>;

const OUTPUT_TYPE_CONTEXT: Partial<Record<RefinementOutputType | "generic", QuestionTextMap>> = {
  presentation: {
    q_layout_direction: {
      question: "How should the slide structure change?",
      options: {
        lay_cleaner: "Clearer slide hierarchy",
        lay_dense: "More content per slide",
        lay_sections: "Reorganize slide sections",
        lay_keep: "Keep current structure",
      },
    },
    q_visual_direction: {
      question: "What visual direction for the deck?",
    },
    q_color_direction: {
      question: "How should the deck colors / theme change?",
    },
    q_copy_direction: {
      question: "How should slide copy change?",
    },
    q_length_direction: {
      question: "How many slides / how dense?",
      options: {
        len_shorter: "Fewer slides",
        len_longer: "More slides / detail",
        len_same: "Similar length",
      },
    },
  },
  social_creative: {
    q_layout_direction: {
      question: "How should the social post layout change?",
      options: {
        lay_cleaner: "Cleaner visual hierarchy",
        lay_dense: "More content on screen",
        lay_sections: "Rearrange elements",
        lay_keep: "Keep current layout",
      },
    },
    q_visual_direction: {
      question: "What visual direction should this post take?",
    },
    q_tone_direction: {
      question: "How should the tone of this post change?",
    },
    q_copy_direction: {
      question: "What should change in the post copy?",
      options: {
        copy_hook: "Opening line / hook",
      },
    },
    q_color_direction: {
      question: "How should the post's colours change?",
    },
  },
  logo: {
    q_visual_direction: {
      question: "What visual direction should this logo take?",
    },
    q_tone_direction: {
      question: "How should the overall feel of the logo change?",
    },
    q_color_direction: {
      question: "How should the logo's colour palette change?",
    },
  },
  email: {
    q_layout_direction: {
      question: "How should the email layout change?",
      options: {
        lay_cleaner: "Cleaner email structure",
        lay_dense: "More content above the fold",
        lay_sections: "Reorganise email sections",
        lay_keep: "Keep current layout",
      },
    },
    q_tone_direction: {
      question: "How should the tone of this email change?",
    },
    q_copy_direction: {
      question: "What should change in the email body?",
    },
    q_color_direction: {
      question: "How should the email's colour scheme change?",
    },
  },
  landing_page: {
    q_layout_direction: {
      question: "How should the landing page layout change?",
      options: {
        lay_cleaner: "Cleaner page hierarchy",
        lay_dense: "More content per section",
        lay_sections: "Reorganise page sections",
        lay_keep: "Keep current layout",
      },
    },
    q_visual_direction: {
      question: "What visual direction should this landing page take?",
    },
    q_tone_direction: {
      question: "How should the landing page copy tone change?",
    },
    q_copy_direction: {
      question: "What should change in the landing page content?",
    },
    q_color_direction: {
      question: "How should the page's colour palette change?",
    },
    q_cta_direction: {
      question: "How should the primary CTA change?",
    },
  },
  website: {
    q_layout_direction: {
      question: "How should the website layout change?",
      options: {
        lay_cleaner: "Cleaner navigation & hierarchy",
        lay_dense: "More content density",
        lay_sections: "Reorganise page sections",
        lay_keep: "Keep current layout",
      },
    },
    q_visual_direction: {
      question: "What visual direction should the website take?",
    },
    q_tone_direction: {
      question: "How should the website's tone change?",
    },
    q_copy_direction: {
      question: "What should change in the website content?",
    },
    q_color_direction: {
      question: "How should the website's colour palette change?",
    },
  },
  campaign_strategy: {
    q_tone_direction: {
      question: "How should the campaign's tone change?",
    },
    q_copy_direction: {
      question: "What should change in the campaign messaging?",
    },
  },
  strategy: {
    q_tone_direction: {
      question: "How should the strategy's tone change?",
    },
    q_copy_direction: {
      question: "What should change in the strategy content?",
    },
  },
  brochure: {
    q_layout_direction: {
      question: "How should the brochure layout change?",
      options: {
        lay_cleaner: "Cleaner page hierarchy",
        lay_dense: "More content per page",
        lay_sections: "Reorganise brochure sections",
        lay_keep: "Keep current layout",
      },
    },
    q_visual_direction: {
      question: "What visual direction should this brochure take?",
    },
    q_tone_direction: {
      question: "How should the brochure copy tone change?",
    },
    q_copy_direction: {
      question: "What should change in the brochure content?",
    },
    q_color_direction: {
      question: "How should the brochure's colour palette change?",
    },
  },
  caption: {
    q_tone_direction: {
      question: "How should the caption's tone change?",
    },
    q_copy_direction: {
      question: "What should change in the caption?",
    },
    q_length_direction: {
      question: "What length do you prefer for the caption?",
    },
  },
  video: {
    q_tone_direction: {
      question: "How should the video's tone change?",
    },
    q_copy_direction: {
      question: "What should change in the video script?",
    },
    q_visual_direction: {
      question: "What visual direction should this video take?",
    },
    q_length_direction: {
      question: "What pacing / length do you prefer?",
      options: {
        len_shorter: "Faster paced / shorter",
        len_longer: "Slower paced / longer",
        len_same: "Keep current pacing",
      },
    },
  },
  copy: {
    q_tone_direction: {
      question: "How should the tone of this copy change?",
    },
    q_copy_direction: {
      question: "What should change in the copy?",
    },
    q_length_direction: {
      question: "What length do you prefer for this copy?",
    },
  },
};

/**
 * Returns a context-aware copy of the question with text specific to the output type.
 * Keeps all signals/IDs intact — only display text changes.
 */
export function contextualizeQuestion(
  question: RefinementQuestion,
  outputType: RefinementOutputType | "*"
): RefinementQuestion {
  if (outputType === "*") return question;
  const typeMap = OUTPUT_TYPE_CONTEXT[outputType as RefinementOutputType];
  if (!typeMap) return question;
  const override = typeMap[question.questionId];
  if (!override) return question;

  const options =
    override.options
      ? question.options.map((opt) => {
          const labelOverride = override.options![opt.optionId];
          return labelOverride ? { ...opt, label: labelOverride } : opt;
        })
      : question.options;

  return {
    ...question,
    question: override.question ?? question.question,
    options,
  };
}

export class RefinementQuestionBank {
  private readonly byId = new Map<string, RefinementQuestion>();

  constructor(questions: readonly RefinementQuestion[] = ALL_QUESTIONS) {
    for (const q of questions) this.byId.set(q.questionId, q);
  }

  get(questionId: string): RefinementQuestion | undefined {
    return this.byId.get(questionId);
  }

  rootFor(outputType: RefinementOutputType): RefinementQuestion {
    const typed = [...this.byId.values()].find(
      (q) => q.outputType === outputType && q.dimension === "dissatisfaction"
    );
    if (typed) return typed;
    return this.byId.get("q_generic_root")!;
  }

  list(): readonly RefinementQuestion[] {
    return [...this.byId.values()];
  }
}

export function createDefaultQuestionBank(): RefinementQuestionBank {
  return new RefinementQuestionBank();
}

export function inferOutputType(input: {
  readonly outputContractId?: string;
  readonly taskType?: string;
  readonly taskKey?: string;
  readonly productService?: string;
}): RefinementOutputType {
  const hay = `${input.outputContractId ?? ""} ${input.taskType ?? ""} ${input.taskKey ?? ""} ${input.productService ?? ""}`.toLowerCase();

  // Presentations / decks — before generic "post" / creative matches
  if (
    hay.includes("presentation") ||
    hay.includes("pitch") ||
    hay.includes("deck") ||
    hay.includes("slides") ||
    hay.includes("powerpoint") ||
    hay.includes("keynote")
  ) {
    return "presentation";
  }

  // Product service id: branding → logo tree
  if (
    hay.includes("branding") ||
    hay.includes("logo") ||
    hay.includes("brand_mark") ||
    hay.includes("brandmark") ||
    hay.includes("identity")
  ) {
    return "logo";
  }

  // Brochure / print collateral
  if (hay.includes("brochure") || hay.includes("flyer") || hay.includes("leaflet") || hay.includes("print")) return "brochure";

  // Email
  if (hay.includes("email") || hay.includes("e-mail") || hay.includes("newsletter") || hay.includes("edm")) return "email";

  // Strategy (standalone — not campaign strategy)
  if (
    (hay.includes("strategy") || hay.includes("brand_strategy") || hay.includes("content_strategy")) &&
    !hay.includes("campaign")
  ) return "strategy";

  // Caption
  if (hay.includes("caption") || hay.includes("social_caption")) return "caption";

  // Landing page
  if (hay.includes("landing")) return "landing_page";

  // Website
  if (hay.includes("website") || /\bsite\b/.test(hay)) return "website";

  // Campaign strategy
  if (hay.includes("campaign") || hay.includes("campaign_strategy")) return "campaign_strategy";

  // Video
  if (hay.includes("video") || hay.includes("reel") || hay.includes("motion")) return "video";

  // Social creative
  if (
    hay.includes("social") ||
    hay.includes("instagram") ||
    hay.includes("meta_ad") ||
    hay.includes("facebook_ad") ||
    /\bpost\b/.test(hay)
  ) return "social_creative";

  // Copy / text
  if (hay.includes("copy") || hay.includes("copywriting") || hay.includes("tagline") || hay.includes("headline")) return "copy";

  return "generic";
}
