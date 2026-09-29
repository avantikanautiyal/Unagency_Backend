/**
 * M8E — Assert Packaging exact upstream refs resolve (never latest).
 */

import { getArtifactVersion } from "../../artifacts";
import { CdfArtifactError } from "../../artifacts/errors";
import { PACKAGING_ARTIFACT_KEYS } from "../../artifacts/packaging/keys";
import { renderError } from "../errors";

type ExactRef = { artifactId?: string; version?: number; artifactKey?: string };

function assertExactRef(
  label: string,
  ref: ExactRef | undefined,
  ownership: { organizationId?: string; projectId?: string },
): void {
  if (!ref) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Packaging missing exact upstream ref: ${label}`,
    );
  }
  if (!ref.artifactId || ref.version == null || !Number.isInteger(ref.version)) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Packaging upstream ${label} must be exact artifactId+version (never latest)`,
      { ref },
    );
  }
  if (ref.version === ("latest" as unknown)) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Packaging upstream ${label} must not use latest`,
    );
  }
  try {
    getArtifactVersion(ref.artifactId, ref.version, ownership);
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      if (err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID") {
        throw renderError(
          "ARTIFACT_OWNERSHIP_INVALID",
          `Cross-tenant Packaging dependency refused: ${label}`,
          { artifactId: ref.artifactId, version: ref.version },
        );
      }
      throw renderError(
        "ARTIFACT_NOT_FOUND",
        `Packaging upstream ${label} ${ref.artifactId}@v${ref.version} not found`,
        { artifactId: ref.artifactId, version: ref.version },
      );
    }
    throw err;
  }
}

/** Verify exact upstream pins when present on Packaging payloads. */
export function assertPackagingUpstreamExactRefs(
  artifactKey: string,
  data: Record<string, unknown>,
  ownership: { organizationId?: string; projectId?: string },
): void {
  const keysNeedingDeps = new Set<string>([
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
    PACKAGING_ARTIFACT_KEYS.frontPack,
    PACKAGING_ARTIFACT_KEYS.completePack,
    PACKAGING_ARTIFACT_KEYS.views,
    PACKAGING_ARTIFACT_KEYS.skuAdaptations,
  ]);
  if (!keysNeedingDeps.has(artifactKey)) return;

  // complete-pack requires all four exact pins
  if (artifactKey === PACKAGING_ARTIFACT_KEYS.completePack) {
    assertExactRef("dielineRef", data.dielineRef as ExactRef, ownership);
    assertExactRef("routesRef", data.routesRef as ExactRef, ownership);
    assertExactRef(
      "threeDDirectionRef",
      data.threeDDirectionRef as ExactRef,
      ownership,
    );
    assertExactRef("frontPackRef", data.frontPackRef as ExactRef, ownership);
    return;
  }

  if (data.dielineRef) {
    assertExactRef("dielineRef", data.dielineRef as ExactRef, ownership);
  }
  if (data.routesRef) {
    assertExactRef("routesRef", data.routesRef as ExactRef, ownership);
  }
  if (data.threeDDirectionRef) {
    assertExactRef(
      "threeDDirectionRef",
      data.threeDDirectionRef as ExactRef,
      ownership,
    );
  }
  if (data.frontPackRef) {
    assertExactRef("frontPackRef", data.frontPackRef as ExactRef, ownership);
  }
  if (data.completePackRef) {
    assertExactRef(
      "completePackRef",
      data.completePackRef as ExactRef,
      ownership,
    );
  }
  if (data.viewsRef) {
    assertExactRef("viewsRef", data.viewsRef as ExactRef, ownership);
  }
}
