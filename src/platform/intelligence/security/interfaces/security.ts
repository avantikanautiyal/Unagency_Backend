/**
 * Security foundation ports.
 * No authentication, JWT, or Firebase integration in M0.
 */

import type { Result } from "../../shared/result";
import type {
  AuditEvent,
  AuthorizationRequest,
  AuthorizationResult,
  DataClassification,
  SecurityContext,
} from "../contracts/security-context";

export interface IAuthorizationPolicy {
  authorize(
    request: AuthorizationRequest
  ): Promise<Result<AuthorizationResult>>;
}

export interface IDataClassifier {
  classify(contentHint: string): DataClassification;
  redact(value: string, classification: DataClassification): string;
}

export interface IAuditLogger {
  log(event: AuditEvent): Promise<void>;
}

export interface ITrustGate {
  assertTrusted(context: SecurityContext, action: string): Promise<Result<void>>;
}
