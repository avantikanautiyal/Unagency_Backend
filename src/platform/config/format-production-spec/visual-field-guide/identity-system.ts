/**
 * Visual Field Guide — identity, layout, placement, format logic (pages 2–5).
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
    "Keep the supplied UNAGENCY wordmark intact; never retype, stretch, trace, invent a monogram, or add effects.",
    "Identity base is black/white contrast with a clear alignment grid and generous breathing room.",
    "Muted teal in guides is annotation-only — not an approved brand palette expansion.",
    "House clear-space proposal: 0.5 × logo-height on every side; starting minimum 180 px digital / 35 mm print — test actual size.",
  ]),
});

export const VISUAL_LAYOUT_HYGIENE: VisualLayoutHygienePack = Object.freeze({
  id: "layout_hygiene",
  title: "Layout hygiene",
  lines: Object.freeze([
    "A grid is a guide, not decoration — adapt strong focal point, large headline, and separated identity zone.",
    "Keep sample copy and branding UNAGENCY-only unless the brief supplies approved client identity.",
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
    "UNAGENCY master presets: 1080×1080 square; 1080×1350 portrait; 1080×1920 vertical; 1920×1080 landscape video.",
    "Specific platform delivery may differ — resolve the booked placement and use the matching Spec card.",
  ]),
  masters: VISUAL_FORMAT_MASTERS,
});
