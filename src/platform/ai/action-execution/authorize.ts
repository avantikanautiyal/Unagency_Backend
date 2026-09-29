/**
 * Phase 15 — Authorization boundary over existing ownership mechanisms.
 */

import { getCdfSession } from "../../cdf/session-store";
import type { ActionDefinition } from "../action-registry";
import type {
  ActionExecutionAuthCheck,
  CanonicalActionAuthorizationContext,
  CanonicalActionExecutionContext,
} from "./types";

export function enforceActionAuthorization(
  action: ActionDefinition,
  auth: CanonicalActionAuthorizationContext,
  exec: CanonicalActionExecutionContext,
): ActionExecutionAuthCheck {
  for (const req of action.authorizationRequirements) {
    switch (req) {
      case "organization": {
        const org = auth.organizationId ?? exec.organizationId;
        if (!org || !String(org).trim()) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "organization authorization context required",
            requirement: req,
          };
        }
        break;
      }
      case "project": {
        const project = auth.projectId ?? exec.projectId;
        if (!project || !String(project).trim()) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "project authorization context required",
            requirement: req,
          };
        }
        break;
      }
      case "cdf_session_ownership": {
        const sessionId = exec.cdfSessionId;
        const org = auth.organizationId ?? exec.organizationId;
        // start creates a session — ownership check applies only when session exists
        if (!sessionId) {
          if (!org) {
            return {
              ok: false,
              code: "UNAUTHORIZED",
              message: "organization required when creating cdf session",
              requirement: req,
            };
          }
          break;
        }
        const session = getCdfSession(sessionId);
        if (!session) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "cdf session not found for ownership check",
            requirement: req,
          };
        }
        if (
          org &&
          session.organizationId &&
          session.organizationId !== org
        ) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "cdf session organization mismatch",
            requirement: req,
          };
        }
        const project = auth.projectId ?? exec.projectId;
        if (
          project &&
          session.projectId &&
          session.projectId !== project
        ) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message: "cdf session project mismatch",
            requirement: req,
          };
        }
        break;
      }
      case "artifact_ownership": {
        const org = auth.organizationId ?? exec.organizationId;
        const project = auth.projectId ?? exec.projectId;
        if (!org || !project) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message:
              "organization and project required for artifact ownership (enforced by repository)",
            requirement: req,
          };
        }
        break;
      }
      case "conversation_membership": {
        if (auth.conversationAuthorized !== true) {
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message:
              "conversation membership must be attested by existing auth layer",
            requirement: req,
          };
        }
        break;
      }
      case "user_permission": {
        if (auth.userPermissionGranted !== true) {
          // Fail closed when no existing grant attestation is supplied.
          return {
            ok: false,
            code: "UNAUTHORIZED",
            message:
              "user permission must be attested by existing auth layer",
            requirement: req,
          };
        }
        break;
      }
      case "external_integration": {
        if (auth.externalIntegrationAuthorized !== true) {
          return {
            ok: false,
            code: "EXECUTION_NOT_SUPPORTED",
            message:
              "external integration authorization not attested — fail closed",
            requirement: req,
          };
        }
        break;
      }
      default: {
        return {
          ok: false,
          code: "EXECUTION_NOT_SUPPORTED",
          message: `unsupported authorization requirement: ${String(req)}`,
          requirement: req,
        };
      }
    }
  }
  return { ok: true };
}
