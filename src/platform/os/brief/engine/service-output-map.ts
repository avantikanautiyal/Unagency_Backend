/**
 * Canonical service × subcategory → recommended output type.
 * Source of truth: Detailed Mapping spreadsheet.
 *
 * Websites / interactive prototypes / app development are deferred —
 * they resolve to text briefs for now (no prototype pipeline yet).
 */

export type ServiceOutputKind =
  | 'text'
  | 'document'
  | 'presentation'
  | 'image'
  | 'image_mockup'
  | 'image_3d_mockup'
  | 'video'
  | 'animation'
  | 'email'
  | 'edited_image'
  | 'human_form'
  | 'dynamic'
  | 'deferred_website';

export type ServiceOutputSpec = {
  readonly kind: ServiceOutputKind;
  /** Primary modalities the runtime should produce. */
  readonly modalities: readonly (
    | 'text'
    | 'image'
    | 'video'
    | 'document'
    | 'presentation'
    | 'audio'
  )[];
  readonly needsMockup: boolean;
  readonly needs3dMockup: boolean;
  readonly askIfVague: boolean;
  readonly exampleDeliverable: string;
};

type MapKey = `${string}/${string}` | `${string}/*`;

const SPEC = (
  kind: ServiceOutputKind,
  modalities: ServiceOutputSpec['modalities'],
  exampleDeliverable: string,
  flags: Partial<
    Pick<ServiceOutputSpec, 'needsMockup' | 'needs3dMockup' | 'askIfVague'>
  > = {},
): ServiceOutputSpec => ({
  kind,
  modalities,
  needsMockup: flags.needsMockup ?? false,
  needs3dMockup: flags.needs3dMockup ?? false,
  askIfVague: flags.askIfVague ?? false,
  exampleDeliverable,
});

const DYNAMIC = SPEC(
  'dynamic',
  ['text'],
  'Ask for the requirement, then assign the appropriate output type',
  { askIfVague: true },
);

/** Exact service/subtype keys from onboarding taxonomy. */
export const SERVICE_OUTPUT_MAP: Readonly<Record<MapKey, ServiceOutputSpec>> = {
  // —— Social Media ——
  'social/strategy': SPEC(
    'text',
    ['text'],
    'Structured social media strategy, channel plan and recommendations',
  ),
  'social/content-design': SPEC(
    'image_mockup',
    ['image'],
    'Social post, story, carousel or banner shown in a realistic mockup',
    { needsMockup: true },
  ),
  'social/copywriting': SPEC(
    'text',
    ['text'],
    'Captions, headlines, hashtags and calls to action',
  ),

  // —— Web Tech (websites deferred) ——
  'website/corporate-website': SPEC(
    'deferred_website',
    ['text'],
    'Website brief, sitemap, page copy (prototype deferred)',
  ),
  'website/ecom-website': SPEC(
    'deferred_website',
    ['text'],
    'Store structure, UX flow, product-page plan (prototype deferred)',
  ),
  'website/landing-page': SPEC(
    'deferred_website',
    ['text'],
    'Landing-page structure and copy (prototype deferred)',
  ),
  'website/ui-design': SPEC(
    'image',
    ['image'],
    'Web or app interface screens and UI layouts',
  ),
  'website/visual-asset': SPEC(
    'human_form',
    ['text'],
    'Route the user to human-assisted production',
    { askIfVague: true },
  ),
  'website/ux-strategy': SPEC(
    'text',
    ['text'],
    'User journeys, information architecture and UX recommendations',
  ),
  'website/interactive-prototypes': SPEC(
    'deferred_website',
    ['text'],
    'Prototype brief and interaction notes (interactive build deferred)',
  ),
  'website/design-systems': SPEC(
    'document',
    ['image', 'document'],
    'UI kit, component library, usage rules and documentation',
  ),
  'website/app-development': SPEC(
    'deferred_website',
    ['text'],
    'App brief and functional requirements (code output deferred)',
  ),
  'website/other': DYNAMIC,

  // —— Branding & Logo ——
  'branding/logo-design': SPEC(
    'image_mockup',
    ['image'],
    'Logo concepts, final logo and usage mockups',
    { needsMockup: true },
  ),
  'branding/visual-identity': SPEC(
    'presentation',
    ['image', 'presentation'],
    'Colour palette, typography, visual language and identity presentation',
  ),
  'branding/brand-guidelines': SPEC(
    'document',
    ['document'],
    'Brand standards covering logo, colour, typography and applications',
  ),
  'branding/brand-naming-taglines': SPEC(
    'text',
    ['text'],
    'Brand-name options, taglines and rationale',
  ),
  'branding/other': DYNAMIC,

  // —— Packaging ——
  'packaging/boxes': SPEC('image_3d_mockup', ['image'], 'Box artwork with realistic 3D mockup', {
    needsMockup: true,
    needs3dMockup: true,
  }),
  'packaging/pouches': SPEC(
    'image_3d_mockup',
    ['image'],
    'Pouch artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/wrapper': SPEC(
    'image_3d_mockup',
    ['image'],
    'Wrapper artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/bottles': SPEC(
    'image_3d_mockup',
    ['image'],
    'Bottle artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/jars': SPEC(
    'image_3d_mockup',
    ['image'],
    'Jar artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/tubes': SPEC(
    'image_3d_mockup',
    ['image'],
    'Tube artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/labels': SPEC(
    'image_3d_mockup',
    ['image'],
    'Label design with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/gift-packs': SPEC(
    'image_3d_mockup',
    ['image'],
    'Gift-pack artwork with realistic 3D mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'packaging/other': DYNAMIC,

  // —— Print & OOH ——
  'print/brochures': SPEC(
    'document',
    ['document'],
    'Multipage brochure suitable for print or digital distribution',
  ),
  'print/leaflets': SPEC(
    'document',
    ['document'],
    'Single- or double-sided leaflet artwork',
  ),
  'print/posters': SPEC(
    'image_mockup',
    ['image'],
    'Poster artwork and environmental mockup',
    { needsMockup: true },
  ),
  'print/print-ads': SPEC(
    'image',
    ['image'],
    'Magazine or newspaper advertisement artwork',
  ),
  'print/ooh-design': SPEC(
    'image_mockup',
    ['image'],
    'Billboard or outdoor-media artwork in a placement mockup',
    { needsMockup: true },
  ),
  'print/vehicle-design': SPEC(
    'image_mockup',
    ['image'],
    'Vehicle branding artwork applied to a vehicle mockup',
    { needsMockup: true },
  ),
  'print/standees': SPEC(
    'image_mockup',
    ['image'],
    'Standee artwork and display mockup',
    { needsMockup: true },
  ),
  'print/other': DYNAMIC,

  // —— Video & Motion ——
  'video/corporate-films': SPEC('video', ['video'], 'Corporate story or brand film'),
  'video/explainer-videos': SPEC(
    'video',
    ['video'],
    'Product, service or process explainer video',
  ),
  'video/promo-videos': SPEC('video', ['video'], 'Promotional or campaign video'),
  'video/motion-graphics': SPEC(
    'animation',
    ['video'],
    'Animated typography, icons and visual graphics',
  ),
  'video/2d-animation': SPEC(
    'animation',
    ['video'],
    'Two-dimensional animated film or sequence',
  ),
  'video/3d-animation': SPEC(
    'animation',
    ['video'],
    'Three-dimensional animated film or sequence',
  ),
  'video/vfx': SPEC('video', ['video'], 'Video with visual-effects treatment or compositing'),
  'video/video-editing': SPEC('video', ['video'], 'Edited and finished video output'),
  'video/storyboards': SPEC(
    'document',
    ['image', 'document'],
    'Sequential storyboard frames with scene notes',
  ),
  'video/other': DYNAMIC,

  // —— Presentations ——
  'presentations/corporate': SPEC(
    'presentation',
    ['presentation'],
    'Corporate profile or company presentation',
  ),
  'presentations/pitch-decks': SPEC(
    'presentation',
    ['presentation'],
    'Investor, sales or partnership pitch deck',
  ),
  'presentations/product': SPEC(
    'presentation',
    ['presentation'],
    'Product overview, launch or sales presentation',
  ),
  'presentations/training': SPEC(
    'presentation',
    ['presentation'],
    'Training or learning presentation',
  ),
  'presentations/infographics': SPEC(
    'image',
    ['image'],
    'Data-led or explanatory infographic',
  ),
  'presentations/gifs': SPEC('animation', ['video', 'image'], 'Short looping animated visual'),
  'presentations/templates': SPEC(
    'presentation',
    ['presentation'],
    'Editable presentation template system',
  ),
  'presentations/other': DYNAMIC,

  // —— Email Design ——
  'email/emailers': SPEC(
    'email',
    ['image', 'document'],
    'Promotional email design and send-ready preview',
  ),
  'email/newsletters': SPEC(
    'email',
    ['image', 'document'],
    'Newsletter design and send-ready preview',
  ),
  'email/other': DYNAMIC,

  // —— POS / In-Store ——
  'pos/product-display-units': SPEC(
    'image_3d_mockup',
    ['image'],
    'Branded display-unit design and environmental mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'pos/branding-elements': SPEC(
    'image_mockup',
    ['image'],
    'In-store graphics, shelf strips and branding applications',
    { needsMockup: true },
  ),
  'pos/sampling-booths': SPEC(
    'image_3d_mockup',
    ['image'],
    'Booth design and environmental visualization',
    { needsMockup: true, needs3dMockup: true },
  ),
  'pos/store-branding': SPEC(
    'image_3d_mockup',
    ['image'],
    'Storewide branding system and environmental mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'pos/other': DYNAMIC,

  // —— Merchandise ——
  'merchandise/t-shirts': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a T-shirt mockup',
    { needsMockup: true },
  ),
  'merchandise/caps': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a cap mockup',
    { needsMockup: true },
  ),
  'merchandise/jackets': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a jacket mockup',
    { needsMockup: true },
  ),
  'merchandise/mugs': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a mug mockup',
    { needsMockup: true },
  ),
  'merchandise/bottles': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a bottle mockup',
    { needsMockup: true },
  ),
  'merchandise/pens-notepads': SPEC(
    'image_mockup',
    ['image'],
    'Stationery artwork and product mockups',
    { needsMockup: true },
  ),
  'merchandise/bags': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a bag mockup',
    { needsMockup: true },
  ),
  'merchandise/keychains': SPEC(
    'image_mockup',
    ['image'],
    'Keychain design and product mockup',
    { needsMockup: true },
  ),
  'merchandise/trophy': SPEC(
    'image_3d_mockup',
    ['image'],
    'Trophy concept and realistic visualization',
    { needsMockup: true, needs3dMockup: true },
  ),
  'merchandise/gift-hampers': SPEC(
    'image_3d_mockup',
    ['image'],
    'Curated hamper design and presentation mockup',
    { needsMockup: true, needs3dMockup: true },
  ),
  'merchandise/other': DYNAMIC,

  // —— Illustration ——
  'illustration/concept-art': SPEC(
    'image',
    ['image'],
    'Illustrated concept or environment artwork',
  ),
  'illustration/mascot-design': SPEC(
    'image_mockup',
    ['image'],
    'Character design, expressions and application mockup',
    { needsMockup: true },
  ),
  'illustration/infographics': SPEC(
    'image',
    ['image'],
    'Illustrated information graphic',
  ),
  'illustration/technical': SPEC(
    'image',
    ['image'],
    'Technical illustration or explanatory diagram',
  ),
  'illustration/other': DYNAMIC,

  // —— Visual Production (service slug: photography) ——
  'photography/product': SPEC(
    'image',
    ['image'],
    'Product photograph or generated product visual',
  ),
  'photography/lifestyle': SPEC(
    'image',
    ['image'],
    'Lifestyle photograph or generated lifestyle visual',
  ),
  'photography/corporate': SPEC(
    'image',
    ['image'],
    'Corporate portraits, workplace or office imagery',
  ),
  'photography/industrial': SPEC(
    'image',
    ['image'],
    'Industrial process, facility or equipment imagery',
  ),
  'photography/event': SPEC(
    'image',
    ['image'],
    'Event photography or generated event visual',
  ),
  'photography/retouching': SPEC(
    'edited_image',
    ['image'],
    'Colour correction, cleanup, compositing or image enhancement',
  ),
  'photography/other': DYNAMIC,

  // —— Brand Strategy ——
  'strategy/*': SPEC(
    'document',
    ['text', 'document'],
    'Positioning, audience, purpose, personality and strategic roadmap',
  ),
  'strategy/brand-strategy': SPEC(
    'document',
    ['text', 'document'],
    'Positioning, audience, purpose, personality and strategic roadmap',
  ),

  // —— Ad Campaigns ——
  'ads/performance-ads': SPEC(
    'image',
    ['image', 'video', 'text'],
    'Static/video ad variants with headlines, copy and calls to action',
    { askIfVague: true },
  ),
  'ads/other': DYNAMIC,

  // —— Event Branding (service slug: event) ——
  'event/event-concept': SPEC(
    'document',
    ['text', 'image'],
    'Event theme, central idea, creative direction and mood board',
  ),
  'event/event-identity': SPEC(
    'image_mockup',
    ['image'],
    'Event logo, colour, typography, visual system and applications',
    { needsMockup: true },
  ),
  'event/content-design': SPEC(
    'presentation',
    ['image', 'video', 'presentation'],
    'Invites, posts, stage screens, signage, decks or motion content',
    { askIfVague: true },
  ),
  'event/other': DYNAMIC,
};

const SERVICE_ALIASES: Record<string, string> = {
  social: 'social',
  website: 'website',
  branding: 'branding',
  packaging: 'packaging',
  print: 'print',
  video: 'video',
  presentations: 'presentations',
  email: 'email',
  pos: 'pos',
  merchandise: 'merchandise',
  illustration: 'illustration',
  photography: 'photography',
  'visual-production': 'photography',
  production: 'photography',
  strategy: 'strategy',
  ads: 'ads',
  campaigns: 'ads',
  event: 'event',
  events: 'event',
};

export function normalizeServiceSlug(service?: string): string {
  const raw = (service ?? '').trim().toLowerCase();
  return SERVICE_ALIASES[raw] ?? raw;
}

export function resolveServiceOutputSpec(input: {
  service?: string;
  subtype?: string;
  category?: string;
  prompt?: string;
}): ServiceOutputSpec {
  const service = normalizeServiceSlug(input.service);
  let subtype = (input.subtype ?? '').trim().toLowerCase();
  if (!subtype && input.category) {
    const cat = input.category.toLowerCase();
    if (!cat.includes(':')) subtype = cat;
  }

  if (service && subtype) {
    const exact = SERVICE_OUTPUT_MAP[`${service}/${subtype}` as MapKey];
    if (exact) return refineFromPrompt(exact, input.prompt);
  }
  if (service) {
    const wildcard = SERVICE_OUTPUT_MAP[`${service}/*` as MapKey];
    if (wildcard) return refineFromPrompt(wildcard, input.prompt);
  }

  // Fallback: infer lightly from prompt, never default blindly to image.
  return refineFromPrompt(
    SPEC('dynamic', ['text'], 'Infer from requirement', { askIfVague: true }),
    input.prompt,
  );
}

function refineFromPrompt(
  base: ServiceOutputSpec,
  prompt?: string,
): ServiceOutputSpec {
  if (!prompt?.trim()) return base;
  if (base.kind !== 'dynamic' && !base.askIfVague) return base;

  const hay = prompt.toLowerCase();
  if (/\b(pitch\s*deck|presentation|slides?|pptx)\b/.test(hay)) {
    return SPEC(
      'presentation',
      ['presentation'],
      'Presentation / pitch deck from user requirement',
    );
  }
  if (/\b(pdf|brochure|guidelines?|document|leaflet|report)\b/.test(hay)) {
    return SPEC('document', ['document'], 'Document / PDF from user requirement');
  }
  if (/\b(video|film|reel|animation|motion)\b/.test(hay)) {
    return SPEC('video', ['video'], 'Video from user requirement');
  }
  if (/\b(logo|poster|mockup|illustration|photo|image|banner)\b/.test(hay)) {
    return SPEC('image', ['image'], 'Image from user requirement');
  }
  if (/\b(copy|caption|tagline|headline|strategy|naming)\b/.test(hay)) {
    return SPEC('text', ['text'], 'Text from user requirement');
  }
  return base;
}

/** Coarse output bucket — used for prompt vs selection alignment (not subtype slugs). */
export type OutputContextFamily =
  | "text"
  | "document"
  | "presentation"
  | "visual"
  | "video"
  | "email"
  | "website"
  | "human"
  | "dynamic";

export const SERVICE_DISPLAY_LABELS: Record<string, string> = {
  social: "Social Media",
  website: "Web Tech",
  branding: "Branding & Logo",
  packaging: "Packaging Design",
  print: "Print & OOH",
  video: "Video & Motion",
  presentations: "Presentations",
  email: "Email Design",
  pos: "POS / In-Store",
  merchandise: "Merchandise",
  illustration: "Illustration",
  photography: "Visual Production",
  strategy: "Brand Strategy",
  ads: "Ad Campaigns",
  event: "Event Branding",
};

function titleCaseSlug(id: string): string {
  return id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function outputContextFamily(kind: ServiceOutputKind): OutputContextFamily {
  switch (kind) {
    case "presentation":
      return "presentation";
    case "document":
      return "document";
    case "text":
      return "text";
    case "image":
    case "image_mockup":
    case "image_3d_mockup":
    case "edited_image":
      return "visual";
    case "video":
    case "animation":
      return "video";
    case "email":
      return "email";
    case "deferred_website":
      return "website";
    case "human_form":
      return "human";
    default:
      return "dynamic";
  }
}

export function outputContextFamilyForSelection(input: {
  service?: string;
  subtype?: string;
  category?: string;
  productPath?: string;
  prompt?: string;
}): OutputContextFamily {
  return outputContextFamily(resolveServiceOutputSpec(input).kind);
}

/** Human-facing chip: "Presentations · Corporate" */
export function formatProductContextLabel(input: {
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  deliverableLabel?: string;
}): string {
  if (input.deliverableLabel?.includes(" · ")) {
    return input.deliverableLabel;
  }
  const service = normalizeServiceSlug(input.service);
  const serviceLabel =
    SERVICE_DISPLAY_LABELS[service] ?? (service ? titleCaseSlug(service) : undefined);
  const detail =
    input.deliverableLabel ??
    (input.subtype ? titleCaseSlug(input.subtype) : undefined);
  if (serviceLabel && detail && detail !== serviceLabel) {
    return `${serviceLabel} · ${detail}`;
  }
  return detail ?? serviceLabel ?? "Creative";
}

/**
 * Prompt/selection gate — same service is always aligned (subtype is flavor).
 * Cross-service requires a real family conflict before blocking.
 */
export function productContextsAligned(input: {
  selected: {
    service?: string;
    subtype?: string;
    category?: string;
    productPath?: string;
    prompt?: string;
  };
  detected: {
    service?: string;
    subtype?: string;
    category?: string;
    productPath?: string;
    prompt?: string;
  };
}): boolean {
  const selSvc = normalizeServiceSlug(input.selected.service);
  const detSvc = normalizeServiceSlug(input.detected.service);
  if (selSvc && detSvc && selSvc === detSvc) {
    return true;
  }
  if (!selSvc || !detSvc) {
    return true;
  }
  return false;
}

/** OS refinement question-bank output type from taxonomy selection. */
export function refinementOutputTypeForSelection(input: {
  service?: string;
  subtype?: string;
  category?: string;
  prompt?: string;
  mediaKind?: "image" | "video" | "text";
}): string {
  const spec = resolveServiceOutputSpec(input);
  const family = outputContextFamily(spec.kind);
  const svc = normalizeServiceSlug(input.service);
  const subtype = (input.subtype ?? "").toLowerCase();
  const prompt = (input.prompt ?? "").toLowerCase();

  if (family === "presentation" || svc === "presentations") return "presentation";
  if (svc === "branding" || subtype.includes("logo")) return "logo";
  if (svc === "website") {
    return subtype.includes("landing") || prompt.includes("landing")
      ? "landing_page"
      : "website";
  }
  if (svc === "email" || family === "email") return "email";
  if (svc === "print" || family === "document") return "brochure";
  if (svc === "strategy" || (prompt.includes("strategy") && !prompt.includes("campaign"))) {
    return "strategy";
  }
  if (svc === "ads") return "campaign_strategy";
  if (subtype === "copywriting" || svc === "copywriting") return "copy";
  if (prompt.includes("caption")) return "caption";
  if (svc === "social") return "social_creative";
  if (family === "video") return "video";
  if (family === "visual") return "social_creative";
  if (input.mediaKind === "video") return "video";
  if (input.mediaKind === "image") return "social_creative";
  if (input.mediaKind === "text" || family === "text") return "copy";
  return "generic";
}

/** True when the prompt is too thin to safely pick a composite/dynamic output. */
export function isPromptTooVagueForOutput(input: {
  prompt?: string;
  service?: string;
  subtype?: string;
}): boolean {
  const spec = resolveServiceOutputSpec(input);
  if (!spec.askIfVague && spec.kind !== 'dynamic') return false;
  const prompt = (input.prompt ?? '').trim();
  if (prompt.length < 24) return true;
  // Too generic / placeholder-like
  if (
    /^(make|create|design|generate|help|need|want)\s+(this|it|something|a\s+thing)?\.?$/i.test(
      prompt,
    )
  ) {
    return true;
  }
  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  return wordCount < 5;
}

export type ProductUiProfile =
  | 'text'
  | 'media'
  | 'presentation'
  | 'document'
  | 'human';

export function uiProfileForOutput(spec: ServiceOutputSpec): ProductUiProfile {
  switch (spec.kind) {
    case 'text':
      return 'text';
    case 'document':
    case 'deferred_website':
    case 'email':
      return 'document';
    case 'presentation':
      return 'presentation';
    case 'human_form':
      return 'human';
    case 'dynamic':
      return 'text';
    default:
      return 'media';
  }
}

export function primaryModalityForOutput(
  spec: ServiceOutputSpec,
): 'text' | 'image' | 'video' | 'document' | 'presentation' {
  if (spec.modalities.includes('presentation')) return 'presentation';
  if (spec.modalities.includes('document')) return 'document';
  if (spec.modalities.includes('video')) return 'video';
  if (spec.modalities.includes('image')) return 'image';
  return 'text';
}

export function shouldGenerateVisualForOutput(spec: ServiceOutputSpec): boolean {
  return (
    spec.modalities.includes('image') ||
    spec.modalities.includes('video') ||
    spec.kind === 'image' ||
    spec.kind === 'image_mockup' ||
    spec.kind === 'image_3d_mockup' ||
    spec.kind === 'edited_image' ||
    spec.kind === 'animation' ||
    spec.kind === 'video'
  );
}

export function textUseCaseForOutput(
  spec: ServiceOutputSpec,
): 'strategy' | 'copy' | 'creative' | 'general' {
  if (
    spec.kind === 'document' ||
    spec.kind === 'presentation' ||
    spec.kind === 'deferred_website'
  ) {
    return 'strategy';
  }
  if (spec.kind === 'text') return 'copy';
  if (spec.modalities.includes('text') && !spec.modalities.includes('image')) {
    return 'copy';
  }
  return 'creative';
}
