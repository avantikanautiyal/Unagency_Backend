/**
 * Visual Field Guide — per-service visual recipes (SERVICE 01–15).
 * checkFirst / checkLast mirror the Field Guide gates for instruct + evidence.
 */

import { hygieneCheck } from "../rules/helpers";
import type { ServiceVisualRecipe } from "./types";

const freezeRecipe = (recipe: ServiceVisualRecipe): ServiceVisualRecipe =>
  Object.freeze({
    ...recipe,
    coverage: Object.freeze([...recipe.coverage]),
    checkFirst: Object.freeze([...recipe.checkFirst]),
    checkLast: Object.freeze([...recipe.checkLast]),
  });

export const SERVICE_VISUAL_RECIPES: readonly ServiceVisualRecipe[] =
  Object.freeze([
    freezeRecipe({
      service: "social",
      serviceNumber: "01",
      title: "Social Media",
      mantra: "Make one idea worth stopping for.",
      compositionPrompt:
        "Create a 5-page UNAGENCY service carousel: cover, problem, approach, deliverables, Start a project. Preserve one heading position across all pages.",
      coverage: Object.freeze([
        "Strategy",
        "Content design",
        "Copywriting",
        "Carousel",
        "Reels / Stories",
        "Community / interactive",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.placement-named",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "Exact intended placement is named; never approve an asset for “All”.",
          promptLine:
            "Name the exact intended placement; never generate a single asset for “All”.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.publication-parts",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Caption, link, cover, alt text and native CTA checked separately.",
          promptLine:
            "Treat caption, link, cover, alt text and native CTA as separate deliverables.",
        }),
      ],
    }),
    freezeRecipe({
      service: "website",
      serviceNumber: "02",
      title: "Web Tech",
      mantra: "Design the action, not just the screen.",
      compositionPrompt:
        "UNAGENCY landing page: concise service promise, three outcomes, process, proof placeholders labeled as examples, and Start a project. Never fabricate testimonials.",
      coverage: Object.freeze([
        "Corporate website",
        "E-com website",
        "Landing page",
        "UI design",
        "Interactive prototypes",
        "Design systems",
        "App development",
        "UX strategy / other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.no-overflow",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "No horizontal overflow at agreed widths; content reflows instead of scaling a screenshot.",
          promptLine:
            "No horizontal overflow; content must reflow — never fake responsiveness by scaling a screenshot.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.privacy-gate",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "No live data capture until notices, consent needs and security review are approved.",
          promptLine:
            "Do not capture live user data until notices, consent and security review are approved.",
        }),
      ],
    }),
    freezeRecipe({
      service: "branding",
      serviceNumber: "03",
      title: "Branding & Logo",
      mantra: "One identity. Recognizable everywhere.",
      compositionPrompt:
        "Use only the supplied UNAGENCY wordmark. Black and white are the identity base; muted teal is annotation-only, not a confirmed brand palette.",
      coverage: Object.freeze([
        "Logo design",
        "Visual identity",
        "Brand guidelines",
        "Brand naming & taglines",
        "Other identity assets",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.supplied-artwork",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Use the supplied artwork; never retype, stretch, trace or add effects.",
          promptLine:
            "Use the supplied wordmark/artwork exactly; never retype, stretch, trace or add effects.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.versions-match",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition: "All versions are named; source and exports visually match.",
          promptLine: "Deliver named versions whose source and exports visually match.",
        }),
      ],
    }),
    freezeRecipe({
      service: "packaging",
      serviceNumber: "04",
      title: "Packaging Design",
      mantra: "Respect the structure. Protect the truth.",
      compositionPrompt:
        "UNAGENCY sample carton: front identity and purpose; side panel for supporting information; back panel for approved details. Sample dimensions are illustrative, not manufacturing approval.",
      coverage: Object.freeze([
        "Boxes & cartons",
        "Pouches / wrappers",
        "Jars / bottles",
        "Tubes",
        "Labels",
        "Gift packs",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.dieline-match",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Artwork matches the approved version; cut/fold guides are non-printing.",
          promptLine:
            "Match approved artwork to the dieline; keep cut/fold guides non-printing.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.assembled-legibility",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Name, variant and key information remain legible when assembled.",
          promptLine:
            "Keep name, variant and key information legible when the pack is assembled.",
        }),
      ],
    }),
    freezeRecipe({
      service: "print",
      serviceNumber: "05",
      title: "Print & OOH",
      mantra: "Read at the distance it will live.",
      compositionPrompt:
        "UNAGENCY A3 poster: one large headline, one central visual, the wordmark and Start a project. Show trim, bleed and live area on the proof, not the final creative.",
      coverage: Object.freeze([
        "Brochures",
        "Leaflets",
        "Posters / print ads",
        "OOH design",
        "Vehicle design",
        "Standees",
        "Other print",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.dims-declared",
          weight: "gate",
          evaluationMethod: "MEASURED",
          passDefinition:
            "Dimensions and units declared; effective image resolution calculated at final size.",
          promptLine:
            "Declare final physical dimensions/units and calculate effective PPI at final size.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.ooh-message",
          weight: "weighted",
          evaluationMethod: "HEURISTIC",
          passDefinition: "OOH house target: headline up to 8 words and one action.",
          promptLine: "For OOH, target headline ≤8 words and one clear action.",
        }),
      ],
    }),
    freezeRecipe({
      service: "video",
      serviceNumber: "06",
      title: "Video & Motion",
      mantra: "Make every second earn its place.",
      compositionPrompt:
        "UNAGENCY 15-second promo: 0–1 s identity/hook; 1–5 s problem; 5–11 s solution; 11–15 s Start a project. Timing is an example house format.",
      coverage: Object.freeze([
        "Corporate films",
        "Explainer / promo videos",
        "Motion graphics",
        "2D / 3D animation",
        "VFX / video editing",
        "Storyboards",
        "Other motion",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.video-export",
          weight: "gate",
          evaluationMethod: "MEASURED",
          passDefinition:
            "House web delivery: MP4/H.264, progressive, Rec.709; match approved frame rate.",
          promptLine:
            "Deliver MP4/H.264 progressive Rec.709 matching the approved/source frame rate.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.video-continuity",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "No stray frames, broken transitions, missing media or unwanted end black.",
          promptLine:
            "No stray frames, broken transitions, missing media or unwanted end black.",
        }),
      ],
    }),
    freezeRecipe({
      service: "presentations",
      serviceNumber: "07",
      title: "Presentations",
      mantra: "One slide. One useful conclusion.",
      compositionPrompt:
        "UNAGENCY pitch slide: headline on top, one proof visual below, a one-sentence implication and a clear next step.",
      coverage: Object.freeze([
        "Corporate",
        "Pitch decks",
        "Product",
        "Training",
        "Infographics / templates",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.slide-type-sizes",
          weight: "weighted",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "House targets: titles 32 pt+, body 20 pt+; references 12 pt+; test projected view.",
          promptLine:
            "House legibility: titles ≥32 pt, body ≥20 pt, references ≥12 pt; design for projected view.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.slide-takeaway",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Slide headline states the takeaway; remove competing messages.",
          promptLine:
            "Slide headline must state the takeaway; remove competing messages.",
        }),
      ],
    }),
    freezeRecipe({
      service: "email",
      serviceNumber: "08",
      title: "Email Design",
      mantra: "One message that survives the inbox.",
      compositionPrompt:
        "UNAGENCY newsletter: concise masthead, feature story, three service updates and Start a project. Keep the primary action above the long editorial tail.",
      coverage: Object.freeze(["Emailers", "Newsletters", "GIFs", "Other"]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.email-live-cta",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition: "Essential message and CTA are not a single flat image.",
          promptLine:
            "Keep essential message and CTA as live text/HTML — not a single flat image.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.email-subject",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Subject, preheader, personalization fallbacks and proofread body approved.",
          promptLine:
            "Approve subject, preheader, personalization fallbacks and proofread body separately.",
        }),
      ],
    }),
    freezeRecipe({
      service: "pos",
      serviceNumber: "09",
      title: "POS / In-Store",
      mantra: "Win the glance. Help the next action.",
      compositionPrompt:
        "UNAGENCY booth: wordmark at approach level, one offer at eye level, clear consultation CTA on the counter and separate operational signage.",
      coverage: Object.freeze([
        "Product display units",
        "Branding elements",
        "Sampling booths",
        "Store branding",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.fixture-signed",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Fixture measurements signed off; artwork avoids hardware and concealed regions.",
          promptLine:
            "Match signed fixture measurements; keep artwork clear of hardware and concealed regions.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.eye-level-mockup",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Approve shopper-eye-level mockup, not just flat artwork.",
          promptLine:
            "Approve from a shopper-eye-level mockup, not flat artwork alone.",
        }),
      ],
    }),
    freezeRecipe({
      service: "merchandise",
      serviceNumber: "10",
      title: "Merchandise",
      mantra: "Design for the material, not the mockup.",
      compositionPrompt:
        "UNAGENCY black T-shirt with white wordmark, centered in the approved chest area. Use the actual garment sample to validate size and contrast.",
      coverage: Object.freeze([
        "T-shirts / jackets",
        "Caps",
        "Mugs / bottles",
        "Pens / notepads",
        "Bags / keychains",
        "Trophy / gift hampers",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.decoration-method",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "Art suits embroidery, transfer, screen print, engraving or sublimation as selected.",
          promptLine:
            "Design art for the selected decoration method (embroidery, transfer, screen, engraving, sublimation).",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.signed-sample",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition: "Signed production sample required before batch release.",
          promptLine:
            "Require a signed production sample before batch release.",
        }),
      ],
    }),
    freezeRecipe({
      service: "illustration",
      serviceNumber: "11",
      title: "Illustration",
      mantra: "Keep the visual language consistent.",
      compositionPrompt:
        "UNAGENCY infographic: three stages, consistent stroke weight, short labels and one source note. No invented research statistic.",
      coverage: Object.freeze([
        "Concept art",
        "Mascot design",
        "Infographics",
        "Technical illustration",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.illustration-consistency",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Line weight, perspective, shading and palette match across the set.",
          promptLine:
            "Keep line weight, perspective, shading and palette consistent across the set.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.shape-reads",
          weight: "weighted",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition: "Key shape still reads at final display size.",
          promptLine: "Ensure key shapes still read at final display size.",
        }),
      ],
    }),
    freezeRecipe({
      service: "photography",
      serviceNumber: "12",
      title: "Visual Production",
      mantra: "Preserve what is real and approved.",
      compositionPrompt:
        "UNAGENCY production example: retain full subject, clean edges and realistic shadow. Show crop boundaries separately from the final export.",
      coverage: Object.freeze([
        "Product",
        "Lifestyle",
        "Corporate / industrial",
        "Event",
        "Retouching",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.product-truth",
          weight: "gate",
          evaluationMethod: "MODEL_JUDGED",
          passDefinition:
            "Do not alter product branding, claims, shape or functional details without approval.",
          promptLine:
            "Do not alter product branding, claims, shape or functional details without approval.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.subject-retained",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "Master and derivative crops named; full subject retained when requested.",
          promptLine:
            "Name master and derivative crops; retain the full subject when requested.",
        }),
      ],
    }),
    freezeRecipe({
      service: "strategy",
      serviceNumber: "13",
      title: "Brand Strategy",
      mantra: "Make a decision the work can follow.",
      compositionPrompt:
        "UNAGENCY strategy map: audience need → promise → proof → creative direction → measurement. Use example labels instead of fictional market findings.",
      coverage: Object.freeze([
        "Research / audit",
        "Positioning",
        "Architecture / narrative",
        "Content strategy",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.claims-sourced",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "Claims link to actual research; assumptions clearly tagged.",
          promptLine:
            "Link claims to actual research; clearly tag assumptions — no fictional findings.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.brief-consistency",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Final strategy and downstream creative briefs do not contradict each other.",
          promptLine:
            "Ensure final strategy and downstream creative briefs do not contradict each other.",
        }),
      ],
    }),
    freezeRecipe({
      service: "ads",
      serviceNumber: "14",
      title: "Ad Campaigns",
      mantra: "Connect the idea to the outcome.",
      compositionPrompt:
        "UNAGENCY concept test: identical placement, headline and CTA; compare two compositions. Record the hypothesis before comparing campaign outcomes.",
      coverage: Object.freeze([
        "Performance ads",
        "Campaign concept",
        "Visual assets",
        "Copywriting / other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.offer-cta-match",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition: "Offer and CTA match the landing page exactly.",
          promptLine: "Offer and CTA must match the landing page exactly.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.no-fake-results",
          weight: "gate",
          evaluationMethod: "HEURISTIC",
          passDefinition:
            "No unsupported performance promises or fabricated results.",
          promptLine:
            "No unsupported performance promises or fabricated results.",
        }),
      ],
    }),
    freezeRecipe({
      service: "event",
      serviceNumber: "15",
      title: "Event Branding",
      mantra: "One identity across the whole journey.",
      compositionPrompt:
        "UNAGENCY event system: invitation → arrival → registration → stage → follow-up. Preserve the same wordmark and core hierarchy at each touchpoint.",
      coverage: Object.freeze([
        "Event concept",
        "Event identity",
        "Content design",
        "Visual assets",
        "Other",
      ]),
      checkFirst: [
        hygieneCheck({
          id: "vfg.event-dims",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition: "Actual screen maps and print dimensions confirmed.",
          promptLine: "Confirm actual screen maps and print dimensions before produce.",
        }),
      ],
      checkLast: [
        hygieneCheck({
          id: "vfg.onsite-test",
          weight: "gate",
          evaluationMethod: "NOT_AUTOMATED",
          passDefinition:
            "Test loops, playback, legibility and physical installation onsite.",
          promptLine:
            "Test loops, playback, legibility and physical installation onsite before release.",
        }),
      ],
    }),
  ]);

const BY_SERVICE: ReadonlyMap<string, ServiceVisualRecipe> = new Map(
  SERVICE_VISUAL_RECIPES.map((r) => [r.service, r]),
);

/** Normalize aliases used in routing / metadata to Field Guide service keys. */
export function normalizeVisualFieldGuideService(
  service?: string | null,
): string | undefined {
  if (!service) return undefined;
  const s = service.trim().toLowerCase();
  if (!s) return undefined;
  // Exact / longest matches first to avoid substring collisions (e.g. branding vs ad).
  const exact: Record<string, string> = {
    social: "social",
    website: "website",
    web: "website",
    "web-tech": "website",
    branding: "branding",
    packaging: "packaging",
    print: "print",
    video: "video",
    presentations: "presentations",
    presentation: "presentations",
    email: "email",
    pos: "pos",
    merchandise: "merchandise",
    illustration: "illustration",
    photography: "photography",
    "visual-production": "photography",
    strategy: "strategy",
    ads: "ads",
    campaigns: "ads",
    event: "event",
  };
  if (exact[s]) return exact[s];
  if (s.includes("website") || s.includes("site")) return "website";
  if (s.includes("email")) return "email";
  if (s.includes("social")) return "social";
  if (s.includes("brand")) return "branding";
  if (s.includes("pack")) return "packaging";
  if (s.includes("print") || s.includes("ooh")) return "print";
  if (s.includes("video") || s.includes("motion")) return "video";
  if (s.includes("present")) return "presentations";
  if (s.includes("pos") || s.includes("store")) return "pos";
  if (s.includes("merch")) return "merchandise";
  if (s.includes("illustr")) return "illustration";
  if (s.includes("photo") || s.includes("visual-production")) return "photography";
  if (s.includes("strateg")) return "strategy";
  if (s.includes("campaign") || s === "ad" || s.startsWith("ad-") || s.endsWith("-ads")) {
    return "ads";
  }
  if (s.includes("event")) return "event";
  return s;
}

export function getServiceVisualRecipe(
  service?: string | null,
): ServiceVisualRecipe | undefined {
  const key = normalizeVisualFieldGuideService(service);
  if (!key) return undefined;
  return BY_SERVICE.get(key);
}

export function listServiceVisualRecipes(): readonly ServiceVisualRecipe[] {
  return SERVICE_VISUAL_RECIPES;
}
