/**
 * Build typed patches from parsed intent + resolved target (M6).
 */

import type { DeckSpec } from "../artifacts/presentation/types";
import { refinementError } from "./errors";
import type { ParsedRefinementIntent } from "./instruction-parser";
import type {
  CdfPatchOperation,
  CdfRefinementPatch,
  CdfResolvedRefinementTarget,
} from "./types";

function findElement(deck: DeckSpec, slideId?: string, elementId?: string) {
  if (!slideId || !elementId) return undefined;
  const slide = deck.slides.find((s) => s.id === slideId);
  return slide?.elements.find((e) => e.id === elementId);
}

function currentFontSize(deck: DeckSpec, target: CdfResolvedRefinementTarget): number {
  const el = findElement(deck, target.slideId, target.elementId);
  if (el?.style?.fontSize != null) return Number(el.style.fontSize);
  return 24;
}

export function buildRefinementPatch(input: {
  deck: DeckSpec;
  intent: ParsedRefinementIntent;
  target: CdfResolvedRefinementTarget;
}): CdfRefinementPatch {
  const { intent, target, deck } = input;
  if (intent.unsupported || !intent.op) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      intent.unsupportedReason ?? "Unsupported refinement operation",
    );
  }

  const ops: CdfPatchOperation[] = [];

  if (target.targetKind === "artifact" && intent.op === "SET_TEXT_COLOR") {
    for (const slide of deck.slides) {
      for (const el of slide.elements) {
        if (el.type !== "text") continue;
        const id = el.id.toLowerCase();
        const role = String(el.style?.fontRole ?? "").toLowerCase();
        if (
          id.includes("subtitle") ||
          role === "subtitle"
        ) {
          continue;
        }
        if (
          id.includes("title") ||
          id.includes("headline") ||
          role === "title" ||
          role === "headline"
        ) {
          ops.push({
            op: "SET_TEXT_COLOR",
            target: { slideId: slide.id, elementId: el.id },
            value: intent.value,
            property: "style.color",
          });
        }
      }
    }
    return { operations: ops, scope: "artifact" };
  }

  const baseTarget = {
    slideId: target.slideId,
    elementId: target.elementId,
  };

  switch (intent.op) {
    case "SET_TEXT":
      ops.push({
        op: "SET_TEXT",
        target: baseTarget,
        value: intent.textValue ?? intent.value,
        property: "content",
      });
      break;
    case "SET_FONT_SIZE": {
      let size: number;
      if (typeof intent.value === "number") size = intent.value;
      else if (intent.value === "smaller") {
        size = Math.max(8, currentFontSize(deck, target) - 4);
      } else {
        size = currentFontSize(deck, target) + 8;
      }
      ops.push({
        op: "SET_FONT_SIZE",
        target: baseTarget,
        value: size,
        property: "style.fontSize",
      });
      break;
    }
    case "SET_POSITION": {
      const el = findElement(deck, target.slideId, target.elementId);
      if (!el) {
        throw refinementError("TARGET_NOT_FOUND", "Element missing for position patch");
      }
      const delta = intent.value as { dx?: number; dy?: number };
      ops.push({
        op: "SET_POSITION",
        target: baseTarget,
        value: {
          x: Math.min(1, Math.max(0, el.bounds.x + (delta.dx ?? 0))),
          y: Math.min(1, Math.max(0, el.bounds.y + (delta.dy ?? 0))),
        },
        property: "bounds.xy",
      });
      break;
    }
    case "SET_SIZE": {
      const el = findElement(deck, target.slideId, target.elementId);
      if (!el) {
        throw refinementError("TARGET_NOT_FOUND", "Element missing for size patch");
      }
      const delta = intent.value as { dw?: number; dh?: number };
      ops.push({
        op: "SET_SIZE",
        target: baseTarget,
        value: {
          width: Math.min(1, Math.max(0.01, el.bounds.width + (delta.dw ?? 0))),
          height: Math.min(1, Math.max(0.01, el.bounds.height + (delta.dh ?? 0))),
        },
        property: "bounds.wh",
      });
      break;
    }
    case "REPLACE_ASSET":
      if (typeof intent.value !== "string" || !/^[a-f0-9]{24}$/i.test(intent.value)) {
        throw refinementError(
          "ASSET_NOT_FOUND",
          "REPLACE_ASSET requires a 24-hex Vault ObjectId",
        );
      }
      ops.push({
        op: "REPLACE_ASSET",
        target: baseTarget,
        value: intent.value,
        property: "vaultAssetId",
      });
      break;
    case "SET_TEXT_COLOR":
      ops.push({
        op: "SET_TEXT_COLOR",
        target: baseTarget,
        value: intent.value,
        property: "style.color",
      });
      break;
    case "SET_VISIBILITY":
      ops.push({
        op: "SET_VISIBILITY",
        target: baseTarget,
        value: intent.value,
        property: "visible",
      });
      break;
    default:
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Patch op not implemented: ${intent.op}`,
      );
  }

  return { operations: ops, scope: intent.scope };
}
