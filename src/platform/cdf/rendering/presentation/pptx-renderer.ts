/**
 * Presentation Deck → PPTX (M5B).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { PRESENTATION_ARTIFACT_KEYS } from "../../artifacts/presentation/keys";
import type { ArtifactRenderer, CdfRendererInput, CdfRendererOutput } from "../types";
import { renderError } from "../errors";
import { buildCanonicalDeckRenderModel } from "./model";
import {
  buildPptxBytesFromSerializableModel,
  toSerializableModel,
} from "./pptx-build";

export const PPTX_RENDERER_ID = "presentation-deck-pptx";
export const PPTX_RENDERER_VERSION = "1.0.0";

function writeViaChildProcess(
  serializable: unknown,
  includeNotes: boolean,
): Buffer {
  const inputFile = path.join(
    os.tmpdir(),
    `cdf-pptx-in-${Date.now().toString(36)}.json`,
  );
  fs.writeFileSync(
    inputFile,
    JSON.stringify({ model: serializable, includeNotes }),
  );
  const script = path.join(__dirname, "pptx-child-write.cjs");
  const result = spawnSync(process.execPath, [script, inputFile], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    fs.unlinkSync(inputFile);
  } catch {
    /* ignore */
  }
  if (result.status !== 0) {
    throw renderError(
      "RENDER_FAILED",
      `PPTX child write failed: ${result.stderr || result.stdout || result.error}`,
    );
  }
  return Buffer.from(String(result.stdout || "").trim(), "base64");
}

export function createPresentationDeckPptxRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: PPTX_RENDERER_ID,
      rendererVersion: PPTX_RENDERER_VERSION,
      artifactKeys: [PRESENTATION_ARTIFACT_KEYS.deck],
      formats: ["pptx"],
      purposes: ["preview", "final"],
      description: "Canonical DeckSpec → PPTX via PptxGenJS (M5B)",
    },
    canRender({ artifactKey, format }) {
      return (
        artifactKey === PRESENTATION_ARTIFACT_KEYS.deck && format === "pptx"
      );
    },
    async render(input: CdfRendererInput): Promise<CdfRendererOutput> {
      const strictFonts = input.options.extras?.strictFonts === true;
      const model = buildCanonicalDeckRenderModel({
        deckData: input.data as Record<string, unknown>,
        designSystemData: input.designSystem as
          | Record<string, unknown>
          | undefined,
        resolvedAssets: input.resolvedAssets,
        unit: "in",
        strictFonts,
      });
      const serializable = toSerializableModel(model);
      const includeNotes = input.options.includeNotes !== false;

      let buffer: Buffer;
      if (process.env.JEST_WORKER_ID) {
        // pptxgenjs dynamic import('node:fs') is incompatible with Jest's VM.
        buffer = writeViaChildProcess(serializable, includeNotes);
      } else {
        try {
          buffer = await buildPptxBytesFromSerializableModel(serializable, {
            includeNotes,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes("experimental-vm-modules") ||
            msg.includes("dynamic import")
          ) {
            buffer = writeViaChildProcess(serializable, includeNotes);
          } else {
            throw renderError(
              "RENDER_FAILED",
              err instanceof Error ? err.message : "PPTX write failed",
            );
          }
        }
      }

      return {
        bytes: new Uint8Array(buffer),
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
    },
  };
}
