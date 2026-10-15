import {
  evaluateWebsitePreview,
  repairWebsiteHtml,
  staticWebsiteChecks,
} from "../../../../src/platform/os/delivery/website-quality-gate";
import {
  createBrowserRuntimeCheck,
  type BrowserRuntimeCheckResult,
} from "../../../../src/platform/os/evaluation/runtime/browser-runtime-evaluator";

const BODY =
  "<header><nav><a href='#about'>About</a></nav></header><main><h1>Northwind Coffee</h1>" +
  "<section id='about'><p>Single-origin beans roasted weekly in small batches for cafés across the coast.</p></section></main>";

const GOOD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Northwind</title></head><body>${BODY}</body></html>`;

/** Overflows a 390px phone: fixed-width hero image, no viewport meta. */
const OVERFLOWING = `<!doctype html><html><head><title>Northwind</title></head><body>${BODY}<img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" style="width:1200px"></body></html>`;

function fakeRuntime(overflowUntilRepaired: boolean): (html: string) => Promise<BrowserRuntimeCheckResult> {
  return async (html) => {
    const overflow = overflowUntilRepaired && !html.includes("data-unagency-qa");
    return {
      evaluated: true,
      status: "COMPLETED",
      startupSucceeded: true,
      runtimeErrors: [],
      consoleErrors: [],
      failedResourceLoads: [],
      confidence: "measured",
      evidence: [],
      viewportResults: [
        { name: "desktop", width: 1280, height: 800, renderSuccess: true, documentWidth: 1280, documentHeight: 900, horizontalOverflow: false, evidence: [] },
        { name: "mobile", width: 390, height: 844, renderSuccess: true, documentWidth: overflow ? 1200 : 390, documentHeight: 1400, horizontalOverflow: overflow, evidence: [] },
      ],
    } as BrowserRuntimeCheckResult;
  };
}

describe("website quality gate", () => {
  it("passes a well-formed page with no issues", () => {
    expect(staticWebsiteChecks(GOOD)).toEqual([]);
  });

  it("flags an empty page and placeholder images as blocking", () => {
    const issues = staticWebsiteChecks('<html><body><img src="#"></body></html>');
    const blocking = issues.filter((i) => i.severity === "blocking").map((i) => i.id);
    expect(blocking).toEqual(expect.arrayContaining(["content.empty", "assets.img_src"]));
  });

  it("flags in-page links to sections that do not exist", () => {
    const html = GOOD.replace("id='about'", "id='story'");
    expect(staticWebsiteChecks(html).map((i) => i.id)).toContain("navigation.dead_anchor");
  });

  it("repairs mechanically without touching content", () => {
    const issues = staticWebsiteChecks(OVERFLOWING);
    const { html, repairs } = repairWebsiteHtml(OVERFLOWING, issues);
    expect(repairs).toEqual(expect.arrayContaining(["added viewport meta", 'added lang="en"']));
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Single-origin beans");
  });

  it("repairs mobile overflow, re-renders and re-validates (bounded)", async () => {
    const { html, report } = await evaluateWebsitePreview({ html: OVERFLOWING, runtimeCheck: fakeRuntime(true) });
    expect(report.attempts).toBe(2);
    expect(report.repairsApplied).toContain("added responsive media/box-sizing safety CSS");
    expect(report.issues.some((i) => i.id === "responsive.mobile_overflow")).toBe(false);
    expect(report.passed).toBe(true);
    expect(html).toContain("data-unagency-qa");
  });

  it("never passes a page that failed to render", async () => {
    const { report } = await evaluateWebsitePreview({
      html: GOOD,
      runtimeCheck: async () =>
        ({
          evaluated: true,
          status: "FAILED",
          startupSucceeded: false,
          runtimeErrors: ["ReferenceError: React is not defined"],
          consoleErrors: [],
          failedResourceLoads: [],
          confidence: "measured",
          evidence: [],
        }) as BrowserRuntimeCheckResult,
    });
    expect(report.passed).toBe(false);
    expect(report.issues.find((i) => i.id === "render.failed")?.detail).toContain("React is not defined");
  });

  it("reports static-only QA honestly when no browser is available", async () => {
    const { report } = await evaluateWebsitePreview({ html: GOOD });
    expect(report.browserEvaluated).toBe(false);
    expect(report.browserSkipReason).toBe("runtime_check_not_configured");
  });

  const realBrowser = process.env.ENABLE_BROWSER_RUNTIME_IN_TESTS === "true" ? it : it.skip;
  realBrowser(
    "real Chrome: detects the phone overflow and the repair removes it",
    async () => {
      const runtimeCheck = createBrowserRuntimeCheck();
      const before = await runtimeCheck(OVERFLOWING);
      expect(before.viewportResults?.find((v) => v.name === "mobile")?.horizontalOverflow).toBe(true);
      const { report } = await evaluateWebsitePreview({ html: OVERFLOWING, runtimeCheck });
      expect(report.browserEvaluated).toBe(true);
      expect(report.attempts).toBe(2);
      expect(report.viewports?.find((v) => v.name === "mobile")?.horizontalOverflow).toBe(false);
      expect(report.passed).toBe(true);
    },
    60_000,
  );
});
