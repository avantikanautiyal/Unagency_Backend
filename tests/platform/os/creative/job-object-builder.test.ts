/**
 * Track B1 — Job Object builder tests.
 */

import {
  buildJobObjectFromContext,
  jobObjectMetadataExtras,
} from "../../../../src/platform/os/creative/job-object-builder";
import { jobObjectBriefUnchanged } from "../../../../src/platform/os/creative/job-object";

describe("job-object-builder", () => {
  it("never rewrites userBrief (L1)", () => {
    const brief = "  Launch Instagram post for summer sale  ";
    const job = buildJobObjectFromContext({ userBrief: brief });
    expect(job.userBrief).toBe(brief.trim());
    expect(jobObjectBriefUnchanged(job)).toBe(true);
  });

  it("builds understoodBrief from brand profile + job", () => {
    const job = buildJobObjectFromContext({
      userBrief: "Create a feed post",
      brandName: "Northstar",
      brandProfile: {
        positioning: "Premium outdoor apparel",
        targetAudience: "Urban hikers",
      },
    });
    expect(job.understoodBrief).toContain("Northstar");
    expect(job.understoodBrief).toContain("Premium outdoor");
    expect(job.understoodBrief).toContain("Urban hikers");
    expect(job.understoodBrief).toContain("Create a feed post");
  });

  it("metadata extras expose jobObject without touching prompt fields", () => {
    const job = buildJobObjectFromContext({ userBrief: "logo refresh" });
    const extras = jobObjectMetadataExtras(job);
    expect(extras.understoodBrief).toBe(job.understoodBrief);
    expect(extras.jobObject).toEqual(job);
    expect(extras).not.toHaveProperty("prompt");
    expect(extras).not.toHaveProperty("enrichedPrompt");
  });
});
