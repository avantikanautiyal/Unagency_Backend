/**
 * Web Tech — WebProject deliverable (files + stack).
 * Legacy WebsitePage {html} is recovered into html-static projects.
 */

import {
  extractAnchorTokens,
  extractBrandNameFromMegaprompt,
  extractUserBriefFromMegaprompt,
} from "./presentation-generation";
import {
  expandWebProjectFill,
  parseWebProjectFill,
} from "./website-project-templates";
import { extractBriefColors } from "../../../services/brand-color-extraction";

export type WebsiteRelevanceResult = {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly anchorHits: number;
  readonly anchorTotal: number;
};

export const WEB_STACKS = [
  "html-static",
  "react-vite",
  "next",
  "mern",
] as const;

export type WebStack = (typeof WEB_STACKS)[number];

export type WebProjectFile = {
  path: string;
  content: string;
};

/** Canonical Web Tech deliverable. */
export type WebProjectPlan = {
  title: string;
  summary: string;
  stack: WebStack;
  entry: string;
  files: WebProjectFile[];
};

/**
 * @deprecated Prefer WebProjectPlan. Kept so materializer / UI can still read .html.
 */
export type WebsitePagePlan = {
  title: string;
  summary: string;
  techStack: string;
  html: string;
};

export const WEB_PROJECT_STRUCTURED_SCHEMA = {
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
    stack: { type: "string", enum: [...WEB_STACKS] },
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
    /** Complete HTML5 page when stack=html-static; otherwise "". */
    html: { type: "string" },
  },
} as const;

const WEB_PROJECT_FILL_ROUTE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
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
    description: { type: "string" },
    summary: { type: "string" },
    stack: { type: "string", enum: [...WEB_STACKS] },
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

/**
 * Three distinct landing-page directions (content-fill each).
 * Server expands every route into a full WebProject scaffold.
 */
export const WEBSITE_ROUTES_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["routes"],
  properties: {
    routes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: WEB_PROJECT_FILL_ROUTE_ITEM_SCHEMA,
    },
  },
} as const;

/** @deprecated Alias — same as WEB_PROJECT_STRUCTURED_SCHEMA (content-fill). */
export { WEB_PROJECT_FILL_STRUCTURED_SCHEMA } from "./website-project-templates";
export {
  expandWebProjectFill,
  parseWebProjectFill,
  looksLikeWebProjectFill,
} from "./website-project-templates";
export type {
  WebProjectFill,
  WebProjectFillColors,
  WebProjectFillSection,
} from "./website-project-templates";

export function defaultWebStackForSubtype(subtype?: string): WebStack {
  const s = (subtype ?? "").trim().toLowerCase().replace(/_/g, "-");
  // App product scaffolds need a real framework tree.
  if (s === "app-development" || s === "app-developments") return "next";
  // Marketing / commerce / corporate / UI → design-first HTML (Claude/Codex quality).
  // Explicit React/Next/MERN in the brief still wins via explicitWebStackFromPrompt.
  if (
    s === "landing-page" ||
    s === "landing-pages" ||
    s === "ui-design" ||
    s === "ui-designs" ||
    s === "interactive-prototypes" ||
    s === "interactive-prototype" ||
    s === "ecom-website" ||
    s === "ecom-websites" ||
    s === "corporate-website" ||
    s === "corporate-websites"
  ) {
    return "html-static";
  }
  return "html-static";
}

export function explicitWebStackFromPrompt(prompt?: string): WebStack | null {
  if (!prompt?.trim()) return null;
  const hay = prompt.toLowerCase();
  if (/\b(mern|mongodb|express\.?js|node\s*\+?\s*react)\b/.test(hay)) {
    return "mern";
  }
  if (/\bnext\.?js\b|\bnext\s+app\b/.test(hay)) return "next";
  if (
    /\bvite\b|\breact\s+spa\b|\breact\s+app\b|\breact\s*\+?\s*vite\b/.test(hay)
  ) {
    return "react-vite";
  }
  if (
    /\b(html[\s/-]*css|static\s*html|static\s*site|plain\s*html)\b/.test(hay)
  ) {
    return "html-static";
  }
  if (/\boutput\s*:\s*html\b/.test(hay) || /\bhtml\s+file\b/.test(hay)) {
    return "html-static";
  }
  return null;
}

export function inferWebStackFromBrief(
  brief: string,
  fallback: WebStack = "html-static"
): WebStack {
  return explicitWebStackFromPrompt(brief) ?? fallback;
}

export function resolveWebStack(input: {
  subtype?: string;
  prompt?: string;
  preferredStack?: string;
}): WebStack {
  const preferred = (input.preferredStack ?? "").trim().toLowerCase();
  if ((WEB_STACKS as readonly string[]).includes(preferred)) {
    return preferred as WebStack;
  }
  const fallback = defaultWebStackForSubtype(input.subtype);
  return inferWebStackFromBrief(input.prompt ?? "", fallback);
}

/** Extract explicit brand name from structured website briefs. */
export function extractWebsiteBrandName(prompt: string): string | undefined {
  const fromMeta = extractBrandNameFromMegaprompt(prompt);
  if (fromMeta) return fromMeta;

  const patterns = [
    /\*\*Brand Name:\*\*\s*([^\n*]+)/i,
    /Brand Name:\s*\*?\*?([^*\n]+)\*?\*?/i,
    /for\s+\*\*([A-Za-z][A-Za-z0-9 &'’.-]{1,48})\*\*/i,
    /landing page for\s+\*\*([A-Za-z][A-Za-z0-9 &'’.-]{1,48})\*\*/i,
    /\*\*([A-Z][A-Za-z]{2,24})\*\*,?\s+a\s+/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const name = match?.[1]?.trim().replace(/\*\*/g, "");
    if (name && name.length >= 2) return name;
  }
  return undefined;
}

/** Metadata-declared stack only — never infer from brief (preserves provider stack). */
export function explicitPreferredStackFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): WebStack | undefined {
  const raw =
    typeof metadata?.preferredWebStack === "string"
      ? metadata.preferredWebStack
      : typeof metadata?.webStack === "string"
        ? metadata.webStack
        : typeof metadata?.preferredStack === "string"
          ? metadata.preferredStack
          : undefined;
  return raw ? normalizeStack(raw) ?? undefined : undefined;
}

export function websiteContextFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  priorPrompt: string
): {
  userBrief: string;
  brandName?: string;
  exampleDeliverable?: string;
  stack: WebStack;
  subtype?: string;
  brandColors: string[];
} {
  const metaBrief =
    typeof metadata?.websiteUserBrief === "string"
      ? metadata.websiteUserBrief.trim()
      : "";
  const userBrief =
    metaBrief ||
    extractUserBriefFromMegaprompt(priorPrompt) ||
    priorPrompt.trim();
  const brandName =
    extractWebsiteBrandName(userBrief) ||
    extractWebsiteBrandName(priorPrompt) ||
    (typeof metadata?.brandName === "string" && metadata.brandName.trim()) ||
    undefined;
  const exampleDeliverable =
    typeof metadata?.exampleDeliverable === "string"
      ? metadata.exampleDeliverable
      : undefined;
  const subtype =
    typeof metadata?.subtype === "string" ? metadata.subtype : undefined;
  const preferredStack =
    typeof metadata?.preferredWebStack === "string"
      ? metadata.preferredWebStack
      : typeof metadata?.webStack === "string"
        ? metadata.webStack
        : typeof metadata?.preferredStack === "string"
          ? metadata.preferredStack
          : undefined;
  const stack = resolveWebStack({
    subtype,
    prompt: userBrief,
    preferredStack,
  });
  const brandColors = resolveWebsiteBrandColors(metadata, userBrief);
  return { userBrief, brandName, exampleDeliverable, stack, subtype, brandColors };
}

/** Colours named in the brief / metadata for Web Tech prompts + fill defaults. */
export function resolveWebsiteBrandColors(
  metadata: Readonly<Record<string, unknown>> | undefined,
  brief: string
): string[] {
  const fromMeta: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) fromMeta.push(v.trim());
    if (Array.isArray(v)) {
      for (const c of v) {
        if (typeof c === "string" && c.trim()) fromMeta.push(c.trim());
      }
    }
  };
  push(metadata?.brandColors);
  push(metadata?.learnedBrandColors);
  push(metadata?.briefExtractedColors);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...fromMeta, ...extractBriefColors(brief)]) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 8);
}

/** Strip markdown fences / chatter so we can store openable HTML. */
export function normalizeWebsiteHtml(raw: string): string {
  let html = raw.trim();
  if (!html) return html;

  const fenced = html.match(/```(?:html|HTML|json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) {
    html = fenced[1].trim();
  }

  const docIdx = html.search(/<!DOCTYPE\s+html|<html[\s>]/i);
  if (docIdx > 0) {
    html = html.slice(docIdx).trim();
  }

  return html;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleFromHtml(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) return stripHtmlTags(titleMatch[1]);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]?.trim()) return stripHtmlTags(h1Match[1]);
  return undefined;
}

function extractSummaryFromHtml(html: string): string | undefined {
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  if (metaMatch?.[1]?.trim()) return stripHtmlTags(metaMatch[1]);

  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch?.[1]?.trim()) {
    const cleaned = stripHtmlTags(pMatch[1]);
    if (cleaned.length >= 18) return cleaned;
  }
  return undefined;
}

/** True only when the document has a closable structure browsers can render. */
export function isCompleteWebsiteHtml(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;
  if (!/<\/html>/i.test(trimmed)) return false;
  if (!/<\/body>/i.test(trimmed)) return false;
  if (/[:,]\s*$/.test(trimmed)) return false;
  if (/<(?!\/)([a-zA-Z][\w:-]*)\b[^>]*$/.test(trimmed)) return false;
  return true;
}

/**
 * Heuristic for Claude/Codex-level HTML: imagery, motion, multi-section structure, length.
 * Used to trigger one design retry before accepting thin pages or falling back to scaffolds.
 */
export function isStrongHtmlStaticDesign(html: string): boolean {
  if (!isCompleteWebsiteHtml(html)) return false;
  const trimmed = html.trim();
  const imgCount = (trimmed.match(/<img\b/gi) ?? []).length;
  const hasCss = /<style[\s>]|\.css/i.test(trimmed);
  const hasMotion = /@keyframes|animation\s*:|transition\s*:/i.test(trimmed);
  const structureHits = (
    trimmed.match(/<section\b|<article\b|<h2\b|<nav\b/gi) ?? []
  ).length;
  return (
    trimmed.length >= 2800 &&
    imgCount >= 1 &&
    hasCss &&
    hasMotion &&
    structureHits >= 3
  );
}

/** Inspect recovered WebsiteRoutes / WebProject fill for weak html-static design. */
export function websiteOutputNeedsDesignRetry(
  data: unknown,
  stack: WebStack
): boolean {
  if (stack !== "html-static") return false;
  const routes: unknown[] = [];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>;
    if (Array.isArray(rec.routes)) routes.push(...rec.routes);
    else routes.push(data);
  } else if (typeof data === "string") {
    try {
      return websiteOutputNeedsDesignRetry(JSON.parse(data), stack);
    } catch {
      return !isStrongHtmlStaticDesign(data);
    }
  }
  if (routes.length === 0) return true;
  let weak = 0;
  for (const route of routes.slice(0, 3)) {
    if (!route || typeof route !== "object") {
      weak += 1;
      continue;
    }
    const html =
      typeof (route as Record<string, unknown>).html === "string"
        ? String((route as Record<string, unknown>).html)
        : "";
    if (!html.trim() || !isStrongHtmlStaticDesign(html)) weak += 1;
  }
  return weak === Math.min(routes.length, 3);
}

function normalizeStack(raw: unknown): WebStack | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if ((WEB_STACKS as readonly string[]).includes(s)) return s as WebStack;
  if (/html|static|css|landing/.test(s)) return "html-static";
  if (/next/.test(s)) return "next";
  if (/mern|mongo|express/.test(s)) return "mern";
  if (/react|vite/.test(s)) return "react-vite";
  return null;
}

function normalizePath(p: string): string {
  return p.trim().replace(/^\.\//, "").replace(/^\/+/, "");
}

export function entryFileContent(project: WebProjectPlan): string | undefined {
  const entry = normalizePath(project.entry);
  const hit = project.files.find((f) => normalizePath(f.path) === entry);
  return hit?.content;
}

export function isHtmlStaticPreviewable(project: WebProjectPlan): boolean {
  // Only html-static is validated/served as a complete document.
  // React/Vite/Next scaffolds may include index.html shells — those are not
  // marketing pages and must not be held to </html> completeness rules.
  return project.stack === "html-static";
}

/** User-facing error when a WebProject could not be recovered. */
export function websiteIncompleteErrorMessage(stack?: WebStack | string): string {
  const s = (stack ?? "").trim().toLowerCase();
  if (s === "react-vite" || s === "next" || s === "mern") {
    return `Website generation finished without a complete ${s} WebProject (invalid or truncated project JSON).`;
  }
  if (s === "html-static") {
    return "Website generation finished without complete HTML (missing </html>).";
  }
  return "Website generation finished without a complete WebProject (invalid or truncated output).";
}

function inferStackFromFiles(files: readonly WebProjectFile[]): WebStack | null {
  const paths = files.map((f) => f.path.toLowerCase());
  const pkg = files.find((f) => /(^|\/)package\.json$/i.test(f.path));
  const pkgText = (pkg?.content ?? "").toLowerCase();
  if (
    paths.some((p) => p.startsWith("app/") && /\.(tsx?|jsx?)$/.test(p)) ||
    /"next"\s*:/.test(pkgText)
  ) {
    return "next";
  }
  if (
    paths.some((p) => p.startsWith("server/") || p.startsWith("client/")) ||
    /mongoose|express/.test(pkgText)
  ) {
    return "mern";
  }
  if (
    pkg ||
    paths.some((p) => /(^|\/)vite\.config\./.test(p)) ||
    paths.some((p) => p.startsWith("src/") && /\.(tsx?|jsx?)$/.test(p)) ||
    /"react"\s*:|"vite"\s*:/.test(pkgText)
  ) {
    return "react-vite";
  }
  if (files.length > 0 && files.every((f) => /\.html?$/i.test(f.path))) {
    return "html-static";
  }
  return null;
}

export function webProjectToLegacyPage(project: WebProjectPlan): WebsitePagePlan {
  const html =
    entryFileContent(project) ??
    project.files.find((f) => /\.html?$/i.test(f.path))?.content ??
    "";
  return {
    title: project.title,
    summary: project.summary,
    techStack: project.stack,
    html,
  };
}

function planFromHtml(
  htmlRaw: string,
  rec?: Record<string, unknown>
): WebsitePagePlan | null {
  const html = normalizeWebsiteHtml(htmlRaw);
  if (!html) return null;
  if (!/<html[\s>]/i.test(html) && !/<!DOCTYPE\s+html/i.test(html)) return null;
  if (!isCompleteWebsiteHtml(html)) return null;

  const titleFromJson =
    rec && typeof rec.title === "string" ? rec.title.trim() : "";
  const summaryFromJson =
    rec && typeof rec.summary === "string" ? rec.summary.trim() : "";
  const techStackFromJson =
    rec && typeof rec.techStack === "string" ? rec.techStack.trim() : "";

  const title = titleFromJson || extractTitleFromHtml(html) || "Website";
  const summary = summaryFromJson || extractSummaryFromHtml(html) || title;

  return {
    title,
    summary: summary || title,
    techStack: techStackFromJson || "html-static",
    html,
  };
}

function validateWebProjectShape(project: WebProjectPlan): boolean {
  if (!project.title.trim() || project.files.length === 0) return false;
  const entry = normalizePath(project.entry);
  if (!entry) return false;
  const hasEntry = project.files.some((f) => normalizePath(f.path) === entry);
  if (!hasEntry) return false;

  // Completeness gate is HTML-only. Component stacks succeed when files+entry exist.
  if (project.stack === "html-static") {
    const html = entryFileContent(project) ?? "";
    if (/\.html?$/i.test(entry) && !isCompleteWebsiteHtml(html)) return false;
  }
  return true;
}

/** Prefer package.json entry for component scaffolds when present. */
function normalizeProjectEntry(project: WebProjectPlan): WebProjectPlan {
  if (project.stack === "html-static") return project;
  const pkg = project.files.find((f) => /(^|\/)package\.json$/i.test(f.path));
  if (!pkg) return project;
  const entry = normalizePath(project.entry);
  if (entry === normalizePath(pkg.path)) return project;
  // Models often set entry=index.html for Vite; package.json is the contract entry.
  if (/\.html?$/i.test(entry) || !project.files.some((f) => normalizePath(f.path) === entry)) {
    return { ...project, entry: normalizePath(pkg.path) };
  }
  return project;
}

function parseFilesArray(raw: unknown): WebProjectFile[] {
  if (!Array.isArray(raw)) return [];
  const out: WebProjectFile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const path = typeof rec.path === "string" ? normalizePath(rec.path) : "";
    const content = typeof rec.content === "string" ? rec.content : "";
    if (!path || !content.trim()) continue;
    out.push({ path, content });
  }
  return out;
}

/** True when the provider stopped because the output token budget was hit. */
export function isProviderOutputTruncated(
  output: Readonly<Record<string, unknown>> | undefined
): boolean {
  if (!output) return false;
  const reason = String(
    output.finishReason ?? output.finish_reason ?? output.stop_reason ?? ""
  )
    .trim()
    .toLowerCase();
  return (
    reason === "length" ||
    reason === "max_tokens" ||
    reason === "max_token" ||
    reason === "maxtokens"
  );
}

export type RecoverWebProjectOptions = {
  readonly preferredStack?: WebStack | string;
  readonly brandColors?: readonly string[];
  /** Diversify React/Next/MERN scaffolds across WebsiteRoutes (0–2). */
  readonly layoutRouteIndex?: number;
};

/** One expanded website direction (content-fill → scaffold). */
export type WebsiteRoutePlan = WebProjectPlan & {
  description?: string;
};

/**
 * Recover 3 website directions from WebsiteRoutes JSON, or wrap a single WebProject.
 */
export function recoverWebsiteRoutesPlan(
  data: unknown,
  options?: RecoverWebProjectOptions
): WebsiteRoutePlan[] | null {
  if (data == null) return null;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("{")) {
      try {
        return recoverWebsiteRoutesPlan(JSON.parse(trimmed) as unknown, options);
      } catch {
        const single = recoverWebProjectPlan(trimmed, options);
        return single ? [{ ...single }] : null;
      }
    }
    const single = recoverWebProjectPlan(trimmed, options);
    return single ? [{ ...single }] : null;
  }
  if (typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;

  if (Array.isArray(rec.routes) && rec.routes.length > 0) {
    const out: WebsiteRoutePlan[] = [];
    let routeIndex = 0;
    for (const item of rec.routes.slice(0, 3)) {
      if (!item || typeof item !== "object") continue;
      const routeRec = item as Record<string, unknown>;
      const project = recoverWebProjectPlan(routeRec, {
        ...options,
        layoutRouteIndex: options?.layoutRouteIndex ?? routeIndex,
      });
      routeIndex += 1;
      if (!project) continue;
      const description =
        (typeof routeRec.description === "string" &&
          routeRec.description.trim()) ||
        project.summary;
      out.push({
        ...project,
        title:
          (typeof routeRec.title === "string" && routeRec.title.trim()) ||
          project.title,
        ...(description ? { description } : {}),
      });
    }
    return out.length > 0 ? out : null;
  }

  const single = recoverWebProjectPlan(data, options);
  return single ? [{ ...single }] : null;
}

/**
 * Accept WebProject JSON, WebsiteRoutes, legacy WebsitePage, or raw/fenced HTML.
 */
export function recoverWebProjectPlan(
  data: unknown,
  options?: RecoverWebProjectOptions
): WebProjectPlan | null {
  if (data == null) return null;
  const preferred =
    normalizeStack(options?.preferredStack) ?? undefined;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const fromJson = recoverWebProjectPlan(parsed, options);
        if (fromJson) return fromJson;
      } catch {
        // Fall through — may still be HTML.
      }
    }
    const legacy = planFromHtml(trimmed);
    if (!legacy) return null;
    // Prefer expanding into the chosen component stack when user picked React/Next/MERN.
    if (preferred && preferred !== "html-static") {
      const fill = parseWebProjectFill(
        {
          title: legacy.title,
          summary: legacy.summary,
          brandName: legacy.title,
          tagline: legacy.summary,
          heroBody: legacy.summary,
          sections: [
            { heading: "About", body: legacy.summary },
            { heading: "Details", body: legacy.summary },
          ],
          ctaLabel: "Explore",
          colors: colorsFromBrandHints(options?.brandColors),
          stack: preferred,
          html: "",
        },
        preferred
      );
      if (fill) {
        const project = expandWebProjectFill({
          ...fill,
          stack: preferred,
          ...(typeof options?.layoutRouteIndex === "number"
            ? { layoutRouteIndex: options.layoutRouteIndex }
            : {}),
        });
        return validateWebProjectShape(project) ? project : null;
      }
    }
    return {
      title: legacy.title,
      summary: legacy.summary,
      stack: "html-static",
      entry: "index.html",
      files: [{ path: "index.html", content: legacy.html }],
    };
  }

  if (typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;

  // WebsiteRoutes payload — recover the first complete route as the primary project
  // (multi-route materializer uses recoverWebsiteRoutesPlan).
  if (
    Array.isArray(rec.routes) &&
    rec.routes.length > 0 &&
    !Array.isArray(rec.files) &&
    typeof rec.html !== "string"
  ) {
    const routes = recoverWebsiteRoutesPlan(rec, options);
    return routes?.[0] ?? null;
  }

  // Creative-route LaunchPlan must never become a website scaffold.
  if (
    Array.isArray(rec.steps) &&
    rec.steps.length > 0 &&
    !Array.isArray(rec.files) &&
    typeof rec.html !== "string" &&
    typeof rec.stack !== "string" &&
    typeof rec.brandName !== "string" &&
    typeof rec.tagline !== "string"
  ) {
    return null;
  }

  const files = parseFilesArray(rec.files);
  if (files.length > 0) {
    const inferred = inferStackFromFiles(files);
    let stack =
      normalizeStack(rec.stack) ||
      normalizeStack(rec.techStack) ||
      inferred ||
      preferred ||
      "html-static";
    // Honor metadata preferred stack only when the model did not declare one.
    if (preferred && !normalizeStack(rec.stack) && !normalizeStack(rec.techStack)) {
      stack = preferred;
    }
    const entry =
      typeof rec.entry === "string" && rec.entry.trim()
        ? normalizePath(rec.entry)
        : files.find((f) => /(^|\/)package\.json$/i.test(f.path))?.path ||
          files[0]!.path;
    const title =
      (typeof rec.title === "string" && rec.title.trim()) ||
      extractTitleFromHtml(files[0]!.content) ||
      "Website";
    const summary =
      (typeof rec.summary === "string" && rec.summary.trim()) ||
      extractSummaryFromHtml(files[0]!.content) ||
      title;
    const project = normalizeProjectEntry({
      title,
      summary,
      stack,
      entry,
      files,
    });
    return validateWebProjectShape(project) ? project : null;
  }

  // Compact content-fill → server-owned templates (avoids truncated multi-file JSON).
  const fill = parseWebProjectFill(rec, preferred);
  if (fill) {
    const withColors =
      options?.brandColors?.length &&
      looksLikeDefaultFillColors(fill.colors)
        ? {
            ...fill,
            colors: {
              ...fill.colors,
              ...colorsFromBrandHints(options.brandColors),
            },
          }
        : fill;
    const explicitStack = normalizeStack(rec.stack);
    const stamped =
      preferred &&
      preferred !== withColors.stack &&
      !explicitStack
        ? { ...withColors, stack: preferred }
        : withColors;
    const project = expandWebProjectFill({
      ...stamped,
      ...(typeof options?.layoutRouteIndex === "number"
        ? { layoutRouteIndex: options.layoutRouteIndex }
        : {}),
    });
    return validateWebProjectShape(project) ? project : null;
  }

  // Legacy WebsitePage { html } without fill fields
  if (typeof rec.html === "string" && rec.html.trim()) {
    const legacy = planFromHtml(rec.html, rec);
    if (!legacy) return null;
    const explicitStack = normalizeStack(rec.stack);
    if (preferred && preferred !== "html-static" && explicitStack !== "html-static") {
      const fillFromHtml = parseWebProjectFill(
        {
          title: legacy.title,
          summary: legacy.summary,
          brandName: legacy.title,
          tagline: legacy.summary,
          heroBody: legacy.summary,
          sections: [
            { heading: "About", body: legacy.summary },
            { heading: "Details", body: legacy.summary },
          ],
          ctaLabel: "Explore",
          colors: colorsFromBrandHints(options?.brandColors),
          stack: preferred,
          html: "",
        },
        preferred
      );
      if (fillFromHtml) {
        const project = expandWebProjectFill({
          ...fillFromHtml,
          stack: preferred,
          ...(typeof options?.layoutRouteIndex === "number"
            ? { layoutRouteIndex: options.layoutRouteIndex }
            : {}),
        });
        return validateWebProjectShape(project) ? project : null;
      }
    }
    return {
      title: legacy.title,
      summary: legacy.summary,
      stack: preferred || normalizeStack(rec.techStack) || "html-static",
      entry: "index.html",
      files: [{ path: "index.html", content: legacy.html }],
    };
  }

  if (typeof rec.content === "string") {
    return recoverWebProjectPlan(rec.content, options);
  }
  if (typeof rec.text === "string") {
    return recoverWebProjectPlan(rec.text, options);
  }
  return null;
}

function looksLikeDefaultFillColors(colors: {
  primary: string;
  background: string;
  text: string;
  accent: string;
}): boolean {
  const defaults = new Set([
    "#1a1a1a",
    "#f7f4ef",
    "#c45c26",
    "#1A1A1A",
    "#F7F4EF",
    "#C45C26",
  ]);
  return (
    defaults.has(colors.primary) ||
    defaults.has(colors.accent) ||
    defaults.has(colors.background)
  );
}

/** Map brief colour names / hex into WebProject fill colour slots. */
export function colorsFromBrandHints(
  hints?: readonly string[] | null
): {
  primary: string;
  background: string;
  text: string;
  accent: string;
} {
  const mapped = (hints ?? [])
    .map((h) => namedColorToHex(h))
    .filter((h): h is string => Boolean(h));
  const primary = mapped[0] ?? "#1a1a1a";
  const accent = mapped[1] ?? mapped[0] ?? "#c45c26";
  const background = mapped[2] ?? "#0b0d10";
  const text =
    luminanceHint(background) < 0.45 ? "#f4f6f8" : "#1a1a1a";
  return { primary, background, text, accent };
}

function luminanceHint(hex: string): number {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  if (full.length !== 6) return 0.5;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function namedColorToHex(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t;
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return `#${t}`;
  const map: Record<string, string> = {
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
  if (map[t]) return map[t]!;
  for (const [name, hex] of Object.entries(map)) {
    if (t.includes(name)) return hex;
  }
  return null;
}

/** @deprecated Prefer recoverWebProjectPlan — returns legacy shape for old callers. */
export function recoverWebsitePagePlan(data: unknown): WebsitePagePlan | null {
  const project = recoverWebProjectPlan(data);
  if (!project) return null;
  const legacy = webProjectToLegacyPage(project);
  if (!legacy.html.trim() && project.stack === "html-static") return null;
  // Non-HTML stacks: still expose a legacy page with empty html if needed —
  // callers that require html should use recoverWebProjectPlan.
  if (project.stack === "html-static" && !isCompleteWebsiteHtml(legacy.html)) {
    return null;
  }
  return {
    ...legacy,
    techStack: project.stack,
    html:
      legacy.html ||
      `<!-- ${project.stack} project: ${project.files.length} files; entry ${project.entry} -->`,
  };
}

export function buildWebProjectInstructionBlock(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly exampleDeliverable?: string;
  readonly stack: WebStack;
  readonly isRetry?: boolean;
  /** Full-quality rewrite when prior HTML was incomplete or too basic. */
  readonly isDesignRetry?: boolean;
  readonly brandColors?: readonly string[];
  /** When true, emit WebsiteRoutes with exactly 3 directions. */
  readonly multiRoute?: boolean;
}): string {
  const brand = input.brandName?.trim();
  const stack = input.stack;
  const colorHints = (input.brandColors ?? []).filter(Boolean);
  const lines = [
    "[Role — world-class product designer + front-end engineer (Claude/Codex calibre)]",
    brand
      ? `Create a production-quality website for ${brand} only (stack=${stack}).`
      : `Create a production-quality website for the client in the brief (stack=${stack}).`,
    input.multiRoute
      ? "Respond with ONLY valid JSON matching schema WebsiteRoutes (3 content-fill routes)."
      : "Respond with ONLY valid JSON matching schema WebProject (content-fill).",
    "Do NOT emit source files, package.json, or a files[] array — the server builds the codebase from your content.",
    `stack MUST be "${stack}" on every route.`,
  ];

  if (input.multiRoute) {
    lines.push(
      "Return exactly 3 routes in routes[]. Each route is a DIFFERENT creative direction on the SAME brief and brand.",
      "Route 1: bold hero-led impact. Route 2: editorial/minimal magazine. Route 3: product-forward storytelling.",
      "Each route keys: title, description, summary, stack, brandName, tagline, heroBody, sections[2-4]{heading,body}, ctaLabel, colors{primary,background,text,accent}, html.",
      "titles/descriptions must be distinct angles — not duplicates.",
      stack !== "html-static"
        ? "Vary copy tone to match those layout angles (server maps routes to distinct React/Next layouts)."
        : "Each route.html must be a FULL distinct landing page design — not three near-identical templates."
    );
  } else {
    lines.push(
      "Required keys: title, summary, stack, brandName, tagline, heroBody, sections[2-4]{heading,body}, ctaLabel, colors{primary,background,text,accent}, html."
    );
  }

  if (colorHints.length) {
    const hexHints = colorHints
      .map((c) => {
        const hex = namedColorToHex(c);
        return hex ? `${c} (${hex})` : c;
      })
      .join(", ");
    lines.push(
      `REQUIRED brand colours from the brief: ${hexHints}.`,
      "Map them into colors.primary / colors.accent / colors.background / colors.text as hex. Do NOT invent unrelated palettes (no default terracotta/cream)."
    );
  } else {
    lines.push(
      "colors: hex strings from the brief (or tasteful defaults). Real copy only — no lorem ipsum."
    );
  }

  lines.push(
    "Write vivid on-brief copy. Prefer complete, expressive strings over truncated stubs."
  );

  if (stack === "html-static") {
    lines.push(
      "html = COMPLETE HTML5 page (<!DOCTYPE html> … </html>) with embedded CSS — this IS the deliverable preview.",
      "Design bar: equal to a strong Claude/ChatGPT landing page — NOT a thin single-column stub.",
      "Required structure: sticky/top nav with brand + CTA, full-bleed or split hero with headline + lede + primary CTA, at least 3 content sections (features / proof / story), secondary CTA band, footer.",
      "Visual system: distinctive typography pairing, atmospheric gradients from the brand palette, generous spacing, responsive layout (mobile + desktop), intentional CSS @keyframes / transitions (2–4 motions).",
      "REQUIRED imagery: multiple real HTTPS <img> tags (hero + section images) using https://picsum.photos/seed/<topic>/… or https://images.unsplash.com/... — never leave image slots as text descriptions.",
      "Avoid generic AI-template looks (purple gradients, cream+terracotta defaults, pill spam, card grids with no hierarchy).",
      "Also fill brandName/tagline/sections/colors (used only if html is incomplete)."
    );
  } else {
    lines.push(
      'html MUST be an empty string "".',
      "Put all marketing copy in brandName, tagline, heroBody, sections, ctaLabel — the server generates a multi-layout React/Next/MERN scaffold with motion, brand colours, and stock photo URLs.",
      "Write section copy that supports a rich landing experience (benefit-led headings, concrete proof, clear CTA)."
    );
  }

  lines.push(
    "No markdown fences. Truncated JSON is a failure.",
    input.exampleDeliverable
      ? `Deliverable: ${input.exampleDeliverable}`
      : "Deliverable: project preview + downloadable source."
  );
  if (input.isDesignRetry) {
    lines.push(
      `[DESIGN RETRY] Previous ${input.multiRoute ? "WebsiteRoutes" : "page"} was incomplete or too basic.`,
      `Emit COMPLETE ${input.multiRoute ? "WebsiteRoutes" : "WebProject"} JSON with stack="${stack}".`,
      stack === "html-static"
        ? "Each html field must be a finished, visually rich landing page (nav, hero+image, ≥3 sections, motion, CTAs). Do NOT shrink design quality."
        : "Strengthen copy and creative angles; keep html empty.",
      "No markdown fences."
    );
  } else if (input.isRetry) {
    lines.push(
      `RETRY: Previous output was truncated. Emit SMALLER complete ${input.multiRoute ? "WebsiteRoutes" : "content-fill"} JSON with stack="${stack}".`,
      "Shorten every string. sections: exactly 2. No files[].",
      stack === "html-static"
        ? "html may be shorter but MUST still be a complete </html> document with at least one <img> and basic motion CSS."
        : "html empty."
    );
  }
  return lines.join("\n");
}

/** @deprecated Use buildWebProjectInstructionBlock */
export function buildWebsitePageInstructionBlock(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly exampleDeliverable?: string;
  readonly isRetry?: boolean;
  readonly stack?: WebStack;
}): string {
  return buildWebProjectInstructionBlock({
    ...input,
    stack: input.stack ?? "html-static",
  });
}

export function buildWebsiteNonNegotiablesBlock(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly brandColors?: readonly string[];
}): string {
  const lines = ["[Non-negotiables]"];
  if (input.brandName?.trim()) {
    lines.push(
      `Brand: ${input.brandName.trim()} — must appear in title and primary UI (exact spelling).`,
      "Forbidden: unrelated brands (Craigslist, Amazon, Nike, etc.) unless named in the brief."
    );
  }
  if (input.brandColors?.length) {
    lines.push(
      `Brand colours (required): ${input.brandColors.join(", ")} — use as hex in colors{}.`
    );
  }
  lines.push(
    "Obey the client brief above. Real copy from the brief — no lorem ipsum."
  );
  return lines.join("\n");
}

export function orderWebsiteProviderPrompt(input: {
  readonly body: string;
  readonly brandName?: string;
  readonly exampleDeliverable?: string;
  readonly userBrief: string;
  readonly stack?: WebStack;
  readonly brandColors?: readonly string[];
  readonly multiRoute?: boolean;
}): string {
  const role = buildWebProjectInstructionBlock({
    userBrief: input.userBrief,
    brandName: input.brandName,
    exampleDeliverable: input.exampleDeliverable,
    stack: input.stack ?? "html-static",
    brandColors: input.brandColors,
    multiRoute: input.multiRoute,
  });
  const nonNegotiables = buildWebsiteNonNegotiablesBlock({
    userBrief: input.userBrief,
    brandName: input.brandName,
    brandColors: input.brandColors,
  });
  return [role, input.body, nonNegotiables].filter(Boolean).join("\n\n");
}

function websiteBlob(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const rec = data as Record<string, unknown>;
  const title = typeof rec.title === "string" ? rec.title : "";
  const summary = typeof rec.summary === "string" ? rec.summary : "";
  const description =
    typeof rec.description === "string" ? rec.description : "";
  const html = typeof rec.html === "string" ? rec.html : "";
  const brandName = typeof rec.brandName === "string" ? rec.brandName : "";
  const tagline = typeof rec.tagline === "string" ? rec.tagline : "";
  const heroBody = typeof rec.heroBody === "string" ? rec.heroBody : "";
  const ctaLabel = typeof rec.ctaLabel === "string" ? rec.ctaLabel : "";
  const sections = Array.isArray(rec.sections)
    ? rec.sections
        .map((s) => {
          if (!s || typeof s !== "object") return "";
          const row = s as Record<string, unknown>;
          return `${row.heading ?? ""} ${row.body ?? ""}`;
        })
        .join(" ")
    : "";
  const files = parseFilesArray(rec.files)
    .map((f) => `${f.path}\n${f.content}`)
    .join("\n");
  return `${title}\n${summary}\n${description}\n${brandName}\n${tagline}\n${heroBody}\n${ctaLabel}\n${sections}\n${html}\n${files}`.toLowerCase();
}

/** Preserve content-fill fields when normalizing WebsiteRoutes for storage. */
export function serializeWebsiteRouteForStorage(
  route: WebsiteRoutePlan,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: route.title,
    summary: route.summary,
    stack: route.stack,
    entry: route.entry,
    files: route.files,
  };
  if (route.description?.trim()) {
    base.description = route.description;
  }
  const rec = route as Record<string, unknown>;
  for (const key of [
    "brandName",
    "tagline",
    "heroBody",
    "ctaLabel",
    "sections",
    "colors",
    "html",
  ] as const) {
    const value = rec[key];
    if (value != null) base[key] = value;
  }
  return base;
}

const OFF_TOPIC_SITE_MARKERS = [
  "craigslist",
  "amazon",
  "shopify",
  "wikipedia",
  "facebook marketplace",
] as const;

const OFF_TOPIC_SITE_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly marker: string;
}> = [
  { pattern: /\bcr\*{2,}/i, marker: "craigslist_masked" },
  { pattern: /\bcr\*+\s*(luxury|fashion|market)/i, marker: "craigslist_masked" },
  { pattern: /\bwelcome to cr/i, marker: "craigslist_masked" },
];

function detectOffTopicSiteMarkers(blob: string, briefHay: string): string[] {
  const reasons: string[] = [];
  for (const marker of OFF_TOPIC_SITE_MARKERS) {
    if (blob.includes(marker) && !briefHay.includes(marker)) {
      reasons.push(`off_topic:${marker}`);
    }
  }
  for (const entry of OFF_TOPIC_SITE_PATTERNS) {
    if (entry.pattern.test(blob) && !briefHay.includes("craigslist")) {
      reasons.push(`off_topic:${entry.marker}`);
    }
  }
  return reasons;
}

function extractPaletteTokens(brief: string): string[] {
  return extractBriefColors(brief).map((c) => c.toLowerCase());
}

export function validateWebsitePageRelevance(input: {
  readonly data: unknown;
  readonly userBrief: string;
  readonly brandName?: string;
}): WebsiteRelevanceResult {
  const project = recoverWebProjectPlan(input.data);
  let blobSource: unknown = project ?? input.data;
  if (
    project &&
    input.data &&
    typeof input.data === "object" &&
    typeof (input.data as { description?: unknown }).description === "string"
  ) {
    const description = (input.data as { description: string }).description.trim();
    if (description) {
      blobSource = { ...project, description };
    }
  }
  const blob = websiteBlob(blobSource);
  if (!blob.trim()) {
    return {
      ok: false,
      reasons: ["empty_website"],
      anchorHits: 0,
      anchorTotal: 0,
    };
  }

  const briefHay = input.userBrief.toLowerCase();
  const hardReasons: string[] = [];
  const softReasons: string[] = [];

  const brand = input.brandName?.trim();
  if (brand && brand.length >= 2) {
    const brandHay = brand.toLowerCase();
    if (!blob.includes(brandHay)) {
      hardReasons.push("brand_missing");
    }
  }

  hardReasons.push(...detectOffTopicSiteMarkers(blob, briefHay));

  const anchors = extractAnchorTokens(input.userBrief);
  let anchorHits = 0;
  for (const token of anchors) {
    if (blob.includes(token.toLowerCase())) anchorHits += 1;
  }
  const anchorTotal = anchors.length;
  if (anchorTotal >= 3 && anchorHits === 0) {
    softReasons.push("anchors_missing");
  }

  const palette = extractPaletteTokens(input.userBrief);
  if (palette.length >= 2) {
    const paletteHits = palette.filter((c) => blob.includes(c)).length;
    if (paletteHits === 0) softReasons.push("palette_missing");
  }

  const htmlLen =
    project && isHtmlStaticPreviewable(project)
      ? (entryFileContent(project) ?? "").length
      : typeof (input.data as { html?: string })?.html === "string"
        ? (input.data as { html: string }).html.length
        : project
          ? project.files.reduce((n, f) => n + f.content.length, 0)
          : 0;

  if (
    softReasons.length &&
    hardReasons.length === 0 &&
    brand &&
    blob.includes(brand.toLowerCase()) &&
    htmlLen >= 800
  ) {
    return {
      ok: true,
      reasons: softReasons,
      anchorHits,
      anchorTotal,
    };
  }

  const ok = hardReasons.length === 0;
  return {
    ok,
    reasons: [...hardReasons, ...softReasons],
    anchorHits,
    anchorTotal,
  };
}

export function buildWebsiteRelevanceRetrySuffix(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly reasons: readonly string[];
}): string {
  const brand = input.brandName?.trim();
  return [
    "Your previous WebProject JSON was rejected because it was not grounded in the client brief.",
    brand ? `Brand "${brand}" must appear in title and primary UI.` : "",
    `Issues: ${input.reasons.join(", ")}`,
    "Respond with a COMPLETE WebProject (stack + entry + files). For html-static, index.html must end with </body></html>.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Zip project files so clients can download a codebase folder. */
export async function buildWebProjectZip(
  project: WebProjectPlan
): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folderName =
    project.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "website-project";
  const root = zip.folder(folderName) ?? zip;
  for (const file of project.files) {
    const path = file.path.replace(/^\/+/, "").trim();
    if (!path || path.includes("..")) continue;
    root.file(path, file.content ?? "");
  }
  root.file(
    "unagency-project.json",
    JSON.stringify(
      {
        title: project.title,
        summary: project.summary,
        stack: project.stack,
        entry: project.entry,
        files: project.files.map((f) => f.path),
      },
      null,
      2
    )
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
