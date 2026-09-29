/**
 * Deterministic legacy generation fixtures for M3C tests (no AI).
 */

export const GOLDEN_LEGACY_STORYLINE = {
  objective: "Secure Series A interest",
  audience: "Series A investors",
  narrativeStrategy: "Problem → Insight → Solution",
  slides: [
    { title: "Title", purpose: "Introduce", keyMessage: "Category-defining SaaS" },
    { title: "The Problem", purpose: "Name the pain", keyMessage: "Fragmented tooling" },
    { title: "Our Solution", purpose: "Show wedge", keyMessage: "One workflow system" },
  ],
};

export const GOLDEN_LEGACY_SLIDE_CONTENT = {
  title: "Acme Series A",
  subtitle: "Investor deck",
  slides: [
    {
      title: "Title",
      subtitle: "Investor presentation",
      bullets: ["Acme Creative Ops", "Series A"],
      notes: "Open strong",
    },
    {
      title: "The Problem",
      bullets: ["Fragmented tooling", "Slow approvals", "No single SoT"],
      visualCue: "Ops dashboard crop",
    },
    {
      title: "Our Solution",
      bullets: ["Brief → produce → approve → ship"],
      notes: "Keep factual",
    },
  ],
};

export const GOLDEN_LEGACY_ROUTES = {
  routes: [
    {
      title: "Clean Minimal",
      description: "White space, refined typography",
      deckTitle: "Acme Series A",
      deckSubtitle: "Clean Minimal",
      slides: GOLDEN_LEGACY_SLIDE_CONTENT.slides,
    },
    {
      title: "Bold Executive",
      description: "Dark backgrounds, large type",
      deckTitle: "Acme Series A",
      deckSubtitle: "Bold Executive",
      slides: GOLDEN_LEGACY_SLIDE_CONTENT.slides,
    },
    {
      title: "Modern Editorial",
      description: "Dynamic grid, colour accents",
      deckTitle: "Acme Series A",
      deckSubtitle: "Modern Editorial",
      slides: GOLDEN_LEGACY_SLIDE_CONTENT.slides,
    },
  ],
};

export const GOLDEN_LEGACY_DESIGN_SYSTEM = {
  name: "Bold Executive System",
  colors: {
    "color.primary": "#0B1F3A",
    "color.on_surface": "#FFFFFF",
    "color.accent": "#2ECC71",
  },
  fontRoles: {
    title: { family: "Inter", size: 44, weight: 700 },
    body: { family: "Inter", size: 16, weight: 400 },
  },
  spacing: { md: 16, lg: 24 },
  grid: { columns: 12, gutter: 16, margin: 48 },
};

export const GOLDEN_LEGACY_SOURCE = {
  choice: "Start from Scratch",
  title: "Source path",
  summary: "Build from brief alone",
  constraints: ["Do not invent revenue"],
};

/** Provider-wrapper equivalent of GOLDEN_LEGACY_ROUTES */
export const GOLDEN_PROVIDER_WRAPPED_ROUTES = {
  PresentationRoutes: {
    data: {
      result: GOLDEN_LEGACY_ROUTES,
    },
  },
};
