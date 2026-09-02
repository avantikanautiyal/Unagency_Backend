/**
 * In-memory tenant / organization / workspace / user service.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError, NotFoundError } from "../../core/errors";
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

export class InMemoryTenantService implements ITenantService {
  private readonly orgs = new Map<string, OrganizationRecord>();
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly users = new Map<string, UserRecord>();
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly departments = new Map<string, DepartmentRecord>();
  private readonly teams = new Map<string, TeamRecord>();

  constructor(
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string
  ) {}

  createOrganization(name: string): Result<OrganizationRecord> {
    if (!name.trim()) return failure(new ValidationError("organization name required"));
    const organizationId = this.createId("org");
    const record: OrganizationRecord = {
      organizationId,
      name,
      createdAt: this.nowIso(),
      status: "active",
    };
    this.orgs.set(organizationId, record);
    return success(record);
  }

  registerOrganization(record: OrganizationRecord): Result<OrganizationRecord> {
    if (!record.organizationId?.trim()) {
      return failure(new ValidationError("organizationId required"));
    }
    const existing = this.orgs.get(record.organizationId);
    if (existing) {
      return success(existing);
    }
    this.orgs.set(record.organizationId, record);
    return success(record);
  }

  createWorkspace(organizationId: string, name: string): Result<WorkspaceRecord> {
    if (!this.orgs.has(organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    const workspaceId = this.createId("ws");
    const record: WorkspaceRecord = {
      workspaceId,
      organizationId,
      name,
      createdAt: this.nowIso(),
    };
    this.workspaces.set(workspaceId, record);
    return success(record);
  }

  createUser(input: {
    email: string;
    displayName: string;
    organizationId: string;
    roles: RoleName[];
  }): Result<UserRecord> {
    if (!this.orgs.has(input.organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    const userId = this.createId("usr");
    const record: UserRecord = {
      userId,
      email: input.email,
      displayName: input.displayName,
      organizationId: input.organizationId,
      roles: input.roles,
      createdAt: this.nowIso(),
    };
    this.users.set(userId, record);
    return success(record);
  }

  createProject(input: {
    organizationId: string;
    workspaceId: string;
    name: string;
  }): Result<ProjectRecord> {
    const ws = this.workspaces.get(input.workspaceId);
    if (!ws || ws.organizationId !== input.organizationId) {
      return failure(new ValidationError("workspace/organization mismatch"));
    }
    const projectId = this.createId("prj");
    const record: ProjectRecord = {
      projectId,
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      name: input.name,
    };
    this.projects.set(projectId, record);
    return success(record);
  }

  createDepartment(organizationId: string, name: string): Result<DepartmentRecord> {
    if (!this.orgs.has(organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    const departmentId = this.createId("dept");
    const record = { departmentId, organizationId, name };
    this.departments.set(departmentId, record);
    return success(record);
  }

  createTeam(organizationId: string, name: string, departmentId?: string): Result<TeamRecord> {
    if (!this.orgs.has(organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    const teamId = this.createId("team");
    const record = { teamId, organizationId, departmentId, name };
    this.teams.set(teamId, record);
    return success(record);
  }

  async ensureTenant(context: TenantContext): Promise<Result<TenantContext>> {
    if (!context.organizationId) {
      return failure(new ValidationError("organizationId required for tenant isolation"));
    }
    if (!this.orgs.has(context.organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    if (context.workspaceId) {
      const ws = this.workspaces.get(context.workspaceId);
      if (!ws || ws.organizationId !== context.organizationId) {
        return failure(new ValidationError("workspace not in organization"));
      }
    }
    return success(context);
  }

  async syncOrganizationFromExternal(input: {
    organizationId: string;
    name: string;
  }): Promise<Result<OrganizationRecord>> {
    return this.registerOrganization({
      organizationId: input.organizationId,
      name: input.name.trim() || "Organization",
      createdAt: this.nowIso(),
      status: "active",
    });
  }

  getOrganization(organizationId: string): Result<OrganizationRecord | undefined> {
    return success(this.orgs.get(organizationId));
  }

  listWorkspaces(organizationId: string): Result<readonly WorkspaceRecord[]> {
    return success(
      [...this.workspaces.values()].filter((w) => w.organizationId === organizationId)
    );
  }

  getUser(userId: string): Result<UserRecord | undefined> {
    return success(this.users.get(userId));
  }
}
