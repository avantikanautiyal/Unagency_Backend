/**
 * Tenant service with Mongo organization sync for Firebase-bridged principals.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError, NotFoundError } from "../../core/errors";
import Organizations from "../../../models/organization.model";
import type {
  OrganizationRecord,
  WorkspaceRecord,
  UserRecord,
  TenantContext,
  RoleName,
  ProjectRecord,
  DepartmentRecord,
  TeamRecord,
} from "../contracts";
import type { ITenantService } from "../interfaces";
import { InMemoryTenantService } from "./in-memory-tenant-service";

export interface ExternalOrganizationSyncInput {
  readonly organizationId: string;
  readonly name: string;
}

export class BridgedTenantService implements ITenantService {
  constructor(private readonly inner: InMemoryTenantService) {}

  createOrganization(name: string): Result<OrganizationRecord> {
    return this.inner.createOrganization(name);
  }

  registerOrganization(record: OrganizationRecord): Result<OrganizationRecord> {
    return this.inner.registerOrganization(record);
  }

  createWorkspace(organizationId: string, name: string): Result<WorkspaceRecord> {
    return this.inner.createWorkspace(organizationId, name);
  }

  createUser(input: {
    email: string;
    displayName: string;
    organizationId: string;
    roles: RoleName[];
  }): Result<UserRecord> {
    return this.inner.createUser(input);
  }

  createProject(input: {
    organizationId: string;
    workspaceId: string;
    name: string;
  }): Result<ProjectRecord> {
    return this.inner.createProject(input);
  }

  createDepartment(organizationId: string, name: string): Result<DepartmentRecord> {
    return this.inner.createDepartment(organizationId, name);
  }

  createTeam(
    organizationId: string,
    name: string,
    departmentId?: string
  ): Result<TeamRecord> {
    return this.inner.createTeam(organizationId, name, departmentId);
  }

  async ensureTenant(context: TenantContext): Promise<Result<TenantContext>> {
    if (!context.organizationId) {
      return failure(new ValidationError("organizationId required for tenant isolation"));
    }

    const synced = await this.syncOrganizationFromExternal({
      organizationId: context.organizationId,
      name: context.organizationId,
    });
    if (!synced.ok) {
      return synced;
    }

    return this.inner.ensureTenant(context);
  }

  getOrganization(organizationId: string): Result<OrganizationRecord | undefined> {
    return this.inner.getOrganization(organizationId);
  }

  listWorkspaces(organizationId: string): Result<readonly WorkspaceRecord[]> {
    return this.inner.listWorkspaces(organizationId);
  }

  getUser(userId: string): Result<UserRecord | undefined> {
    return this.inner.getUser(userId);
  }

  /** Sync Mongo organization into platform tenant store (idempotent). */
  async syncOrganizationFromExternal(
    input: ExternalOrganizationSyncInput
  ): Promise<Result<OrganizationRecord>> {
    const existing = this.inner.getOrganization(input.organizationId);
    if (existing.ok && existing.value) {
      return success(existing.value);
    }

    let name = input.name?.trim();
    try {
      const mongoOrg = await Organizations.findById(input.organizationId);
      if (mongoOrg) {
        name = mongoOrg.companyName || name || "Organization";
      }
    } catch {
      // Mongo unavailable — fall through to in-memory check only
    }

    if (!name) {
      return failure(new NotFoundError("organization not found"));
    }

    const registered = this.inner.registerOrganization({
      organizationId: input.organizationId,
      name,
      createdAt: new Date().toISOString(),
      status: "active",
    });

    if (!registered.ok) {
      return registered;
    }

    const org = registered.value;
    const workspaces = this.inner.listWorkspaces(org.organizationId);
    if (workspaces.ok && workspaces.value.length === 0) {
      this.inner.createWorkspace(org.organizationId, "Default");
    }

    return registered;
  }

  /** Expose inner service for seeding and tests. */
  get inMemory(): InMemoryTenantService {
    return this.inner;
  }
}
