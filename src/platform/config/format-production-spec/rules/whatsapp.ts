/** WhatsApp field card — Format Spec p. 27. */

import { rule, srgbStill, videoWeb } from "./helpers";
import type { ProductionRule } from "../types";

export const WHATSAPP_RULES: readonly ProductionRule[] = Object.freeze([
  rule({
    id: "whatsapp.status",
    platform: "whatsapp",
    subtype: "content-design",
    placement: "status",
    status: "D",
    canvas: { width: 1080, height: 1920, unit: "px" },
    colour: "Rec.709",
    export: videoWeb,
    productionNote:
      "UNAGENCY vertical house default. No official dims verified — confirm app behavior.",
  }),
  rule({
    id: "whatsapp.catalog-product",
    platform: "whatsapp",
    subtype: "content-design",
    placement: "catalog-product",
    status: "D",
    canvas: { width: 800, height: 800, unit: "px" },
    colour: "sRGB",
    export: srgbStill,
    productionNote: "House square preset; not verified platform minimum.",
  }),
  rule({
    id: "whatsapp.business-profile",
    platform: "whatsapp",
    subtype: "content-design",
    placement: "business-profile",
    status: "D",
    canvas: { width: 640, height: 640, unit: "px" },
    colour: "sRGB",
    export: srgbStill,
    productionNote: "House master; circular crop test.",
  }),
  rule({
    id: "whatsapp.other-messaging",
    platform: "whatsapp",
    subtype: "content-design",
    placement: "other-messaging",
    status: "R",
    colour: "sRGB",
    export: srgbStill,
    productionNote:
      "Placement-specific — preview in intended client/device; no universal file/duration promise.",
  }),
  rule({
    id: "whatsapp.public-profile-cover",
    platform: "whatsapp",
    subtype: "content-design",
    placement: "public-profile-cover",
    status: "R",
    canvas: { width: 1500, height: 500, unit: "px" },
    colour: "sRGB",
    export: srgbStill,
    productionNote:
      "C29-supplied preset not verified in Spec WhatsApp card — confirm before production.",
  }),
]);
