import {
  buildWebsiteRelevanceRetrySuffix,
  extractWebsiteBrandName,
  isCompleteWebsiteHtml,
  recoverWebProjectPlan,
  recoverWebsitePagePlan,
  validateWebsitePageRelevance,
} from "../../../src/platform/os/delivery/website-generation";

describe("website-generation (WebProject)", () => {
  it("extracts DiVastra from structured brief", () => {
    const brief = "Create a landing page for **DiVastra**, a fashion brand.";
    expect(extractWebsiteBrandName(brief)).toBe("DiVastra");
  });

  it("builds relevance retry suffix from reasons (not a relevance object)", () => {
    const suffix = buildWebsiteRelevanceRetrySuffix({
      userBrief: "DiVastra landing page",
      brandName: "DiVastra",
      reasons: ["brand_missing", "anchors_missing"],
    });
    expect(suffix).toContain("DiVastra");
    expect(suffix).toContain("brand_missing");
    expect(suffix).toContain("WebProject");
  });

  it("rejects Craigslist output when brief is DiVastra", () => {
    const brief =
      "Create a premium landing page for **DiVastra**, ethnic fashion. Peach pink beige palette.";
    const result = validateWebsitePageRelevance({
      userBrief: brief,
      brandName: "DiVastra",
      data: {
        title: "Craigslist - Your Community Marketplace",
        summary: "Buy and sell locally",
        stack: "html-static",
        entry: "index.html",
        files: [
          {
            path: "index.html",
            content:
              "<!DOCTYPE html><html><head><title>Craigslist</title></head><body><h1>Craigslist</h1></body></html>",
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("brand_missing");
    expect(result.reasons.some((r) => r.startsWith("off_topic:"))).toBe(true);
  });

  it("recovers fenced HTML into html-static WebProject", () => {
    const raw = `\`\`\`html
<!DOCTYPE html>
<html lang="en"><head><title>VEARO INDIA</title></head>
<body><h1>VEARO INDIA</h1><p>Bold contemporary men's jewelry for the modern wardrobe.</p></body>
</html>
\`\`\``;
    const plan = recoverWebProjectPlan(raw);
    expect(plan).not.toBeNull();
    expect(plan?.stack).toBe("html-static");
    expect(plan?.entry).toBe("index.html");
    expect(plan?.files[0]?.content).toMatch(/<!DOCTYPE html>/i);
    expect(plan?.title).toContain("VEARO");
  });

  it("rejects truncated HTML missing </html>", () => {
    const truncated = `<!DOCTYPE html>
<html lang="en"><head><title>VEARO</title><style>
.value-item { border: 1px solid rgba(64,`;
    expect(isCompleteWebsiteHtml(truncated)).toBe(false);
    expect(recoverWebProjectPlan(truncated)).toBeNull();
    expect(recoverWebsitePagePlan(truncated)).toBeNull();
  });

  it("accepts a minimal complete WebProject JSON", () => {
    const html = `<!DOCTYPE html>
<html lang="en"><head><title>VEARO INDIA</title></head>
<body><h1>VEARO INDIA</h1><p>Jewelry</p></body>
</html>`;
    const plan = recoverWebProjectPlan({
      title: "VEARO INDIA",
      summary: "Men's jewelry landing page",
      stack: "html-static",
      entry: "index.html",
      files: [{ path: "index.html", content: html }],
    });
    expect(plan?.title).toContain("VEARO");
    expect(plan?.files).toHaveLength(1);
  });

  it("expands react-vite content-fill into a full scaffold", () => {
    const plan = recoverWebProjectPlan(
      {
        title: "DiVastra",
        summary: "Ethnic fashion",
        stack: "react-vite",
        brandName: "DiVastra",
        tagline: "Ethnic Roots Modern Soul",
        heroBody: "Peach pink beige luxury ethnic wear.",
        sections: [
          { heading: "Craft", body: "Hand-finished textiles." },
          { heading: "Modern", body: "Contemporary silhouettes." },
        ],
        ctaLabel: "Shop the collection",
        colors: {
          primary: "#3d2c29",
          background: "#f6ebe3",
          text: "#2a1f1c",
          accent: "#d4896c",
        },
        html: "",
      },
      { preferredStack: "react-vite" }
    );
    expect(plan).not.toBeNull();
    expect(plan?.stack).toBe("react-vite");
    expect(plan?.entry).toBe("package.json");
    expect(plan?.files.some((f) => f.path === "src/App.tsx")).toBe(true);
    expect(plan?.files.some((f) => f.path === "package.json")).toBe(true);
    const app = plan?.files.find((f) => f.path === "src/App.tsx")?.content ?? "";
    expect(app).toContain("DiVastra");
  });

  it("accepts next stack scaffold without HTML entry", () => {
    const plan = recoverWebProjectPlan({
      title: "VEARO App",
      summary: "Next.js storefront",
      stack: "next",
      entry: "package.json",
      files: [
        {
          path: "package.json",
          content: '{"name":"vearo","private":true}',
        },
        {
          path: "app/page.tsx",
          content: 'export default function Page(){return <h1>VEARO</h1>}',
        },
      ],
    });
    expect(plan?.stack).toBe("next");
    expect(plan?.files).toHaveLength(2);
  });

  it("accepts react-vite scaffold even when index.html entry is incomplete shell", () => {
    const plan = recoverWebProjectPlan({
      title: "DiVastra",
      summary: "Fashion landing",
      stack: "react-vite",
      entry: "index.html",
      files: [
        {
          path: "package.json",
          content: '{"name":"divastra","private":true,"dependencies":{"react":"^18.0.0"}}',
        },
        {
          path: "index.html",
          content: "<!DOCTYPE html><html><head><title>DiVastra</title>",
        },
        {
          path: "src/App.tsx",
          content: "export default function App(){return <h1>DiVastra</h1>}",
        },
      ],
    });
    expect(plan).not.toBeNull();
    expect(plan?.stack).toBe("react-vite");
    expect(plan?.entry).toBe("package.json");
  });

  it("honors preferredStack react-vite when model omits stack", () => {
    const plan = recoverWebProjectPlan(
      {
        title: "Brand",
        summary: "SPA",
        entry: "package.json",
        files: [
          {
            path: "package.json",
            content: '{"name":"brand","private":true}',
          },
          {
            path: "src/main.tsx",
            content: "import App from './App'",
          },
        ],
      },
      { preferredStack: "react-vite" }
    );
    expect(plan?.stack).toBe("react-vite");
  });

  it("forces preferredStack react-vite over model html-static fill", () => {
    const plan = recoverWebProjectPlan(
      {
        title: "Timeless",
        summary: "Watches",
        stack: "html-static",
        brandName: "Timeless",
        tagline: "Time, remade",
        heroBody: "Designer watches",
        sections: [
          { heading: "Craft", body: "Precision" },
          { heading: "Design", body: "Bold" },
        ],
        ctaLabel: "Explore",
        colors: {
          primary: "silver",
          background: "black",
          text: "white",
          accent: "gold",
        },
        html: "",
      },
      {
        preferredStack: "react-vite",
        brandColors: ["chrome silver", "gold", "emerald green"],
      }
    );
    expect(plan?.stack).toBe("react-vite");
    expect(plan?.entry).toBe("package.json");
    expect(plan?.files.some((f) => f.path === "src/App.tsx")).toBe(true);
  });

  it("still rejects truncated html-static", () => {
    const plan = recoverWebProjectPlan({
      title: "X",
      summary: "Y",
      stack: "html-static",
      entry: "index.html",
      files: [
        {
          path: "index.html",
          content: "<!DOCTYPE html><html><head><title>X</title><style>.a{",
        },
      ],
    });
    expect(plan).toBeNull();
  });

  it("does not turn LaunchPlan creative routes into a website", () => {
    const launch = {
      title: "Stop-Scroll Strategy",
      summary: "Three routes to stop users in the first second",
      steps: [
        { title: "Hook", description: "Pattern interrupt" },
        { title: "Proof", description: "Social proof" },
        { title: "CTA", description: "Hard ask" },
      ],
    };
    expect(recoverWebProjectPlan(launch)).toBeNull();
  });

  it("accepts on-brief DiVastra HTML via legacy WebsitePage", () => {
    const brief =
      "DiVastra ethnic fashion landing page. Peach pink beige. Ethnic Roots Modern Soul.";
    const html = `<!DOCTYPE html><html><head><title>DiVastra</title></head><body><h1>DiVastra</h1><p>Ethnic Roots Modern Soul peach pink beige.</p></body></html>`;
    const result = validateWebsitePageRelevance({
      userBrief: brief,
      brandName: "DiVastra",
      data: {
        title: "DiVastra",
        summary: "Fashion",
        techStack: "HTML/CSS/JS",
        html,
      },
    });
    expect(result.ok).toBe(true);
  });
});
