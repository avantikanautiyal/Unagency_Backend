import type { ILogger } from "../../shared/interfaces";
import type { AuditEvent } from "../contracts/security-context";
import type { IAuditLogger } from "../interfaces/security";

/**
 * M0 audit logger that writes structured audit events to the platform logger.
 */
export class ConsoleAuditLogger implements IAuditLogger {
  constructor(private readonly logger: ILogger) {}

  async log(event: AuditEvent): Promise<void> {
    this.logger.info("intelligence.audit", {
      action: event.action,
      outcome: event.outcome,
      organizationId: event.context.organizationId,
      workspaceId: event.context.workspaceId,
      actorType: event.context.actorType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      occurredAt: event.occurredAt,
      details: event.details,
    });
  }
}
