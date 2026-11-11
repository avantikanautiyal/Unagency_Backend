/**
 * Website preview QA is a note, never a failure: a thin / broken preview keeps
 * the website and carries "Preview may be incomplete".
 */

import {
  materializeWebsiteExport,
  WEBSITE_PREVIEW_INCOMPLETE_NOTE,
} from "../../../src/platform/api/services/website-export-materializer";
import { createAsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";

function asyncMedia() {
  return createAsyncMediaPlatform({
    env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
    forceInMemory: true,
    artifactsRepo: new InMemoryArtifactRepository(),
    nowIso: () => "2026-11-12T10:00:00.000Z",
    clockMs: () => 1_794_000_000_000,
  });
}

describe("website preview QA never fails the website", () => {
  it("keeps a thin primary route and marks the preview incomplete", async () => {
    const exported = await materializeWebsiteExport({
      asyncMedia: asyncMedia(),
      executionId: "exec_site_thin",
      organizationId: "org_site",
      createId: (p) => `${p}_thin`,
      jobSummary: {
        structuredData: {
          title: "Launch",
          html: "<!doctype html><html><head><title>Launch</title></head><body><h1>Launch</h1></body></html>",
        },
      },
      metadata: { service: "website", outputKind: "deferred_website" },
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.htmlArtifactId).toBeTruthy();
    const plan = exported.value.plan as Record<string, unknown>;
    expect(plan.previewIncomplete).toBe(true);
    expect(plan.previewNote).toBe(WEBSITE_PREVIEW_INCOMPLETE_NOTE);
  });
});
