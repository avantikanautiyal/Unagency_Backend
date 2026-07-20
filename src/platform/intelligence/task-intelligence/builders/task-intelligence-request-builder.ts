/**
 * Task Intelligence request builder.
 */

import type { TaskIntelligenceRequest } from "../contracts/request";
import type { PlaybookId } from "../contracts/identifiers";

export class TaskIntelligenceRequestBuilder {
  private requestId = "";
  private rawPrompt = "";
  private industryHint?: string;
  private departmentHint?: string;
  private playbookId?: PlaybookId;
  private budgetHint?: number;
  private latencyHintMs?: number;
  private regionHint?: string;
  private contextNotes?: string;

  static create(): TaskIntelligenceRequestBuilder {
    return new TaskIntelligenceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withRawPrompt(prompt: string): this {
    this.rawPrompt = prompt;
    return this;
  }

  withIndustryHint(industry: string): this {
    this.industryHint = industry;
    return this;
  }

  withDepartmentHint(department: string): this {
    this.departmentHint = department;
    return this;
  }

  withPlaybookId(id: PlaybookId): this {
    this.playbookId = id;
    return this;
  }

  withBudgetHint(budget: number): this {
    this.budgetHint = budget;
    return this;
  }

  build(): TaskIntelligenceRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.rawPrompt.trim()) throw new Error("rawPrompt required");
    return Object.freeze({
      requestId: this.requestId,
      rawPrompt: this.rawPrompt,
      industryHint: this.industryHint,
      departmentHint: this.departmentHint,
      playbookId: this.playbookId,
      budgetHint: this.budgetHint,
      latencyHintMs: this.latencyHintMs,
      regionHint: this.regionHint,
      contextNotes: this.contextNotes,
    });
  }
}
