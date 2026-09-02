/**
 * Canonical service × subcategory → recommended output type.
 * Source of truth: Detailed Mapping spreadsheet.
 *
 * Contract rule (non-negotiable):
 *   `kind` = PRIMARY DELIVERABLE TYPE the user expects to receive/use.
 *   Mockup/presentation must NOT replace the primary output type.
 *
 * `mockupRole` describes how mockups relate to that primary:
 *   - prohibited — never instruct a mockup (production asset only)
 *   - optional   — mockup only when the user explicitly requests one
 *   - required   — primary asset plus a contracted secondary mockup
 *   - primary    — the mockup visualization IS the primary deliverable
 *                  (kind must be image_mockup / image_3d_mockup)
 *
 * Web Tech never uses image providers (no mockups / screenshots as
 * deliverables). Buildable subtypes produce WebProject (files + stack)
 * with html-static live preview and downloadable source.
 */

import { resolveTextUseCaseFromService } from '../providers/routing/matrix/service-matrix-routing';

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

/**
 * File extensions the export/materializer pipeline can actually deliver.
 * Derived from output kind — not aspirational (no SVG/PDF for raster logos).
 */
export type DownloadFormat =
  | 'png'
  | 'jpg'
  | 'svg'
  | 'pdf'
  | 'pptx'
  | 'docx'
  | 'html'
  | 'zip'
  | 'mp4'
  | 'txt';

/** How mockup/presentation relates to the primary deliverable. */
export type MockupRole = 'prohibited' | 'optional' | 'required' | 'primary';

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
  /**
   * Relationship of mockup to the primary deliverable.
   * Prompt builders must consult this — never assume every visual needs a mockup.
   */
  readonly mockupRole: MockupRole;
  /** Prefer 3D product/environmental visualization when a mockup is instructed. */
  readonly prefers3dMockup: boolean;
  /**
   * True when contracted generation should include/produce a mockup
   * (mockupRole is `required` or `primary`). Optional mockups stay false
   * unless the brief explicitly requests a mockup at prompt time.
   */
  readonly needsMockup: boolean;
  readonly needs3dMockup: boolean;
  readonly askIfVague: boolean;
  readonly exampleDeliverable: string;
  /**
   * Downloadable file formats this output kind’s exporter can produce.
   * UI must not invent formats beyond this list.
   */
  readonly supportedDownloadFormats: readonly DownloadFormat[];
  /** Preferred format when callers omit an explicit choice. */
  readonly defaultDownloadFormat?: DownloadFormat;
};

type MapKey = `${string}/${string}` | `${string}/*`;

type SpecFlags = Partial<{
  mockupRole: MockupRole;
  prefers3dMockup: boolean;
  askIfVague: boolean;
}>;

/** Canonical formats the materializer/exporter can produce for each output kind. */
export function downloadFormatsForKind(kind: ServiceOutputKind): {
  readonly supportedDownloadFormats: readonly DownloadFormat[];
  readonly defaultDownloadFormat?: DownloadFormat;
} {
  switch (kind) {
    case 'image':
    case 'image_mockup':
    case 'image_3d_mockup':
    case 'edited_image':
    case 'human_form':
      // Raster only — providers store PNG/JPEG; delivery converts between them.
      // SVG/PDF are omitted until an exporter can actually produce them.
      return {
        supportedDownloadFormats: ['png', 'jpg'],
        defaultDownloadFormat: 'png',
      };
    case 'video':
    case 'animation':
      return {
        supportedDownloadFormats: ['mp4'],
        defaultDownloadFormat: 'mp4',
      };
    case 'document':
      return {
        supportedDownloadFormats: ['pdf', 'docx'],
        defaultDownloadFormat: 'pdf',
      };
    case 'presentation':
      return {
        supportedDownloadFormats: ['pdf', 'pptx'],
        defaultDownloadFormat: 'pdf',
      };
    case 'email':
      return {
        supportedDownloadFormats: ['html'],
        defaultDownloadFormat: 'html',
      };
    case 'deferred_website':
      return {
        supportedDownloadFormats: ['zip', 'html'],
        defaultDownloadFormat: 'zip',
      };
    case 'text':
    case 'dynamic':
    default:
      return { supportedDownloadFormats: [] };
  }
}

export function normalizeDownloadFormat(
  raw: string | undefined | null,
): DownloadFormat | undefined {
  if (!raw) return undefined;
  const f = raw.trim().toLowerCase();
  if (f === 'jpeg') return 'jpg';
  const allowed: readonly DownloadFormat[] = [
    'png',
    'jpg',
    'svg',
    'pdf',
    'pptx',
    'docx',
    'html',
    'zip',
    'mp4',
    'txt',
  ];
  return (allowed as readonly string[]).includes(f)
    ? (f as DownloadFormat)
    : undefined;
}

export function mimeTypeForDownloadFormat(format: DownloadFormat): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'html':
      return 'text/html';
    case 'zip':
      return 'application/zip';
    case 'mp4':
      return 'video/mp4';
    case 'txt':
      return 'text/plain';
  }
}

/** Infer downloadable formats from a stored artifact MIME (runtime fallback). */
export function downloadFormatsForMime(
  mimeType: string | undefined | null,
): readonly DownloadFormat[] {
  const mime = (mimeType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (!mime) return [];
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    return ['png', 'jpg'];
  }
  if (mime === 'image/svg+xml') return ['svg'];
  if (mime === 'image/webp') return ['png', 'jpg'];
  if (mime.startsWith('video/')) return ['mp4'];
  if (mime === 'application/pdf') return ['pdf'];
  if (mime.includes('presentationml') || mime.includes('powerpoint')) {
    return ['pptx'];
  }
  if (mime.includes('wordprocessingml') || mime.includes('msword')) {
    return ['docx'];
  }
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return ['html'];
  if (
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  ) {
    return ['zip'];
  }
  if (mime === 'text/plain') return ['txt'];
  return [];
}

/**
 * Formats the UI may offer: contract ∩ what the stored blob can yield.
 * When contract is empty, fall back to MIME-derived formats.
 */
export function resolveSelectableDownloadFormats(input: {
  readonly spec?: Pick<
    ServiceOutputSpec,
    'supportedDownloadFormats' | 'defaultDownloadFormat'
  > | null;
  readonly mimeType?: string | null;
  readonly materializedFormats?: readonly string[] | null;
}): readonly DownloadFormat[] {
  const fromMime = downloadFormatsForMime(input.mimeType);
  const fromContract = input.spec?.supportedDownloadFormats ?? [];
  const fromMaterialized = (input.materializedFormats ?? [])
    .map((f) => normalizeDownloadFormat(f))
    .filter((f): f is DownloadFormat => Boolean(f));

  let candidates: readonly DownloadFormat[] =
    fromMaterialized.length > 0
      ? fromMaterialized
      : fromContract.length > 0
        ? fromContract
        : fromMime;

  if (fromMime.length > 0 && fromContract.length > 0 && fromMaterialized.length === 0) {
    const mimeSet = new Set(fromMime);
    const intersected = fromContract.filter((f) => mimeSet.has(f));
    if (intersected.length > 0) candidates = intersected;
  }

  return candidates;
}

export function shouldPromptForDownloadFormat(
  formats: readonly DownloadFormat[],
): boolean {
  return formats.length > 1;
}

export function isDownloadFormatSupported(
  formats: readonly DownloadFormat[],
  format: string | undefined | null,
): boolean {
  const normalized = normalizeDownloadFormat(format);
  if (!normalized) return false;
  return formats.includes(normalized);
}

const SPEC = (
  kind: ServiceOutputKind,
  modalities: ServiceOutputSpec['modalities'],
  exampleDeliverable: string,
  flags: SpecFlags = {},
): ServiceOutputSpec => {
  const defaultRole: MockupRole =
    kind === 'image_mockup' || kind === 'image_3d_mockup'
      ? 'primary'
      : 'prohibited';
  const mockupRole = flags.mockupRole ?? defaultRole;
  const prefers3dMockup =
    flags.prefers3dMockup ?? kind === 'image_3d_mockup';
  const needsMockup = mockupRole === 'required' || mockupRole === 'primary';
  const download = downloadFormatsForKind(kind);
  return {
    kind,
    modalities,
    mockupRole,
    prefers3dMockup,
    needsMockup,
    needs3dMockup: needsMockup && prefers3dMockup,
    askIfVague: flags.askIfVague ?? false,
    exampleDeliverable,
    supportedDownloadFormats: download.supportedDownloadFormats,
    ...(download.defaultDownloadFormat
      ? { defaultDownloadFormat: download.defaultDownloadFormat }
      : {}),
  };
};

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
    'image',
    ['image', 'video'],
    'Production-ready social post, story, reel, carousel or banner at platform dimensions',
    { mockupRole: 'optional' },
  ),
  'social/copywriting': SPEC(
    'text',
    ['text'],
    'Captions, headlines, hashtags and calls to action',
  ),

  // —— Web Tech (LLM code/text only — never image providers) ——
  'website/corporate-website': SPEC(
    'deferred_website',
    ['text'],
    'Production website project (stack + files) and preview/download',
  ),
  'website/ecom-website': SPEC(
    'deferred_website',
    ['text'],
    'E-commerce project (stack + files) and preview/download',
  ),
  'website/landing-page': SPEC(
    'deferred_website',
    ['text'],
    'Landing-page project in the chosen stack with live preview',
  ),
  'website/ui-design': SPEC(
    'deferred_website',
    ['text'],
    'UI implemented as code in the chosen stack (react-vite / next / html-static)',
  ),
  'website/visual-asset': SPEC(
    'dynamic',
    ['image', 'text'],
    'Visual asset brief — clarify requirement then generate with AI',
    { askIfVague: true, mockupRole: 'optional' },
  ),
  'website/ux-strategy': SPEC(
    'text',
    ['text'],
    'User journeys, information architecture and UX recommendations',
  ),
  'website/interactive-prototypes': SPEC(
    'deferred_website',
    ['text'],
    'Interactive prototype as code (react-vite) with preview/download',
  ),
  'website/design-systems': SPEC(
    'document',
    ['image', 'document'],
    'UI kit, component library, usage rules and documentation',
  ),
  'website/app-development': SPEC(
    'deferred_website',
    ['text'],
    'App project in resolved stack (next/mern/react-vite) with downloadable files',
  ),
  'website/other': DYNAMIC,

  // —— Branding & Logo ——
  'branding/logo-design': SPEC(
    'image',
    ['image'],
    'Production-ready logo mark on a clean / transparent background',
    { mockupRole: 'optional' },
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

  // —— Packaging (primary = flat production artwork; 3D mockup optional) ——
  'packaging/boxes': SPEC(
    'image',
    ['image'],
    'Production-ready box packaging artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/pouches': SPEC(
    'image',
    ['image'],
    'Production-ready pouch packaging artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/wrapper': SPEC(
    'image',
    ['image'],
    'Production-ready wrapper artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/bottles': SPEC(
    'image',
    ['image'],
    'Production-ready bottle label / packaging artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/jars': SPEC(
    'image',
    ['image'],
    'Production-ready jar packaging artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/tubes': SPEC(
    'image',
    ['image'],
    'Production-ready tube packaging artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/labels': SPEC(
    'image',
    ['image'],
    'Production-ready label artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
  ),
  'packaging/gift-packs': SPEC(
    'image',
    ['image'],
    'Production-ready gift-pack artwork (flat / print-ready)',
    { mockupRole: 'optional', prefers3dMockup: true },
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
    'image',
    ['image'],
    'Production-ready poster artwork at print dimensions',
    { mockupRole: 'optional' },
  ),
  'print/print-ads': SPEC(
    'image',
    ['image'],
    'Magazine or newspaper advertisement artwork',
  ),
  'print/ooh-design': SPEC(
    'image',
    ['image'],
    'Production-ready billboard or outdoor-media artwork',
    { mockupRole: 'optional' },
  ),
  'print/vehicle-design': SPEC(
    'image',
    ['image'],
    'Production-ready vehicle wrap / branding artwork (flat panels)',
    { mockupRole: 'optional' },
  ),
  'print/standees': SPEC(
    'image',
    ['image'],
    'Production-ready standee artwork',
    { mockupRole: 'optional' },
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
    ['document'],
    'Send-ready HTML email with subject, preheader and designed body',
  ),
  'email/newsletters': SPEC(
    'email',
    ['document'],
    'Send-ready HTML newsletter with subject, preheader and designed body',
  ),
  'email/other': DYNAMIC,

  // —— POS / In-Store (visualization is the contracted primary for display units) ——
  'pos/product-display-units': SPEC(
    'image_3d_mockup',
    ['image'],
    'Branded display-unit design shown as an environmental / 3D visualization',
    { mockupRole: 'primary', prefers3dMockup: true },
  ),
  'pos/branding-elements': SPEC(
    'image',
    ['image'],
    'Production-ready in-store graphics, shelf strips and branding applications',
    { mockupRole: 'optional' },
  ),
  'pos/sampling-booths': SPEC(
    'image_3d_mockup',
    ['image'],
    'Booth design shown as an environmental / 3D visualization',
    { mockupRole: 'primary', prefers3dMockup: true },
  ),
  'pos/store-branding': SPEC(
    'image_3d_mockup',
    ['image'],
    'Storewide branding system shown as an environmental / 3D visualization',
    { mockupRole: 'primary', prefers3dMockup: true },
  ),
  'pos/other': DYNAMIC,

  // —— Merchandise (product mockup IS the primary deliverable) ——
  'merchandise/t-shirts': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a T-shirt mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/caps': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a cap mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/jackets': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a jacket mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/mugs': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a mug mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/bottles': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a bottle mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/pens-notepads': SPEC(
    'image_mockup',
    ['image'],
    'Stationery artwork shown on product mockups',
    { mockupRole: 'primary' },
  ),
  'merchandise/bags': SPEC(
    'image_mockup',
    ['image'],
    'Artwork applied to a bag mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/keychains': SPEC(
    'image_mockup',
    ['image'],
    'Keychain design shown as a product mockup',
    { mockupRole: 'primary' },
  ),
  'merchandise/trophy': SPEC(
    'image_3d_mockup',
    ['image'],
    'Trophy concept shown as a realistic 3D visualization',
    { mockupRole: 'primary', prefers3dMockup: true },
  ),
  'merchandise/gift-hampers': SPEC(
    'image_3d_mockup',
    ['image'],
    'Curated hamper design shown as a presentation mockup',
    { mockupRole: 'primary', prefers3dMockup: true },
  ),
  'merchandise/other': DYNAMIC,

  // —— Illustration ——
  'illustration/concept-art': SPEC(
    'image',
    ['image'],
    'Illustrated concept or environment artwork',
  ),
  'illustration/mascot-design': SPEC(
    'image',
    ['image'],
    'Character / mascot design with clear poses and expressions',
    { mockupRole: 'optional' },
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
    'image',
    ['image'],
    'Production-ready event logo, colour, typography and visual system assets',
    { mockupRole: 'optional' },
  ),
  'event/content-design': SPEC(
    'presentation',
    ['image', 'video', 'presentation'],
    'Invites, posts, stage screens, signage, decks or motion content',
    { askIfVague: true, mockupRole: 'optional' },
  ),
  'event/other': DYNAMIC,
};

const USER_MOCKUP_REQUEST_RE =
  /\b(mock-?ups?|on[- ]device|device frame|phone frame|iphone mock|in[- ]situ|on a (?:phone|iphone|device|business card|sign|billboard|t-?shirt|mug|bottle|product)|show (?:it|this|the (?:logo|post|artwork|design)) (?:on|in) (?:a |an |the )?(?:phone|mockup|card|sign|product))\b/i;

/** True when the brief explicitly asks for a mockup / placement visualization. */
export function userExplicitlyRequestsMockup(prompt?: string): boolean {
  if (!prompt?.trim()) return false;
  return USER_MOCKUP_REQUEST_RE.test(prompt);
}

/**
 * Whether provider prompts should instruct a mockup for this contract.
 * Optional mockups only fire when the user explicitly requests one.
 */
export function shouldInstructMockup(
  spec: ServiceOutputSpec,
  opts?: { readonly prompt?: string },
): boolean {
  if (spec.mockupRole === 'prohibited') return false;
  if (spec.mockupRole === 'primary' || spec.mockupRole === 'required') {
    return true;
  }
  return userExplicitlyRequestsMockup(opts?.prompt);
}

/**
 * Contract-driven deliverable lines for provider prompts.
 * Generated from the map — do not hardcode per-service mockup instructions elsewhere.
 */
export function buildContractDeliverablePromptLines(
  spec: ServiceOutputSpec,
  opts?: { readonly prompt?: string },
): string[] {
  const lines: string[] = [
    `Primary deliverable: ${spec.exampleDeliverable}.`,
    `Primary output kind: ${spec.kind}.`,
    `Mockup role: ${spec.mockupRole}.`,
  ];

  const instructMockup = shouldInstructMockup(spec, opts);
  const productionKinds: ServiceOutputKind[] = [
    'image',
    'edited_image',
    'deferred_website',
    'document',
    'email',
    'presentation',
    'video',
    'animation',
  ];

  if (!instructMockup && productionKinds.includes(spec.kind)) {
    lines.push(
      'Create the actual production-ready deliverable — not a device, laptop, browser, business-card, signage, apparel, or presentation mockup of it.',
    );
  }

  if (instructMockup) {
    if (spec.mockupRole === 'primary') {
      lines.push(
        spec.prefers3dMockup
          ? 'The primary deliverable is a realistic 3D product / environmental mockup visualization.'
          : 'The primary deliverable is a realistic product or application mockup visualization.',
      );
    } else if (spec.mockupRole === 'required') {
      lines.push(
        'Produce the primary production asset first, then also include a secondary realistic mockup presentation of that asset.',
      );
      if (spec.prefers3dMockup) {
        lines.push('Prefer a 3D product / environmental mockup for the secondary visualization.');
      }
    } else {
      lines.push(
        spec.prefers3dMockup
          ? 'The brief requests a mockup — also present the artwork in a realistic 3D product / environmental mockup (in addition to honouring the primary production deliverable when both are asked).'
          : 'The brief requests a mockup — also present the artwork in a realistic product or device mockup (in addition to honouring the primary production deliverable when both are asked).',
      );
    }
  }

  return lines;
}

/**
 * Deterministic catalog invariants for every SERVICE_OUTPUT_MAP entry.
 * Returns human-readable violation messages (empty = valid).
 */
export function validateServiceOutputContractInvariants(
  spec: ServiceOutputSpec,
): readonly string[] {
  const violations: string[] = [];
  const mockupKinds = spec.kind === 'image_mockup' || spec.kind === 'image_3d_mockup';

  if (spec.mockupRole === 'primary' && !mockupKinds) {
    violations.push(
      `mockupRole=primary requires kind image_mockup|image_3d_mockup (got ${spec.kind})`,
    );
  }
  if (mockupKinds && spec.mockupRole !== 'primary') {
    violations.push(
      `kind=${spec.kind} requires mockupRole=primary (got ${spec.mockupRole})`,
    );
  }
  if (
    (spec.mockupRole === 'optional' || spec.mockupRole === 'prohibited') &&
    mockupKinds
  ) {
    violations.push(
      `kind=${spec.kind} cannot pair with mockupRole=${spec.mockupRole}`,
    );
  }
  if (spec.needsMockup !== (spec.mockupRole === 'required' || spec.mockupRole === 'primary')) {
    violations.push(
      `needsMockup=${String(spec.needsMockup)} inconsistent with mockupRole=${spec.mockupRole}`,
    );
  }
  if (spec.needs3dMockup && !spec.needsMockup) {
    violations.push('needs3dMockup=true requires needsMockup=true');
  }
  if (spec.needs3dMockup && !spec.prefers3dMockup) {
    violations.push('needs3dMockup=true requires prefers3dMockup=true');
  }
  if (spec.kind === 'image_3d_mockup' && !spec.prefers3dMockup) {
    violations.push('image_3d_mockup requires prefers3dMockup=true');
  }
  if (!spec.exampleDeliverable.trim()) {
    violations.push('exampleDeliverable must be non-empty');
  }
  if (spec.modalities.length === 0) {
    violations.push('modalities must be non-empty');
  }
  const expected = downloadFormatsForKind(spec.kind);
  if (
    JSON.stringify([...spec.supportedDownloadFormats]) !==
    JSON.stringify([...expected.supportedDownloadFormats])
  ) {
    violations.push(
      `supportedDownloadFormats must match kind=${spec.kind} exporter capabilities`,
    );
  }
  if (
    expected.defaultDownloadFormat &&
    spec.defaultDownloadFormat !== expected.defaultDownloadFormat
  ) {
    violations.push(
      `defaultDownloadFormat must match kind=${spec.kind} exporter default`,
    );
  }
  if (
    spec.defaultDownloadFormat &&
    !spec.supportedDownloadFormats.includes(spec.defaultDownloadFormat)
  ) {
    violations.push('defaultDownloadFormat must be in supportedDownloadFormats');
  }
  return violations;
}

const SERVICE_ALIASES: Record<string, string> = {
  social: 'social',
  'social media': 'social',
  website: 'website',
  'web tech': 'website',
  branding: 'branding',
  'branding & logo': 'branding',
  packaging: 'packaging',
  'packaging design': 'packaging',
  print: 'print',
  'print & ooh': 'print',
  video: 'video',
  'video & motion': 'video',
  presentations: 'presentations',
  email: 'email',
  'email design': 'email',
  pos: 'pos',
  'pos / in-store': 'pos',
  'pos/in-store': 'pos',
  merchandise: 'merchandise',
  illustration: 'illustration',
  photography: 'photography',
  'visual production': 'photography',
  'visual-production': 'photography',
  production: 'photography',
  strategy: 'strategy',
  'brand strategy': 'strategy',
  ads: 'ads',
  campaigns: 'ads',
  'ad campaigns': 'ads',
  event: 'event',
  events: 'event',
  'event branding': 'event',
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

/** Explicit image vs video cues in a brief (null = none; conflict = both). */
export type ExplicitVisualModality =
  | 'image'
  | 'video'
  | 'conflict'
  | null;

const VIDEO_PROMPT_CUE_RE =
  /\b(videos?|filmm?s?|reels?|shorts?|animations?|motion(?:\s*graphics?)?|cinemagraphs?|tiktoks?|ugc\s*videos?|video\s*ads?|ads?\s*videos?|commercials?|spots?|motion\s*ads?)\b/i;
const IMAGE_PROMPT_CUE_RE =
  /\b(images?|statics?|static\s*ads?|banners?|photos?|photographs?|graphics?|stills?|posters?|carousels?|display\s*ads?|image\s*ads?|feed\s*ads?|story\s*ads?)\b/i;
const VIDEO_FORMAT_CUE_RE =
  /\b(reels?|shorts?|stories?|story-snap|vertical-video|square-video|landscape-video|page-cover-video|feed-video|spotlight-video|video-post|spark-ads|commercial-ad|brand-takeover|status|motion|tiktok)\b/i;

/**
 * Social Content Design format IDs that deliver video (reels, stories, TikTok feed, etc.).
 * Sourced from SERVICE_CATEGORIES.md platform format lists.
 */
const SOCIAL_VIDEO_FORMAT_IDS = new Set([
  "reels",
  "reels-2",
  "stories",
  "story",
  "story-snap",
  "vertical-video",
  "square-video",
  "landscape-video",
  "page-cover-video",
  "video-post-landscape",
  "feed-video-vertical",
  "spotlight-video",
  "commercial-ad",
  "spark-ads",
  "image-302",
  "brand-takeover-ad",
  "status",
]);

/** True when a social platform format id implies a video deliverable (reels, stories, etc.). */
export function isVideoSocialFormat(format?: string): boolean {
  if (!format?.trim()) return false;
  const f = format.trim().toLowerCase();
  if (SOCIAL_VIDEO_FORMAT_IDS.has(f)) return true;
  return VIDEO_FORMAT_CUE_RE.test(f);
}

export function inferExplicitVisualModalityFromPrompt(
  prompt?: string,
): ExplicitVisualModality {
  if (!prompt?.trim()) return null;
  const hay = prompt.toLowerCase();
  const wantsVideo = VIDEO_PROMPT_CUE_RE.test(hay);
  const wantsImage = IMAGE_PROMPT_CUE_RE.test(hay);
  if (wantsVideo && wantsImage) return 'conflict';
  if (wantsVideo) return 'video';
  if (wantsImage) return 'image';
  return null;
}

export function specOffersImageAndVideo(spec: ServiceOutputSpec): boolean {
  return (
    spec.modalities.includes('image') && spec.modalities.includes('video')
  );
}

/**
 * Resolve image vs video when a map entry offers both (e.g. ads/performance-ads).
 * Prefer user choice → format → explicit prompt cue; otherwise ask.
 */
export function resolveVisualModalityChoice(input: {
  readonly spec: ServiceOutputSpec;
  readonly format?: string;
  readonly prompt?: string;
  readonly preferredVisualModality?: 'image' | 'video';
  readonly service?: string;
  readonly subtype?: string;
}): {
  readonly modality: 'image' | 'video' | null;
  readonly needsClarification: boolean;
  readonly reason:
    | 'preferred'
    | 'format'
    | 'prompt'
    | 'kind'
    | 'ambiguous'
    | 'conflict'
    | 'not_applicable';
} {
  const { spec } = input;
  if (!specOffersImageAndVideo(spec)) {
    if (spec.kind === 'video' || spec.kind === 'animation') {
      return { modality: 'video', needsClarification: false, reason: 'kind' };
    }
    if (
      spec.kind === 'image' ||
      spec.kind === 'image_mockup' ||
      spec.kind === 'image_3d_mockup' ||
      spec.kind === 'edited_image'
    ) {
      return { modality: 'image', needsClarification: false, reason: 'kind' };
    }
    return { modality: null, needsClarification: false, reason: 'not_applicable' };
  }

  // Presentation/document win over image+video dual listings (e.g. event content).
  if (
    spec.modalities.includes('presentation') ||
    spec.modalities.includes('document') ||
    spec.kind === 'presentation' ||
    spec.kind === 'document' ||
    spec.kind === 'email' ||
    spec.kind === 'deferred_website'
  ) {
    return { modality: null, needsClarification: false, reason: 'not_applicable' };
  }

  if (
    input.preferredVisualModality === 'image' ||
    input.preferredVisualModality === 'video'
  ) {
    return {
      modality: input.preferredVisualModality,
      needsClarification: false,
      reason: 'preferred',
    };
  }

  const format = (input.format ?? '').trim().toLowerCase();
  const service = normalizeServiceSlug(input.service);
  const subtype = (input.subtype ?? '').trim().toLowerCase();

  // Social Content Design: platform format id picks image vs video (reels → video, feed post → image).
  if (service === 'social' && subtype === 'content-design' && format) {
    if (isVideoSocialFormat(format)) {
      return { modality: 'video', needsClarification: false, reason: 'format' };
    }
    return { modality: 'image', needsClarification: false, reason: 'format' };
  }

  if (format && isVideoSocialFormat(format)) {
    return { modality: 'video', needsClarification: false, reason: 'format' };
  }

  const inferred = inferExplicitVisualModalityFromPrompt(input.prompt);
  if (inferred === 'image' || inferred === 'video') {
    return { modality: inferred, needsClarification: false, reason: 'prompt' };
  }
  if (inferred === 'conflict') {
    return { modality: null, needsClarification: true, reason: 'conflict' };
  }
  return { modality: null, needsClarification: true, reason: 'ambiguous' };
}

export function needsImageVideoModalityClarification(input: {
  readonly service?: string;
  readonly subtype?: string;
  readonly category?: string;
  readonly format?: string;
  readonly prompt?: string;
  readonly preferredVisualModality?: 'image' | 'video';
}): boolean {
  const spec = resolveServiceOutputSpec(input);
  return resolveVisualModalityChoice({
    spec,
    format: input.format,
    prompt: input.prompt,
    preferredVisualModality: input.preferredVisualModality,
    service: input.service,
    subtype: input.subtype,
  }).needsClarification;
}

export function mediaModalityClarificationMessage(input: {
  readonly service?: string;
  readonly subtype?: string;
}): string {
  const service = normalizeServiceSlug(input.service);
  if (service === 'ads') {
    return 'Should this performance ad be a static image ad or a video ad?';
  }
  if (service === 'social') {
    return 'Should this social post be a static image or a video (reel/story)?';
  }
  return 'Should we generate an image or a video for this brief?';
}

/**
 * True when a presentation-primary map entry also offers image/video and the
 * brief does not clearly pick one deliverable (e.g. event/content-design).
 */
export function needsDeliverableModalityClarification(input: {
  readonly service?: string;
  readonly subtype?: string;
  readonly category?: string;
  readonly format?: string;
  readonly prompt?: string;
  readonly preferredDeliverableModality?:
    | 'presentation'
    | 'image'
    | 'video';
}): boolean {
  if (input.preferredDeliverableModality) return false;
  const spec = resolveServiceOutputSpec(input);
  if (!spec.askIfVague) return false;
  if (spec.kind !== 'presentation') return false;
  const hasVisual =
    spec.modalities.includes('image') || spec.modalities.includes('video');
  if (!hasVisual) return false;

  const hay = (input.prompt ?? '').toLowerCase();
  if (/\b(pitch\s*deck|presentation|slides?|pptx|deck|screens?)\b/.test(hay)) {
    return false;
  }
  const visual = inferExplicitVisualModalityFromPrompt(input.prompt);
  if (visual === 'image' || visual === 'video') return false;
  return true;
}

export function deliverableModalityClarificationMessage(input: {
  readonly service?: string;
  readonly subtype?: string;
}): string {
  const service = normalizeServiceSlug(input.service);
  if (service === 'event') {
    return 'What should we create for this event content — a presentation/deck, an image creative, or a video?';
  }
  return 'What should we create — a presentation, an image, or a video?';
}

function refineFromPrompt(
  base: ServiceOutputSpec,
  prompt?: string,
): ServiceOutputSpec {
  if (!prompt?.trim()) return base;
  if (base.kind !== 'dynamic' && !base.askIfVague) return base;

  const hay = prompt.toLowerCase();

  // Dual image+video offerings (e.g. performance ads): only narrow to image/video.
  // Must run before deck/document keyword checks — ad briefs often say
  // "production-ready presentation" without meaning a pitch deck.
  if (specOffersImageAndVideo(base)) {
    const visual = inferExplicitVisualModalityFromPrompt(prompt);
    if (visual === 'video') {
      return SPEC('video', ['video'], 'Video from user requirement');
    }
    if (visual === 'image') {
      return SPEC('image', ['image'], 'Image from user requirement');
    }
    return base;
  }

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
  | 'text'
  | 'document'
  | 'presentation'
  | 'visual'
  | 'video'
  | 'email'
  | 'website'
  | 'human'
  | 'dynamic';

export const SERVICE_DISPLAY_LABELS: Record<string, string> = {
  social: 'Social Media',
  website: 'Web Tech',
  branding: 'Branding & Logo',
  packaging: 'Packaging Design',
  print: 'Print & OOH',
  video: 'Video & Motion',
  presentations: 'Presentations',
  email: 'Email Design',
  pos: 'POS / In-Store',
  merchandise: 'Merchandise',
  illustration: 'Illustration',
  photography: 'Visual Production',
  strategy: 'Brand Strategy',
  ads: 'Ad Campaigns',
  event: 'Event Branding',
};

function titleCaseSlug(id: string): string {
  return id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function outputContextFamily(kind: ServiceOutputKind): OutputContextFamily {
  switch (kind) {
    case 'presentation':
      return 'presentation';
    case 'document':
      return 'document';
    case 'text':
      return 'text';
    case 'image':
    case 'image_mockup':
    case 'image_3d_mockup':
    case 'edited_image':
      return 'visual';
    case 'video':
    case 'animation':
      return 'video';
    case 'email':
      return 'email';
    case 'deferred_website':
      return 'website';
    case 'human_form':
      return 'human';
    default:
      return 'dynamic';
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
  if (input.deliverableLabel?.includes(' · ')) {
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
  return detail ?? serviceLabel ?? 'Creative';
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
  mediaKind?: 'image' | 'video' | 'text';
}): string {
  const spec = resolveServiceOutputSpec(input);
  const family = outputContextFamily(spec.kind);
  const svc = normalizeServiceSlug(input.service);
  const subtype = (input.subtype ?? '').toLowerCase();
  const prompt = (input.prompt ?? '').toLowerCase();

  if (family === 'presentation' || svc === 'presentations') return 'presentation';
  if (svc === 'branding' || subtype.includes('logo')) return 'logo';
  if (svc === 'website') {
    return subtype.includes('landing') || prompt.includes('landing')
      ? 'landing_page'
      : 'website';
  }
  if (svc === 'email' || family === 'email') return 'email';
  if (svc === 'print' || family === 'document') return 'brochure';
  if (svc === 'strategy' || (prompt.includes('strategy') && !prompt.includes('campaign'))) {
    return 'strategy';
  }
  if (svc === 'ads') return 'campaign_strategy';
  if (subtype === 'copywriting' || svc === 'copywriting') return 'copy';
  if (prompt.includes('caption')) return 'caption';
  if (svc === 'social') return 'social_creative';
  if (family === 'video') return 'video';
  if (family === 'visual') return 'social_creative';
  if (input.mediaKind === 'video') return 'video';
  if (input.mediaKind === 'image') return 'social_creative';
  if (input.mediaKind === 'text' || family === 'text') return 'copy';
  return 'generic';
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
  | 'email'
  | 'website'
  | 'human';

export function uiProfileForOutput(spec: ServiceOutputSpec): ProductUiProfile {
  switch (spec.kind) {
    case 'text':
      return 'text';
    case 'deferred_website':
      return 'website';
    case 'document':
      return 'document';
    case 'email':
      return 'email';
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
  options?: {
    readonly prompt?: string;
    readonly format?: string;
    readonly preferredVisualModality?: 'image' | 'video';
    readonly preferredDeliverableModality?:
      | 'presentation'
      | 'image'
      | 'video';
  },
): 'text' | 'image' | 'video' | 'document' | 'presentation' | 'website' | 'email' {
  if (spec.kind === 'deferred_website') return 'website';
  if (spec.kind === 'email') return 'email';

  // Presentation + visual dual listings (e.g. event/content-design): honour
  // an explicit user choice or prompt cue before defaulting to presentation.
  if (
    spec.kind === 'presentation' &&
    (spec.modalities.includes('image') || spec.modalities.includes('video')) &&
    spec.askIfVague
  ) {
    if (options?.preferredDeliverableModality === 'presentation') {
      return 'presentation';
    }
    if (
      options?.preferredDeliverableModality === 'image' ||
      options?.preferredDeliverableModality === 'video'
    ) {
      return options.preferredDeliverableModality;
    }
    const visual = inferExplicitVisualModalityFromPrompt(options?.prompt);
    if (visual === 'image' || visual === 'video') return visual;
    const hay = (options?.prompt ?? '').toLowerCase();
    if (/\b(pitch\s*deck|presentation|slides?|pptx|deck|screens?)\b/.test(hay)) {
      return 'presentation';
    }
    // Ambiguous — callers must clarify; metadata default stays presentation.
    return 'presentation';
  }

  if (spec.kind === 'presentation' || spec.modalities.includes('presentation')) {
    return 'presentation';
  }
  if (spec.kind === 'document' || spec.modalities.includes('document')) {
    return 'document';
  }
  if (spec.kind === 'video' || spec.kind === 'animation') return 'video';
  if (spec.kind === 'text') return 'text';

  // Prefer kind / explicit cues over modalities[] order — never let video win
  // solely because it appears before image in a dual listing.
  if (specOffersImageAndVideo(spec)) {
    const choice = resolveVisualModalityChoice({
      spec,
      prompt: options?.prompt,
      format: options?.format,
      preferredVisualModality: options?.preferredVisualModality,
    });
    if (choice.modality) return choice.modality;
    // Ambiguous: keep image as the kind-aligned default for routing metadata;
    // callers must gate generation with needsImageVideoModalityClarification.
    if (
      spec.kind === 'image' ||
      spec.kind === 'image_mockup' ||
      spec.kind === 'image_3d_mockup' ||
      spec.kind === 'edited_image'
    ) {
      return 'image';
    }
    return 'image';
  }

  if (
    spec.kind === 'image' ||
    spec.kind === 'image_mockup' ||
    spec.kind === 'image_3d_mockup' ||
    spec.kind === 'edited_image'
  ) {
    return 'image';
  }
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
  ctx?: { service?: string; subtype?: string },
): 'strategy' | 'copy' | 'coding' | 'website' | 'creative' | 'general' {
  if (ctx?.service) {
    const fromService = resolveTextUseCaseFromService(
      { service: ctx.service, subtype: ctx.subtype },
      spec.kind,
    );
    if (
      fromService &&
      fromService !== 'multilingual' &&
      fromService !== 'research'
    ) {
      return fromService;
    }
  }

  if (spec.kind === 'deferred_website') {
    return 'website';
  }
  if (spec.kind === 'document' || spec.kind === 'presentation') {
    return 'strategy';
  }
  if (spec.kind === 'text') return 'copy';
  if (spec.modalities.includes('text') && !spec.modalities.includes('image')) {
    return 'copy';
  }
  return 'creative';
}
