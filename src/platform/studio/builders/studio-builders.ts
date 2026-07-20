/**
 * Fluent builders for Studio commands.
 */

import type { StudioCommand, StudioTypeId, StudioAiSessionRefs } from "../contracts";

export class StudioWorkspaceBuilder {
  private organizationId = "";
  private name = "";
  private studioType: StudioTypeId = "marketing";
  private description?: string;

  static create(): StudioWorkspaceBuilder {
    return new StudioWorkspaceBuilder();
  }

  forOrganization(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  named(name: string): this {
    this.name = name;
    return this;
  }

  withStudioType(studioType: StudioTypeId): this {
    this.studioType = studioType;
    return this;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  build(): Extract<StudioCommand, { kind: "create_workspace" }> {
    return {
      kind: "create_workspace",
      organizationId: this.organizationId,
      name: this.name,
      studioType: this.studioType,
      description: this.description,
    };
  }
}

export class StudioAiSessionBuilder {
  private organizationId = "";
  private title = "";
  private refs: StudioAiSessionRefs = {
    workspaceId: "",
    historyEntryIds: [],
  };

  static create(): StudioAiSessionBuilder {
    return new StudioAiSessionBuilder();
  }

  forOrganization(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  titled(title: string): this {
    this.title = title;
    return this;
  }

  withRefs(refs: StudioAiSessionRefs): this {
    this.refs = refs;
    return this;
  }

  build(): Extract<StudioCommand, { kind: "start_ai_session" }> {
    return {
      kind: "start_ai_session",
      organizationId: this.organizationId,
      title: this.title,
      refs: this.refs,
    };
  }
}
