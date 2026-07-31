/**
 * Request validation helpers.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { ApiRequest, ApiVersion } from "../contracts";

const VERSIONS = new Set(["v1", "v2"]);

export function validateApiRequest(request: ApiRequest): Result<ApiRequest> {
  if (!request.requestId?.trim()) {
    return failure(new ValidationError("requestId is required"));
  }
  if (!request.method) {
    return failure(new ValidationError("method is required"));
  }
  if (!request.path?.startsWith("/")) {
    return failure(new ValidationError("path must start with /"));
  }
  if (!VERSIONS.has(request.version)) {
    return failure(new ValidationError("unsupported API version"));
  }
  // Path must match declared version prefix for future-compatible contracts
  if (!request.path.startsWith(`/${request.version}/`) && request.path !== `/${request.version}/health` && request.path !== `/${request.version}/ready`) {
    if (!request.path.startsWith(`/${request.version}`)) {
      return failure(
        new ValidationError("path version mismatch", {
          version: request.version,
          path: request.path,
        })
      );
    }
  }
  return success(request);
}

export function parseVersionFromPath(path: string): ApiVersion | undefined {
  const seg = path.split("/").filter(Boolean)[0];
  if (seg === "v1" || seg === "v2") return seg;
  return undefined;
}
