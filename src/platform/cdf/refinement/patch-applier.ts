/**
 * Deterministic patch application — returns a NEW DeckSpec (M6).
 * Never mutates the input object.
 */

import type { DeckElement, DeckSpec } from "../artifacts/presentation/types";
import { refinementError } from "./errors";
import type { CdfPatchOperation, CdfRefinementChange, CdfRefinementPatch } from "./types";

const FORBIDDEN_ROOT_KEYS = new Set([
  "schemaId",
  "designSystemRef",
  "sourceRefs",
]);

function cloneDeck(deck: DeckSpec): DeckSpec {
  return structuredClone(deck);
}

function findElementMutable(
  deck: DeckSpec,
  slideId?: string,
  elementId?: string,
): DeckElement | undefined {
  if (!slideId || !elementId) return undefined;
  const slide = deck.slides.find((s) => s.id === slideId);
  return slide?.elements.find((e) => e.id === elementId);
}

function readValue(el: DeckElement, op: CdfPatchOperation): unknown {
  switch (op.op) {
    case "SET_TEXT":
      return el.type === "text" ? el.content : undefined;
    case "SET_FONT_SIZE":
      return el.style?.fontSize;
    case "SET_TEXT_COLOR":
      return el.style?.color;
    case "SET_POSITION":
      return { x: el.bounds.x, y: el.bounds.y };
    case "SET_SIZE":
      return { width: el.bounds.width, height: el.bounds.height };
    case "REPLACE_ASSET":
      return el.type === "image" ? el.vaultAssetId : undefined;
    case "SET_VISIBILITY":
      return el.visible !== false;
    default:
      return undefined;
  }
}

export function validatePatchSafety(patch: CdfRefinementPatch): void {
  if (!patch.operations.length) {
    throw refinementError("INVALID_PATCH", "Patch has no operations");
  }
  for (const op of patch.operations) {
    if (!op.target.slideId && patch.scope !== "artifact") {
      throw refinementError("INVALID_PATCH", "Patch op missing slideId", {
        op: op.op,
      });
    }
  }
}

export function applyRefinementPatch(
  source: DeckSpec,
  patch: CdfRefinementPatch,
): { deck: DeckSpec; changes: CdfRefinementChange[] } {
  validatePatchSafety(patch);
  const deck = cloneDeck(source);
  const changes: CdfRefinementChange[] = [];

  // Protect identity fields
  for (const key of FORBIDDEN_ROOT_KEYS) {
    if (key === "designSystemRef") continue; // may only change via explicit future op
  }

  for (const op of patch.operations) {
    const el = findElementMutable(deck, op.target.slideId, op.target.elementId);
    if (!el) {
      throw refinementError(
        "TARGET_NOT_FOUND",
        `Cannot apply ${op.op}: missing ${op.target.slideId}.${op.target.elementId}`,
      );
    }
    const path = `${op.target.slideId}.${op.target.elementId}.${op.property ?? op.op}`;
    const from = readValue(el, op);

    switch (op.op) {
      case "SET_TEXT":
        if (el.type !== "text") {
          throw refinementError("INVALID_PATCH", "SET_TEXT requires text element");
        }
        el.content = String(op.value);
        break;
      case "SET_FONT_SIZE":
        el.style = { ...(el.style ?? {}), fontSize: Number(op.value) };
        break;
      case "SET_FONT_FAMILY":
        el.style = { ...(el.style ?? {}), fontFamily: String(op.value) } as never;
        break;
      case "SET_FONT_WEIGHT":
        el.style = { ...(el.style ?? {}), fontWeight: op.value as number | string };
        break;
      case "SET_TEXT_COLOR":
        el.style = { ...(el.style ?? {}), color: op.value as never };
        break;
      case "SET_FILL":
        el.style = { ...(el.style ?? {}), fill: op.value as never };
        break;
      case "SET_BACKGROUND": {
        const slide = deck.slides.find((s) => s.id === op.target.slideId);
        if (!slide) throw refinementError("TARGET_NOT_FOUND", "Slide missing");
        slide.background = op.value as never;
        break;
      }
      case "SET_POSITION": {
        const v = op.value as { x: number; y: number };
        el.bounds = { ...el.bounds, x: v.x, y: v.y };
        break;
      }
      case "SET_SIZE": {
        const v = op.value as { width: number; height: number };
        el.bounds = { ...el.bounds, width: v.width, height: v.height };
        break;
      }
      case "SET_OPACITY":
        el.style = { ...(el.style ?? {}), opacity: Number(op.value) };
        break;
      case "SET_ROTATION":
        el.bounds = { ...el.bounds, rotation: Number(op.value) };
        break;
      case "SET_ALIGNMENT":
        el.style = {
          ...(el.style ?? {}),
          textAlign: op.value as "left" | "center" | "right" | "justify",
        };
        break;
      case "REPLACE_ASSET":
        if (el.type !== "image") {
          throw refinementError("INVALID_PATCH", "REPLACE_ASSET requires image element");
        }
        el.vaultAssetId = String(op.value);
        break;
      case "SET_VISIBILITY":
        el.visible = Boolean(op.value);
        break;
      default:
        throw refinementError(
          "UNSUPPORTED_OPERATION",
          `Cannot apply op ${op.op}`,
        );
    }

    changes.push({
      property: op.property ?? op.op,
      path,
      from,
      to: readValue(el, op),
    });
  }

  // designSystemRef must remain identical unless explicitly patched (not supported yet)
  if (
    JSON.stringify(deck.designSystemRef) !==
    JSON.stringify(source.designSystemRef)
  ) {
    throw refinementError(
      "INVALID_PATCH",
      "designSystemRef must not change unless explicitly targeted",
    );
  }

  return { deck, changes };
}
