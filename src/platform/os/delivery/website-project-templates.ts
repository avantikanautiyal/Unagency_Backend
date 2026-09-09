/**
 * Fixed Web Tech scaffolds. The LLM only returns brand/copy/colors (WebProjectFill);
 * this module expands that into a complete WebProject (files + stack).
 */

import type { WebProjectFile, WebProjectPlan, WebStack } from "./website-generation";
import {
  buildLayoutCss,
  buildLayoutNextPage,
  buildLayoutReactApp,
  resolveWebLayout,
  type WebLayoutId,
} from "./website-scaffold-layouts";

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
  /**
   * Optional layout id for React/Next/MERN scaffolds.
   * When omitted, inferred from copy or route index.
   */
  layout?: WebLayoutId;
  /**
   * Server-stamped hero image (data URL). Not part of the LLM structured schema —
   * stamped after parse / before expand.
   */
  heroImageDataUrl?: string;
  /** Multi-route index (0–2) used to diversify scaffolds when layout is omitted. */
  layoutRouteIndex?: number;
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

/**
 * Public HTTPS stock imagery (same pattern Codex/Claude use in HTML demos).
 * Deterministic per seed so re-exports stay stable.
 */
export function stockImageUrl(
  seed: string,
  width = 1200,
  height = 800
): string {
  const safe =
    slugify(seed).replace(/[^a-z0-9-]/g, "").slice(0, 48) || "website";
  return `https://picsum.photos/seed/${encodeURIComponent(safe)}/${width}/${height}`;
}

function resolveHeroImageSrc(fill: WebProjectFill): string {
  if (fill.heroImageDataUrl?.trim()) return fill.heroImageDataUrl.trim();
  return stockImageUrl(`${fill.brandName}-${fill.tagline}`, 1400, 900);
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
  const layout = resolveWebLayout(raw, raw.layoutRouteIndex ?? 0);
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
    layout,
    ...(typeof raw.layoutRouteIndex === "number"
      ? { layoutRouteIndex: raw.layoutRouteIndex }
      : {}),
    ...(typeof raw.heroImageDataUrl === "string" && raw.heroImageDataUrl.trim()
      ? { heroImageDataUrl: raw.heroImageDataUrl.trim() }
      : {}),
  };
}

function buildReactAppTsx(fill: WebProjectFill): string {
  const layout = resolveWebLayout(fill, fill.layoutRouteIndex ?? 0);
  return buildLayoutReactApp(fill, layout);
}

function buildIndexCss(fill: WebProjectFill): string {
  const layout = resolveWebLayout(fill, fill.layoutRouteIndex ?? 0);
  return buildLayoutCss(fill, layout);
}

function buildHtmlStaticPage(fill: WebProjectFill): string {
  const heroSrc = resolveHeroImageSrc(fill);
  if (fill.html.trim() && /<\/html>/i.test(fill.html)) {
    let html = fill.html.trim();
    // If model HTML lacks motion, inject a minimal rise-in stylesheet once.
    if (!/@keyframes/i.test(html) && /<\/head>/i.test(html)) {
      html = html.replace(
        /<\/head>/i,
        `<style>
@keyframes rise-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.reveal{animation:rise-in .7s ease both}
a.cta,button.cta{transition:transform .25s ease,filter .25s ease}
a.cta:hover,button.cta:hover{transform:translateY(-2px);filter:brightness(1.05)}
img{max-width:100%;height:auto;border-radius:12px;display:block}
</style></head>`
      );
    }
    // Codex/Claude-style: if the model omitted imagery, stamp a public stock hero.
    if (!/<img\b/i.test(html) && /<\/h1>/i.test(html)) {
      html = html.replace(
        /<\/h1>/i,
        `</h1>\n<img class="hero-visual reveal" src="${esc(heroSrc)}" alt="${esc(fill.brandName)}" width="1400" height="900" loading="lazy"/>`
      );
    }
    return html;
  }
  const sectionCards = fill.sections
    .map((s, i) => {
      const img = stockImageUrl(`${fill.brandName}-${s.heading}-${i}`, 900, 560);
      return `<article class="card reveal" style="animation-delay:${0.12 + i * 0.08}s">
<img src="${esc(img)}" alt="${esc(s.heading)}" width="900" height="560" loading="lazy"/>
<h2>${esc(s.heading)}</h2>
<p>${esc(s.body)}</p>
</article>`;
    })
    .join("\n");
  const { primary, background, text, accent } = fill.colors;
  const proofImg = stockImageUrl(`${fill.brandName}-proof`, 1200, 700);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="description" content="${esc(fill.summary)}"/>
<title>${esc(fill.title)}</title>
<style>
:root{--bg:${background};--text:${text};--accent:${accent};--primary:${primary};--display:Georgia,"Iowan Old Style",serif;--body:"Avenir Next","Segoe UI",sans-serif}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:var(--body);color:var(--text);background:
radial-gradient(1100px 520px at 8% -10%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 55%),
radial-gradient(900px 480px at 100% 0%,color-mix(in srgb,var(--primary) 16%,transparent),transparent 50%),
var(--bg)}
@keyframes rise-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes ken{from{transform:scale(1.04)}to{transform:scale(1)}}
.reveal{animation:rise-in .75s cubic-bezier(.22,1,.36,1) both}
.nav{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 6vw;position:sticky;top:0;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid color-mix(in srgb,var(--text) 10%,transparent);z-index:5}
.nav strong{font-family:var(--display);font-size:1.15rem}
.hero{display:grid;gap:2rem;padding:4.5rem 6vw 2.5rem;max-width:1180px;margin:0 auto;align-items:center}
@media(min-width:900px){.hero{grid-template-columns:1.05fr .95fr}}
.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:.72rem;opacity:.7}
h1{font-family:var(--display);font-size:clamp(2.4rem,5.5vw,3.8rem);line-height:1.05;margin:.45rem 0 1rem;max-width:14ch}
.lede{font-size:1.15rem;line-height:1.65;max-width:38rem;opacity:.94}
.cta{display:inline-block;margin-top:1.2rem;padding:.8rem 1.25rem;background:var(--accent);color:#fff;text-decoration:none;transition:transform .25s ease,filter .25s ease,box-shadow .25s ease}
.cta:hover{transform:translateY(-2px);filter:brightness(1.05);box-shadow:0 14px 36px color-mix(in srgb,var(--accent) 35%,transparent)}
.hero-frame{border-radius:18px;overflow:hidden;min-height:280px;box-shadow:0 28px 70px color-mix(in srgb,var(--text) 18%,transparent)}
.hero-frame img{width:100%;height:100%;object-fit:cover;min-height:320px;animation:ken 12s ease-out both}
.grid{display:grid;gap:1.25rem;padding:1rem 6vw 3rem;max-width:1180px;margin:0 auto;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{padding:0 0 1.2rem;border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--primary) 6%,var(--bg));border:1px solid color-mix(in srgb,var(--text) 9%,transparent);transition:transform .3s ease}
.card:hover{transform:translateY(-4px)}
.card img{width:100%;height:170px;object-fit:cover}
.card h2,.card p{padding:0 1.1rem}
.card h2{font-family:var(--display);font-size:1.2rem;margin:1rem 0 .4rem}
.proof{display:grid;gap:1.5rem;padding:1rem 6vw 3rem;max-width:1180px;margin:0 auto;align-items:center}
@media(min-width:860px){.proof{grid-template-columns:1.1fr .9fr}}
.proof img{width:100%;border-radius:14px;object-fit:cover;max-height:380px}
.proof blockquote{font-family:var(--display);font-size:clamp(1.35rem,3vw,1.9rem);line-height:1.35;margin:0}
#cta{margin:0 6vw 3rem;padding:2.8rem 1.75rem;border-radius:18px;text-align:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 16%,var(--bg)),color-mix(in srgb,var(--primary) 10%,var(--bg)))}
footer{padding:1.5rem 6vw;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent);opacity:.8}
</style>
</head>
<body>
<header class="nav"><strong>${esc(fill.brandName)}</strong><a class="cta" href="#cta">${esc(fill.ctaLabel)}</a></header>
<main>
<section class="hero">
<div class="reveal">
<p class="eyebrow">${esc(fill.brandName)}</p>
<h1>${esc(fill.tagline)}</h1>
<p class="lede">${esc(fill.heroBody)}</p>
<a class="cta" href="#cta">${esc(fill.ctaLabel)}</a>
</div>
<div class="hero-frame reveal"><img src="${esc(heroSrc)}" alt="${esc(fill.brandName)}" width="1400" height="900" loading="eager"/></div>
</section>
<section class="grid">${sectionCards}</section>
<section class="proof reveal">
<img src="${esc(proofImg)}" alt="" width="1200" height="700" loading="lazy"/>
<blockquote>“${esc(fill.summary)}”</blockquote>
</section>
<section id="cta" class="reveal"><h2>${esc(fill.ctaLabel)}</h2><p>${esc(fill.brandName)} — built around your brief.</p><a class="cta" href="#cta">${esc(fill.ctaLabel)}</a></section>
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
  const layout = resolveWebLayout(fill, fill.layoutRouteIndex ?? 0);
  const page = buildLayoutNextPage(fill, layout);
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

  const explicitStack =
    typeof rec.stack === "string" &&
    (["html-static", "react-vite", "next", "mern"] as const).includes(
      rec.stack.trim().toLowerCase() as WebStack
    )
      ? (rec.stack.trim().toLowerCase() as WebStack)
      : undefined;
  const stackRaw = explicitStack ?? preferredStack ?? "html-static";
  const stack = (
    ["html-static", "react-vite", "next", "mern"] as const
  ).includes(stackRaw as WebStack)
    ? (stackRaw as WebStack)
    : explicitStack ?? preferredStack ?? "html-static";

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
    ...(typeof rec.layout === "string" && rec.layout.trim()
      ? { layout: rec.layout.trim() as WebLayoutId }
      : {}),
    ...(typeof rec.heroImageDataUrl === "string" && rec.heroImageDataUrl.trim()
      ? { heroImageDataUrl: rec.heroImageDataUrl.trim() }
      : {}),
  };
}

/**
 * Best-effort inject a hero image + motion hooks into an already-expanded project.
 * Never fails the export — returns the original project on any issue.
 */
export function stampHeroImageOntoWebProject(
  project: WebProjectPlan,
  heroImageDataUrl: string
): WebProjectPlan {
  const url = heroImageDataUrl.trim();
  if (!url) return project;
  const safeUrl = url.replace(/"/g, "&quot;");

  const files = project.files.map((f) => {
    const path = f.path.replace(/\\/g, "/");
    let content = f.content;

    if (/(^|\/)index\.css$/i.test(path)) {
      if (!/@keyframes\s+rise-in/i.test(content)) {
        content += `
@keyframes rise-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.reveal{animation:rise-in .7s cubic-bezier(.22,1,.36,1) both}
.hero-visual,.hero-media img{width:100%;max-height:420px;object-fit:cover;border-radius:12px;display:block}
.cta{transition:transform .25s ease,filter .25s ease}
.cta:hover{transform:translateY(-2px);filter:brightness(1.05)}
`;
      }
      return { ...f, content };
    }

    if (/(^|\/)index\.html$/i.test(path)) {
      if (!/@keyframes/i.test(content) && /<\/head>/i.test(content)) {
        content = content.replace(
          /<\/head>/i,
          `<style>
@keyframes rise-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.reveal{animation:rise-in .7s ease both}
.hero-visual{width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin:1.5rem 0;display:block}
a.cta{transition:transform .25s ease,filter .25s ease}
a.cta:hover{transform:translateY(-2px);filter:brightness(1.05)}
</style></head>`
        );
      }
      if (!/<img\b[^>]*hero-visual/i.test(content) && /<\/h1>/i.test(content)) {
        content = content.replace(
          /<\/h1>/i,
          `</h1>\n<img class="hero-visual reveal" src="${safeUrl}" alt=""/>`
        );
      }
      return { ...f, content };
    }

    if (/(^|\/)App\.(tsx|jsx)$/i.test(path)) {
      if (
        !/<img\b/i.test(content) &&
        /className="hero"/i.test(content) &&
        !/hero-media/i.test(content)
      ) {
        content = content.replace(
          /<\/section>/,
          `<div className="hero-media reveal"><img src="${safeUrl}" alt="" /></div></section>`
        );
      }
      return { ...f, content };
    }

    return f;
  });

  return { ...project, files };
}
