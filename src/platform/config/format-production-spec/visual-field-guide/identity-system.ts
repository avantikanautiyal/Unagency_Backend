/**
 * Visual Field Guide — identity, layout, placement, format logic (pages 2–5).
 *
 * These lines are injected into provider-facing production prompts for ALL
 * client brands. They must stay brand-agnostic: never name a platform/house
 * wordmark as the creative identity to render.
 */

import type {
  VisualFormatLogicPack,
  VisualFormatMaster,
  VisualIdentitySystemPack,
  VisualLayoutHygienePack,
  VisualPlacementHygienePack,
} from "./types";

export const VISUAL_FORMAT_MASTERS: readonly VisualFormatMaster[] = Object.freeze([
  Object.freeze({
    id: "square" as const,
    width: 1080,
    height: 1080,
    unit: "px" as const,
    label: "Square",
    promptLine: "Square master: 1080×1080 — recompose; do not squeeze.",
  }),
  Object.freeze({
    id: "portrait" as const,
    width: 1080,
    height: 1350,
    unit: "px" as const,
    label: "Portrait",
    promptLine: "Portrait master: 1080×1350 — recompose; do not squeeze.",
  }),
  Object.freeze({
    id: "vertical" as const,
    width: 1080,
    height: 1920,
    unit: "px" as const,
    label: "Vertical",
    promptLine: "Vertical master: 1080×1920 — recompose; do not squeeze.",
  }),
  Object.freeze({
    id: "landscape_video" as const,
    width: 1920,
    height: 1080,
    unit: "px" as const,
    label: "Landscape video",
    promptLine: "Landscape video master: 1920×1080 — recompose; do not squeeze.",
  }),
]);

export const VISUAL_IDENTITY_SYSTEM: VisualIdentitySystemPack = Object.freeze({
  id: "identity_system",
  title: "Identity system",
  lines: Object.freeze([
    "Keep the supplied brand wordmark/logo intact; never retype, stretch, trace, invent a monogram, or add effects.",
    "Give the approved mark clear contrast, alignment, and generous breathing room.",
    "Guide/annotation colors in templates are not an approved brand palette expansion.",
    "House clear-space proposal: 0.5 × logo-height on every side; starting minimum 180 px digital / 35 mm print — test actual size.",
  ]),
});

export const VISUAL_LAYOUT_HYGIENE: VisualLayoutHygienePack = Object.freeze({
  id: "layout_hygiene",
  title: "Layout hygiene",
  lines: Object.freeze([
    "A grid is a guide, not decoration — adapt strong focal point, large headline, and separated identity zone.",
    "Use only the approved client brand identity from the brief and brand context — never invent a substitute mark or platform brand.",
    "Construction / guide lines appear in explanations only — never in the final campaign export.",
  ]),
});

export const VISUAL_PLACEMENT_HYGIENE: VisualPlacementHygienePack = Object.freeze({
  id: "placement_hygiene",
  title: "Placement hygiene",
  lines: Object.freeze([
    "Protect what must be seen; shaded safe zones are schematic — download current overlay for exact placement.",
    "Captions, native buttons and device crops can change what remains visible.",
    "A 5% layout inset alone does not prove safe-zone compliance — preview the publishing surface.",
  ]),
});

export const VISUAL_FORMAT_LOGIC: VisualFormatLogicPack = Object.freeze({
  id: "format_logic",
  title: "Format logic",
  lines: Object.freeze([
    "Recompose for every ratio — do not squeeze a long wordmark, headline and hero into one stretched master.",
    "Master presets: 1080×1080 square; 1080×1350 portrait; 1080×1920 vertical; 1920×1080 landscape video.",
    "Specific platform delivery may differ — resolve the booked placement and use the matching Spec card.",
  ]),
  masters: VISUAL_FORMAT_MASTERS,
});
