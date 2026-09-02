/**
 * Fixed Web Tech scaffolds. The LLM only returns brand/copy/colors (WebProjectFill);
 * this module expands that into a complete WebProject (files + stack).
 */

import type { WebProjectFile, WebProjectPlan, WebStack } from "./website-generation";

export type WebProjectFillColors = {
  primary: string;
  background: string;
  text: string;
  accent: string;
};

export type WebProjectFillSection = {
  heading: string;
  body: string;
};

/** Compact structured fill the model emits (no full source trees). */
export type WebProjectFill = {
  title: string;
  summary: string;
  stack: WebStack;
  brandName: string;
  tagline: string;
  heroBody: string;
  sections: WebProjectFillSection[];
  ctaLabel: string;
  colors: WebProjectFillColors;
  /** Required for html-static (complete page). Empty string for other stacks. */
  html: string;
};

export const WEB_PROJECT_FILL_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "stack",
    "brandName",
    "tagline",
    "heroBody",
    "sections",
    "ctaLabel",
    "colors",
    "html",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    stack: {
      type: "string",
      enum: ["html-static", "react-vite", "next", "mern"],
    },
    brandName: { type: "string" },
    tagline: { type: "string" },
    heroBody: { type: "string" },
    sections: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    ctaLabel: { type: "string" },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["primary", "background", "text", "accent"],
      properties: {
        primary: { type: "string" },
        background: { type: "string" },
        text: { type: "string" },
        accent: { type: "string" },
      },
    },
    html: { type: "string" },
  },
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsString(s: string): string {
  return JSON.stringify(s ?? "");
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "site";
}

function normalizeHex(raw: string, fallback: string): string {
  const t = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t;
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return `#${t}`;
  // Named colours from brief (silver, gold, emerald, …)
  const named: Record<string, string> = {
    silver: "#C0C0C0",
    chrome: "#C8CDD2",
    "chrome silver": "#C8CDD2",
    gold: "#D4AF37",
    golden: "#D4AF37",
    emerald: "#046A38",
    "emerald green": "#046A38",
    green: "#0B6E4F",
    navy: "#0A1628",
    black: "#0B0B0F",
    white: "#F7F4F0",
    cream: "#F7F4EF",
    beige: "#E8DFD0",
    peach: "#F2C4A0",
    pink: "#E8A0BF",
    red: "#C41E3A",
    blue: "#1E3A8A",
    teal: "#0D9488",
    charcoal: "#2A2A2A",
  };
  const lower = t.toLowerCase();
  if (named[lower]) return named[lower]!;
  for (const [name, hex] of Object.entries(named)) {
    if (lower.includes(name)) return hex;
  }
  return fallback;
}

function normalizeFill(raw: WebProjectFill): WebProjectFill {
  const sections = (raw.sections ?? [])
    .filter((s) => s && (s.heading?.trim() || s.body?.trim()))
    .slice(0, 4)
    .map((s) => ({
      heading: (s.heading ?? "").trim() || "Section",
      body: (s.body ?? "").trim() || "…",
    }));
  while (sections.length < 2) {
    sections.push({
      heading: `Highlight ${sections.length + 1}`,
      body: raw.heroBody?.trim() || "Details from the brief.",
    });
  }
  return {
    title: raw.title.trim() || raw.brandName.trim() || "Website",
    summary: raw.summary.trim() || raw.tagline.trim() || raw.title.trim(),
    stack: raw.stack,
    brandName: raw.brandName.trim() || raw.title.trim() || "Brand",
    tagline: raw.tagline.trim() || raw.summary.trim() || "Welcome",
    heroBody: raw.heroBody.trim() || raw.summary.trim() || "Built from your brief.",
    sections,
    ctaLabel: raw.ctaLabel.trim() || "Get started",
    colors: {
      primary: normalizeHex(raw.colors?.primary ?? "", "#1a1a1a"),
      background: normalizeHex(raw.colors?.background ?? "", "#f7f4ef"),
      text: normalizeHex(raw.colors?.text ?? "", "#1a1a1a"),
      accent: normalizeHex(raw.colors?.accent ?? "", "#c45c26"),
    },
    html: typeof raw.html === "string" ? raw.html : "",
  };
}

function buildReactAppTsx(fill: WebProjectFill): string {
  const sectionsJs = fill.sections
    .map(
      (s) =>
        `    { heading: ${jsString(s.heading)}, body: ${jsString(s.body)} }`
    )
    .join(",\n");
  return `export default function App() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const sections = [
${sectionsJs}
  ];
  return (
    <div className="page">
      <header className="nav">
        <strong>{brand}</strong>
        <a className="cta" href="#cta">{cta}</a>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">{brand}</p>
          <h1>{tagline}</h1>
          <p className="lede">{heroBody}</p>
          <a className="cta" href="#cta">{cta}</a>
        </section>
        <section className="grid">
          {sections.map((s) => (
            <article key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </article>
          ))}
        </section>
        <section id="cta" className="cta-band">
          <h2>{cta}</h2>
          <p>Ready when you are — {brand}.</p>
        </section>
      </main>
      <footer>
        <span>© {new Date().getFullYear()} {brand}</span>
      </footer>
    </div>
  );
}
`;
}

function buildIndexCss(fill: WebProjectFill): string {
  const { primary, background, text, accent } = fill.colors;
  return `:root {
  --bg: ${background};
  --text: ${text};
  --primary: ${primary};
  --accent: ${accent};
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}
.page { min-height: 100vh; }
.nav, footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}
footer { border-bottom: 0; border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
.hero, .cta-band { padding: 4rem 1.5rem; max-width: 720px; }
.eyebrow { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem; opacity: 0.7; }
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 1.1; margin: 0.4rem 0 1rem; }
.lede { font-size: 1.15rem; line-height: 1.55; max-width: 36rem; }
.cta {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.7rem 1.2rem;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  border-radius: 2px;
}
.grid {
  display: grid;
  gap: 1.25rem;
  padding: 0 1.5rem 3rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.grid article {
  padding: 1.25rem;
  background: color-mix(in srgb, var(--primary) 6%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}
.grid h2 { margin: 0 0 0.5rem; font-size: 1.15rem; }
.cta-band { background: color-mix(in srgb, var(--accent) 10%, var(--bg)); }
`;
}

function buildHtmlStaticPage(fill: WebProjectFill): string {
  if (fill.html.trim() && /<\/html>/i.test(fill.html)) {
    return fill.html.trim();
  }
  const sections = fill.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></section>`
    )
    .join("\n");
  const { primary, background, text, accent } = fill.colors;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(fill.title)}</title>
<style>
:root{--bg:${background};--text:${text};--accent:${accent};--primary:${primary}}
body{margin:0;font-family:Georgia,serif;background:var(--bg);color:var(--text)}
header,main,footer{padding:1.25rem 1.5rem;max-width:720px;margin:0 auto}
h1{font-size:2.4rem;line-height:1.1}
.cta{display:inline-block;margin-top:1rem;padding:.7rem 1.1rem;background:var(--accent);color:#fff;text-decoration:none}
section{margin:1.5rem 0}
</style>
</head>
<body>
<header><strong>${esc(fill.brandName)}</strong></header>
<main>
<h1>${esc(fill.tagline)}</h1>
<p>${esc(fill.heroBody)}</p>
<a class="cta" href="#cta">${esc(fill.ctaLabel)}</a>
${sections}
<section id="cta"><h2>${esc(fill.ctaLabel)}</h2><p>${esc(fill.brandName)}</p></section>
</main>
<footer><span>© ${new Date().getFullYear()} ${esc(fill.brandName)}</span></footer>
</body>
</html>`;
}

function reactViteFiles(fill: WebProjectFill): WebProjectFile[] {
  const name = slugify(fill.brandName);
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^18.3.1",
            "react-dom": "^18.3.1",
          },
          devDependencies: {
            "@vitejs/plugin-react": "^4.3.4",
            typescript: "^5.6.3",
            vite: "^5.4.10",
          },
        },
        null,
        2
      ),
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(fill.title)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
          },
          include: ["src"],
        },
        null,
        2
      ),
    },
    {
      path: "src/main.tsx",
      content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    },
    { path: "src/App.tsx", content: buildReactAppTsx(fill) },
    { path: "src/index.css", content: buildIndexCss(fill) },
  ];
}

function nextFiles(fill: WebProjectFill): WebProjectFile[] {
  const name = slugify(fill.brandName);
  const page = `export default function Page() {
  const brand = ${jsString(fill.brandName)};
  const tagline = ${jsString(fill.tagline)};
  const heroBody = ${jsString(fill.heroBody)};
  const cta = ${jsString(fill.ctaLabel)};
  const sections = ${JSON.stringify(fill.sections, null, 2)};
  return (
    <main style={{ fontFamily: "Georgia, serif", background: ${jsString(fill.colors.background)}, color: ${jsString(fill.colors.text)}, minHeight: "100vh" }}>
      <header style={{ padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between" }}>
        <strong>{brand}</strong>
        <a href="#cta" style={{ background: ${jsString(fill.colors.accent)}, color: "#fff", padding: "0.6rem 1rem", textDecoration: "none" }}>{cta}</a>
      </header>
      <section style={{ padding: "4rem 1.5rem", maxWidth: 720 }}>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12, opacity: 0.7 }}>{brand}</p>
        <h1 style={{ fontSize: "clamp(2.2rem,5vw,3.2rem)", lineHeight: 1.1 }}>{tagline}</h1>
        <p style={{ fontSize: "1.15rem", lineHeight: 1.55 }}>{heroBody}</p>
        <a id="cta" href="#cta" style={{ display: "inline-block", marginTop: 20, background: ${jsString(fill.colors.accent)}, color: "#fff", padding: "0.7rem 1.1rem", textDecoration: "none" }}>{cta}</a>
      </section>
      <section style={{ display: "grid", gap: 16, padding: "0 1.5rem 3rem", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {sections.map((s) => (
          <article key={s.heading} style={{ padding: 20, border: "1px solid rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>{s.heading}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`;
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "^14.2.15",
            react: "^18.3.1",
            "react-dom": "^18.3.1",
          },
          devDependencies: {
            typescript: "^5.6.3",
            "@types/react": "^18.3.12",
            "@types/node": "^22.9.0",
          },
        },
        null,
        2
      ),
    },
    {
      path: "app/layout.tsx",
      content: `export const metadata = { title: ${jsString(fill.title)}, description: ${jsString(fill.summary)} };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
`,
    },
    { path: "app/page.tsx", content: page },
  ];
}

function mernFiles(fill: WebProjectFill): WebProjectFile[] {
  const name = slugify(fill.brandName);
  const clientApp = buildReactAppTsx(fill).replace(
    "export default function App()",
    "export default function App()"
  );
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name,
          private: true,
          scripts: {
            start: "node server/index.js",
            "client:dev": "cd client && npm run dev",
          },
        },
        null,
        2
      ),
    },
    {
      path: "server/index.js",
      content: `const http = require("http");
const port = process.env.PORT || 4001;
const brand = ${jsString(fill.brandName)};
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, brand, tagline: ${jsString(fill.tagline)} }));
  })
  .listen(port, () => console.log("API on", port));
`,
    },
    {
      path: "client/package.json",
      content: JSON.stringify(
        {
          name: `${name}-client`,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build" },
          dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
          devDependencies: {
            vite: "^5.4.10",
            "@vitejs/plugin-react": "^4.3.4",
          },
        },
        null,
        2
      ),
    },
    {
      path: "client/index.html",
      content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(fill.title)}</title></head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
`,
    },
    {
      path: "client/src/main.jsx",
      content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")).render(<App />);
`,
    },
    { path: "client/src/App.jsx", content: clientApp },
    { path: "client/src/index.css", content: buildIndexCss(fill) },
    {
      path: "README.md",
      content: `# ${fill.brandName}\n\nMERN scaffold generated from brief.\n\n- API: \`npm start\` (server)\n- Client: \`cd client && npm i && npm run dev\`\n`,
    },
  ];
}

/** Expand compact LLM fill into a complete downloadable WebProject. */
export function expandWebProjectFill(raw: WebProjectFill): WebProjectPlan {
  const fill = normalizeFill(raw);
  if (fill.stack === "html-static") {
    const html = buildHtmlStaticPage(fill);
    return {
      title: fill.title,
      summary: fill.summary,
      stack: "html-static",
      entry: "index.html",
      files: [{ path: "index.html", content: html }],
    };
  }
  if (fill.stack === "next") {
    return {
      title: fill.title,
      summary: fill.summary,
      stack: "next",
      entry: "package.json",
      files: nextFiles(fill),
    };
  }
  if (fill.stack === "mern") {
    return {
      title: fill.title,
      summary: fill.summary,
      stack: "mern",
      entry: "package.json",
      files: mernFiles(fill),
    };
  }
  return {
    title: fill.title,
    summary: fill.summary,
    stack: "react-vite",
    entry: "package.json",
    files: reactViteFiles(fill),
  };
}

export function looksLikeWebProjectFill(data: unknown): data is WebProjectFill {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.files) && rec.files.length > 0) return false;
  return (
    typeof rec.brandName === "string" &&
    typeof rec.tagline === "string" &&
    typeof rec.heroBody === "string" &&
    Array.isArray(rec.sections) &&
    typeof rec.ctaLabel === "string" &&
    rec.colors != null &&
    typeof rec.colors === "object"
  );
}

export function parseWebProjectFill(
  data: unknown,
  preferredStack?: WebStack
): WebProjectFill | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;

  // LaunchPlan / creative-routes payloads are { title, summary, steps }.
  // Never expand those into a fake WebProject — that strips steps and breaks
  // social/strategy and other text deliverables.
  if (Array.isArray(rec.steps) && rec.steps.length > 0) {
    const hasWebsiteSignals =
      typeof rec.brandName === "string" ||
      typeof rec.tagline === "string" ||
      typeof rec.heroBody === "string" ||
      typeof rec.html === "string" ||
      typeof rec.stack === "string" ||
      (Array.isArray(rec.files) && rec.files.length > 0);
    if (!hasWebsiteSignals) return null;
  }

  // Require at least one website-specific field. title+summary alone matches
  // LaunchPlan / DocumentPlan and must not become a React scaffold.
  const hasExplicitWebsiteField =
    typeof rec.brandName === "string" ||
    typeof rec.tagline === "string" ||
    typeof rec.heroBody === "string" ||
    typeof rec.ctaLabel === "string" ||
    typeof rec.html === "string" ||
    typeof rec.stack === "string" ||
    (rec.colors != null && typeof rec.colors === "object") ||
    (Array.isArray(rec.sections) && rec.sections.length > 0);
  if (!hasExplicitWebsiteField) return null;

  const brandName =
    (typeof rec.brandName === "string" && rec.brandName.trim()) ||
    (typeof rec.title === "string" && rec.title.trim()) ||
    "";
  const tagline =
    (typeof rec.tagline === "string" && rec.tagline.trim()) ||
    (typeof rec.summary === "string" && rec.summary.trim()) ||
    "";
  const heroBody =
    (typeof rec.heroBody === "string" && rec.heroBody.trim()) ||
    (typeof rec.summary === "string" && rec.summary.trim()) ||
    "";
  if (!brandName || !tagline) return null;

  const stackRaw = preferredStack
    ? preferredStack
    : (typeof rec.stack === "string" && rec.stack) || "react-vite";
  const stack = (
    ["html-static", "react-vite", "next", "mern"] as const
  ).includes(stackRaw as WebStack)
    ? (stackRaw as WebStack)
    : preferredStack || "react-vite";

  const colorsRec =
    rec.colors && typeof rec.colors === "object"
      ? (rec.colors as Record<string, unknown>)
      : {};
  const sectionsRaw = Array.isArray(rec.sections) ? rec.sections : [];
  const sections: WebProjectFillSection[] = sectionsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const s = item as Record<string, unknown>;
      const heading = typeof s.heading === "string" ? s.heading : "";
      const body = typeof s.body === "string" ? s.body : "";
      if (!heading && !body) return null;
      return { heading, body };
    })
    .filter((s): s is WebProjectFillSection => Boolean(s));

  return {
    title:
      (typeof rec.title === "string" && rec.title.trim()) || brandName,
    summary:
      (typeof rec.summary === "string" && rec.summary.trim()) || tagline,
    stack,
    brandName,
    tagline,
    heroBody,
    sections,
    ctaLabel:
      (typeof rec.ctaLabel === "string" && rec.ctaLabel.trim()) || "Get started",
    colors: {
      primary: String(colorsRec.primary ?? "#1a1a1a"),
      background: String(colorsRec.background ?? "#f7f4ef"),
      text: String(colorsRec.text ?? "#1a1a1a"),
      accent: String(colorsRec.accent ?? "#c45c26"),
    },
    html: typeof rec.html === "string" ? rec.html : "",
  };
}
