/**
 * Website imagery: every image the design references becomes a real image.
 *
 * The model lists the images its design needs (WebProject.images[]) and
 * references each as `image:<id>` (src or CSS url()). It also sometimes writes
 * its own `<img src="assets/logo.png">` — files that never exist, which showed
 * as broken images. This pass:
 *   - logo slots (`image:logo`, or a broken <img> whose alt/src says logo) →
 *     the brand's vault logo (or a clean wordmark when there is none);
 *   - every other referenced image → generated to match its prompt (parallel),
 *     falling back to a keyword-matched stock photo URL — never a broken src.
 */

import type { WebProjectPlan } from "./website-generation";
import {
  generateBestEffortVisualImage,
  type BestEffortVisualImageDeps,
  type VisualImageBytes,
} from "./best-effort-visual-image";

export type WebsiteImageSpec = { id: string; alt: string; prompt: string };

export type WebsiteImageResolutionReport = {
  referenced: number;
  generated: number;
  external: number;
  logoSlots: number;
};

/** Generated images embed as data URLs; past this many, use stock photos. */
const MAX_GENERATED_IMAGES = 6;

const STOP_WORDS = new Set(
  "with from that this into over under their your about image photo photograph picture shot showing style website section hero card background close detail soft light warm brand the and for are".split(
    " ",
  ),
);

export function parseWebsiteImageSpecs(data: unknown): WebsiteImageSpec[] {
  const rec =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const raw = Array.isArray(rec?.images) ? rec!.images : [];
  const out: WebsiteImageSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id || id.toLowerCase() === "logo") continue;
    out.push({
      id,
      alt: typeof r.alt === "string" ? r.alt.trim() : "",
      prompt: typeof r.prompt === "string" ? r.prompt.trim() : "",
    });
  }
  return out;
}

/** Keyword-matched stock photo — the fallback when generation is unavailable. */
export function stockPhotoUrlForPrompt(prompt: string, seed: string): string {
  const words = (prompt.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
    (w) => !STOP_WORDS.has(w),
  );
  const keywords = [...new Set(words)].slice(0, 3);
  const tags = encodeURIComponent((keywords.length ? keywords : ["fashion"]).join(","));
  let lock = 0;
  for (const ch of seed) lock = (lock * 31 + ch.charCodeAt(0)) % 100000;
  return `https://loremflickr.com/1600/1000/${tags}?lock=${lock}`;
}

function wordmarkDataUrl(brandName: string): string {
  const name = brandName.replace(/[<>&"]/g, "").trim() || "Brand";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(120, name.length * 14)}" height="40"><text x="0" y="28" font-family="Georgia, serif" font-size="24" fill="currentColor">${name}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const isResolvableSrc = (src: string): boolean =>
  /^(https?:|data:|\/\/|image:)/i.test(src.trim());

/**
 * Rewrite broken local <img> srcs to image tokens so one pass resolves them.
 * Returns the rewritten content plus specs inferred from their alt text.
 */
function tokenizeBrokenImages(
  content: string,
  inferred: Map<string, WebsiteImageSpec>,
): string {
  return content.replace(
    /<img\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi,
    (whole, pre: string, q: string, src: string, post: string) => {
      if (isResolvableSrc(src)) return whole;
      const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(`${pre} ${post}`)?.[2] ?? "";
      if (/logo/i.test(alt) || /logo/i.test(src)) {
        return `<img${pre}src=${q}image:logo${q}${post}>`;
      }
      const id = `auto_${inferred.size + 1}`;
      inferred.set(id, { id, alt, prompt: alt || src.replace(/[-_./]+/g, " ") });
      return `<img${pre}src=${q}image:${id}${q}${post}>`;
    },
  );
}

export async function resolveWebsiteProjectImages(input: {
  project: WebProjectPlan;
  specs: readonly WebsiteImageSpec[];
  brief?: string;
  brandName?: string;
  brandColors?: readonly string[];
  logoDataUrl?: string;
  deps?: BestEffortVisualImageDeps;
  /** Test seam. */
  generate?: (prompt: string) => Promise<VisualImageBytes | undefined>;
  /** Already-resolved images (e.g. the same site's static preview) — no regeneration. */
  reuseUrls?: ReadonlyMap<string, string>;
}): Promise<{
  project: WebProjectPlan;
  report: WebsiteImageResolutionReport;
  urls: ReadonlyMap<string, string>;
}> {
  const inferred = new Map<string, WebsiteImageSpec>();
  const textFile = (path: string) => /\.(html?|css|jsx?|tsx?|vue|svelte)$/i.test(path);
  const files = input.project.files.map((f) =>
    textFile(f.path) && /\.html?$/i.test(f.path)
      ? { ...f, content: tokenizeBrokenImages(f.content, inferred) }
      : f,
  );

  const specById = new Map<string, WebsiteImageSpec>();
  for (const s of input.specs) specById.set(s.id, s);
  for (const [id, s] of inferred) if (!specById.has(id)) specById.set(id, s);

  const referenced = new Set<string>();
  for (const f of files) {
    if (!textFile(f.path)) continue;
    for (const m of f.content.matchAll(/image:([A-Za-z0-9_-]+)/g)) {
      referenced.add(m[1]!);
    }
  }
  const logoUrl =
    input.logoDataUrl?.trim() || wordmarkDataUrl(input.brandName ?? "");
  const imageIds = [...referenced].filter((id) => id.toLowerCase() !== "logo");

  const generate =
    input.generate ??
    ((prompt: string) =>
      generateBestEffortVisualImage({
        prompt,
        brandColors: input.brandColors,
        deps: input.deps,
      }));
  const canGenerate = Boolean(input.generate || (input.deps?.imageRouter && input.deps?.registry));
  const mood = (input.brief ?? "").slice(0, 300);

  const urls = new Map<string, string>(input.reuseUrls ?? []);
  let generated = 0;
  let external = 0;
  await Promise.all(
    imageIds.map(async (id, index) => {
      if (urls.has(id)) return;
      const spec = specById.get(id);
      const subject = spec?.prompt || spec?.alt || id.replace(/[-_]+/g, " ");
      if (canGenerate && index < MAX_GENERATED_IMAGES) {
        try {
          const img = await generate(
            [
              `Website image for ${input.brandName || "the brand"}: ${subject}`,
              mood ? `Brief: ${mood}` : "",
              "Photographic, editorial quality, no text or watermarks in the image.",
            ]
              .filter(Boolean)
              .join(". "),
          );
          if (img?.base64) {
            urls.set(id, `data:${img.mimeType || "image/png"};base64,${img.base64}`);
            generated += 1;
            return;
          }
        } catch {
          // fall through to stock
        }
      }
      urls.set(id, stockPhotoUrlForPrompt(subject, `${id}:${subject}`));
      external += 1;
    }),
  );

  let logoSlots = 0;
  const out = files.map((f) => {
    if (!textFile(f.path)) return f;
    const content = f.content.replace(/image:([A-Za-z0-9_-]+)/g, (tok, id: string) => {
      if (id.toLowerCase() === "logo") {
        logoSlots += 1;
        return logoUrl;
      }
      return urls.get(id) ?? tok;
    });
    return content === f.content ? f : { ...f, content };
  });

  return {
    project: { ...input.project, files: out },
    report: { referenced: imageIds.length, generated, external, logoSlots },
    urls,
  };
}
