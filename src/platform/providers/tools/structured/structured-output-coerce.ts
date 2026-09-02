/**
 * Coerce provider JSON into the expected structured schema shape.
 *
 * Anthropic (and some other providers) do not enforce OpenAI-style
 * `response_format.json_schema`, so models often invent near-miss keys
 * (e.g. overview/brand/deliverable instead of title/summary). Remap those
 * before strict validation so creative flows do not fail closed.
 */

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const s = asNonEmptyString(value);
    if (s) return s;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function schemaProps(
  schema: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const props = schema.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as Record<string, Record<string, unknown>>;
}

function schemaRequired(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((k): k is string => typeof k === "string")
    : [];
}

function coerceLaunchPlanLike(
  obj: Record<string, unknown>,
  schema: Record<string, unknown>
): Record<string, unknown> {
  const stepsSchema = schemaProps(schema).steps ?? {};
  const minItems =
    typeof stepsSchema.minItems === "number" ? stepsSchema.minItems : 3;
  const maxItems =
    typeof stepsSchema.maxItems === "number" ? stepsSchema.maxItems : 3;

  const title =
    firstString(
      obj.title,
      obj.deliverable,
      obj.name,
      obj.headline,
      obj.planTitle
    ) ||
    [firstString(obj.brand), firstString(obj.deliverable)]
      .filter(Boolean)
      .join(" — ") ||
    "Creative plan";

  const summary =
    firstString(
      obj.summary,
      obj.overview,
      obj.description,
      obj.brief,
      obj.pitch
    ) || title;

  const rawSteps = Array.isArray(obj.steps)
    ? obj.steps
    : Array.isArray(obj.routes)
      ? obj.routes
      : Array.isArray(obj.directions)
        ? obj.directions
        : Array.isArray(obj.concepts)
          ? obj.concepts
          : [];

  const steps = rawSteps.slice(0, maxItems).map((step, index) => {
    const row = asObject(step) ?? {};
    const stepTitle =
      firstString(row.title, row.name, row.label, row.route) ||
      `Route ${index + 1}`;
    const description =
      firstString(
        row.description,
        row.rationale,
        row.summary,
        row.overview,
        row.direction,
        row.details,
        row.body,
        row.prompt
      ) || stepTitle;
    return { title: stepTitle, description };
  });

  while (steps.length < minItems) {
    const index = steps.length;
    steps.push({
      title: `Route ${index + 1}`,
      description: summary,
    });
  }

  return {
    title,
    summary,
    steps: steps.slice(0, maxItems),
  };
}

function coerceDocumentPlanLike(
  obj: Record<string, unknown>,
  schema: Record<string, unknown>
): Record<string, unknown> {
  const sectionsSchema = schemaProps(schema).sections ?? {};
  const minItems =
    typeof sectionsSchema.minItems === "number" ? sectionsSchema.minItems : 3;
  const maxItems =
    typeof sectionsSchema.maxItems === "number" ? sectionsSchema.maxItems : 20;

  const title =
    firstString(obj.title, obj.deliverable, obj.name, obj.headline) ||
    "Document";
  const summary =
    firstString(obj.summary, obj.overview, obj.description, obj.brief) ||
    title;

  const rawSections = Array.isArray(obj.sections)
    ? obj.sections
    : Array.isArray(obj.steps)
      ? obj.steps
      : Array.isArray(obj.chapters)
        ? obj.chapters
        : [];

  const sections = rawSections.slice(0, maxItems).map((section, index) => {
    const row = asObject(section) ?? {};
    const heading =
      firstString(row.heading, row.title, row.name, row.label) ||
      `Section ${index + 1}`;
    const body =
      firstString(
        row.body,
        row.description,
        row.content,
        row.rationale,
        row.summary,
        row.text
      ) || heading;
    return { heading, body };
  });

  while (sections.length < minItems) {
    const index = sections.length;
    sections.push({
      heading: `Section ${index + 1}`,
      body: summary,
    });
  }

  return {
    title,
    summary,
    sections: sections.slice(0, maxItems),
  };
}

/**
 * Remap near-miss provider JSON toward the declared schema when possible.
 * Returns the original value when no known coercion applies.
 */
export function coerceValueTowardJsonSchema(
  value: unknown,
  schema: Record<string, unknown>,
  schemaName?: string
): unknown {
  const obj = asObject(value);
  if (!obj) return value;

  const required = schemaRequired(schema);
  const props = schemaProps(schema);
  const name = (schemaName ?? "").toLowerCase();

  const looksLikeLaunchPlan =
    name === "launchplan" ||
    (required.includes("title") &&
      required.includes("summary") &&
      required.includes("steps") &&
      Boolean(props.steps));

  if (looksLikeLaunchPlan) {
    return coerceLaunchPlanLike(obj, schema);
  }

  const looksLikeDocumentPlan =
    name === "documentplan" ||
    (required.includes("title") &&
      required.includes("summary") &&
      required.includes("sections") &&
      Boolean(props.sections));

  if (looksLikeDocumentPlan) {
    return coerceDocumentPlanLike(obj, schema);
  }

  const looksLikeWebsitePage =
    name === "websitepage" ||
    name === "webproject" ||
    (required.includes("title") &&
      required.includes("html") &&
      required.includes("techStack") &&
      Boolean(props.html)) ||
    (required.includes("files") &&
      required.includes("stack") &&
      required.includes("entry"));

  if (looksLikeWebsitePage) {
    return coerceWebsitePageLike(obj, schema);
  }

  const looksLikePresentationRoutes =
    name === "presentationroutes" ||
    (required.includes("routes") && Boolean(props.routes));

  if (looksLikePresentationRoutes) {
    return coercePresentationRoutesLike(obj);
  }

  return value;
}

const PRESENTATION_LAYOUTS = new Set([
  "title_hero",
  "section_divider",
  "content_bullets",
  "key_message",
  "closing",
]);

function coercePresentationSlide(item: unknown): Record<string, unknown> | null {
  const slide = asObject(item);
  if (!slide) return null;
  const slideTitle = firstString(slide.title, slide.heading) ?? "Slide";
  let bullets = Array.isArray(slide.bullets)
    ? slide.bullets.filter(
        (b): b is string => typeof b === "string" && b.trim().length > 0
      )
    : [];
  if (bullets.length === 0) {
    const body = firstString(slide.body, slide.content, slide.text);
    if (body) bullets = [body];
  }
  if (bullets.length === 1) {
    bullets = [bullets[0]!, bullets[0]!];
  }
  if (bullets.length === 0) return null;
  const layoutRaw = firstString(slide.layout) ?? "content_bullets";
  return {
    title: slideTitle,
    bullets,
    notes: firstString(slide.notes, slide.speakerNotes) ?? "",
    layout: PRESENTATION_LAYOUTS.has(layoutRaw) ? layoutRaw : "content_bullets",
    visualCue:
      firstString(slide.visualCue, slide.visual, slide.imageHint) ??
      "Brand palette wash",
  };
}

function coercePresentationRoutesLike(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const routesRaw = Array.isArray(obj.routes) ? obj.routes : [];
  const routes: Record<string, unknown>[] = [];
  for (const item of routesRaw) {
    const rec = asObject(item);
    if (!rec) continue;
    const title = firstString(rec.title, rec.name, rec.deckTitle) ?? "Route";
    const description =
      firstString(rec.description, rec.summary, rec.subtitle) ?? title;
    const deckTitle =
      firstString(rec.deckTitle, rec.title, rec.name) ?? title;
    const deckSubtitle = firstString(rec.deckSubtitle, rec.subtitle) ?? "";

    let slidesRaw: unknown = rec.slides;
    if (!Array.isArray(slidesRaw)) {
      const deck = asObject(rec.deck);
      if (deck) slidesRaw = deck.slides;
    }

    const slides: Record<string, unknown>[] = [];
    if (Array.isArray(slidesRaw)) {
      for (const slideItem of slidesRaw) {
        const slide = coercePresentationSlide(slideItem);
        if (slide) slides.push(slide);
      }
    }
    if (slides.length === 0) continue;

    routes.push({
      title,
      description,
      deckTitle,
      deckSubtitle,
      slides,
    });
  }

  return { routes };
}

function coerceWebsitePageLike(
  obj: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const key of ["title", "summary", "techStack", "stack", "entry"] as const) {
    if (!(key in out) && key !== "techStack" && key !== "stack" && key !== "entry") {
      continue;
    }
    if (typeof out[key] !== "string") {
      if (out[key] != null) {
        out[key] = typeof out[key] === "number" ? String(out[key]) : "";
      }
    } else {
      out[key] = String(out[key]).trim();
    }
  }

  // Legacy html field
  if (typeof out.html === "string") {
    let html = out.html;
    const fenced = html.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
    if (fenced?.[1]?.trim()) html = fenced[1].trim();
    const docIdx = html.search(/<!DOCTYPE\s+html|<html[\s>]/i);
    if (docIdx > 0) html = html.slice(docIdx).trim();
    out.html = html;
    if (!Array.isArray(out.files) && html.trim()) {
      out.files = [{ path: "index.html", content: html }];
      if (typeof out.entry !== "string" || !out.entry.trim()) {
        out.entry = "index.html";
      }
      if (typeof out.stack !== "string" || !out.stack.trim()) {
        out.stack = "html-static";
      }
    }
  }

  if (Array.isArray(out.files)) {
    out.files = out.files
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          path: typeof rec.path === "string" ? rec.path.trim() : "",
          content: typeof rec.content === "string" ? rec.content : "",
        };
      })
      .filter(
        (f: { path: string; content: string }) =>
          f.path.length > 0 && f.content.trim().length > 0
      );
  }

  if (typeof out.stack !== "string" || !out.stack.trim()) {
    out.stack =
      typeof out.techStack === "string" && out.techStack.trim()
        ? out.techStack
        : "html-static";
  }

  // Drop unknown keys that strict schemas reject.
  const props = schemaProps(schema);
  const allowed = new Set(Object.keys(props));
  for (const key of Object.keys(out)) {
    if (!allowed.has(key)) delete out[key];
  }
  return out;
}
