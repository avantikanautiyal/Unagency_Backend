/**
 * RendererRegistry — capability lookup + deterministic selection (M5).
 */

import { renderError } from "./errors";
import type {
  ArtifactRenderer,
  CdfRenderFormat,
  CdfRenderPurpose,
  CdfRendererCapability,
} from "./types";

type RegistryEntry = {
  renderer: ArtifactRenderer;
};

const g = globalThis as typeof globalThis & {
  __cdfRendererRegistry?: Map<string, RegistryEntry>;
};

function registry(): Map<string, RegistryEntry> {
  if (!g.__cdfRendererRegistry) g.__cdfRendererRegistry = new Map();
  return g.__cdfRendererRegistry;
}

function entryKey(rendererId: string, rendererVersion: string): string {
  return `${rendererId}@${rendererVersion}`;
}

export function resetCdfRendererRegistryForTests(): void {
  g.__cdfRendererRegistry = new Map();
}

export function registerRenderer(renderer: ArtifactRenderer): void {
  const { rendererId, rendererVersion } = renderer.capability;
  if (!rendererId || !rendererVersion) {
    throw renderError(
      "RENDERER_NOT_FOUND",
      "Renderer capability must include rendererId and rendererVersion",
    );
  }
  registry().set(entryKey(rendererId, rendererVersion), { renderer });
}

export function unregisterRenderer(
  rendererId: string,
  rendererVersion: string,
): boolean {
  return registry().delete(entryKey(rendererId, rendererVersion));
}

export function listRegisteredRenderers(): CdfRendererCapability[] {
  return [...registry().values()].map((e) => ({ ...e.renderer.capability }));
}

export function getRenderer(
  rendererId: string,
  rendererVersion: string,
): ArtifactRenderer | undefined {
  return registry().get(entryKey(rendererId, rendererVersion))?.renderer;
}

export type ResolveRendererInput = {
  artifactKey: string;
  format: CdfRenderFormat;
  purpose: CdfRenderPurpose;
  schemaVersion?: string;
  /** When set, must match an exact registered version. */
  rendererVersion?: string;
  /** Prefer a specific rendererId when multiple match. */
  rendererId?: string;
};

/**
 * Deterministic selection: sort by rendererId then version; pick first that canRender.
 * No silent format fallback.
 */
export function resolveRenderer(input: ResolveRendererInput): ArtifactRenderer {
  const candidates = [...registry().values()]
    .map((e) => e.renderer)
    .filter((r) => {
      if (input.rendererId && r.capability.rendererId !== input.rendererId) {
        return false;
      }
      if (
        input.rendererVersion &&
        r.capability.rendererVersion !== input.rendererVersion
      ) {
        return false;
      }
      return r.canRender({
        artifactKey: input.artifactKey,
        format: input.format,
        purpose: input.purpose,
        schemaVersion: input.schemaVersion,
      });
    })
    .sort((a, b) => {
      const idCmp = a.capability.rendererId.localeCompare(
        b.capability.rendererId,
      );
      if (idCmp !== 0) return idCmp;
      return a.capability.rendererVersion.localeCompare(
        b.capability.rendererVersion,
      );
    });

  if (candidates.length === 0) {
    if (input.rendererVersion && input.rendererId) {
      const exact = getRenderer(input.rendererId, input.rendererVersion);
      if (!exact) {
        throw renderError(
          "RENDERER_VERSION_UNSUPPORTED",
          `Renderer ${input.rendererId}@${input.rendererVersion} is not registered`,
          { ...input },
        );
      }
    }
    throw renderError(
      "RENDER_FORMAT_UNSUPPORTED",
      `No renderer for key=${input.artifactKey} format=${input.format} purpose=${input.purpose}`,
      { ...input },
    );
  }

  return candidates[0]!;
}

export function hasRendererCapability(input: ResolveRendererInput): boolean {
  try {
    resolveRenderer(input);
    return true;
  } catch {
    return false;
  }
}
