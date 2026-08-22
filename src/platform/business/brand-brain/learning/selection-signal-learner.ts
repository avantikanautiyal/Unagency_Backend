/**
 * Brand Learning — Phase 2: Route Selection Signal Learner
 *
 * When a user saves / selects a creative route, the route's title, direction
 * description, and media kind are positive signals about what works for
 * this brand.  We persist them into the BrandBrain and dual-write into the
 * product Brand SoT so Brand Intelligence compounds on the next create.
 *
 * Signal → BrandBrain mapping:
 *  route.title         → successfulStrategies (what the user approved)
 *  route.prompt        → styleGuideNotes (direction they chose)
 *  route.mediaKind     → contentPreferences.preferredFormats
 *  route.intent        → contentPreferences.preferredFormats
 *  route.capabilityId  → contentPreferences.preferredFormats
 */

import type { IBrandBrainEngine } from "../interfaces";
import type { BrandBrainDocument, StrategyMemory } from "../contracts/knowledge";
import { emptyBrandBrainDocument } from "./refinement-signal-learner";
import { mergePreferencesIntoProductBrand } from "./product-brand-preference-writer";

function dedupe(arr: readonly string[], additions: string[]): readonly string[] {
  const set = new Set([...arr, ...additions.map((s) => s.trim()).filter(Boolean)]);
  return [...set];
}

export interface RouteSelectionSignal {
  organizationId: string;
  /** Product brand to dual-write into (optional — resolves org default). */
  brandId?: string;
  /** Route title — the direction name the user chose (e.g. "Modern Ethnic Muse") */
  title: string;
  /** Route prompt / description — the full direction the AI generated */
  prompt?: string;
  /** The service capability intent (e.g. "social_creative", "logo", "copy") */
  intent?: string;
  /** Media kind: image | video | text */
  mediaKind?: string;
  /** AI capability ID used (e.g. "text.generate", "image.generate") */
  capabilityId?: string;
  /** Whether the user explicitly marked this as a favourite */
  favorite?: boolean;
}

/**
 * Apply a route selection signal to the current BrandBrainDocument.
 */
function applySelectionToBrain(
  doc: BrandBrainDocument,
  signal: RouteSelectionSignal,
): BrandBrainDocument {
  const styleNotes: string[] = [];
  if (signal.prompt?.trim()) {
    styleNotes.push(`Approved direction: ${signal.prompt.trim().slice(0, 200)}`);
  }

  // Track the route title as a successful strategy memory
  const strategyEntry: StrategyMemory = {
    strategyId: `sel_${Date.now()}`,
    title: signal.title.trim().slice(0, 80),
    summary: signal.prompt?.trim().slice(0, 200) ?? signal.title,
    succeeded: true,
    tags: [
      signal.intent ?? "general",
      signal.mediaKind ?? "unknown",
      signal.favorite ? "favourite" : "selected",
    ].filter(Boolean),
  };

  // Track preferred formats / intents
  const preferredFormats: string[] = [];
  if (signal.mediaKind) preferredFormats.push(`${signal.mediaKind} format`);
  if (signal.intent) preferredFormats.push(`${signal.intent} direction`);
  if (signal.capabilityId) preferredFormats.push(`capability:${signal.capabilityId}`);

  return {
    ...doc,
    successfulStrategies: [...doc.successfulStrategies, strategyEntry].slice(-30),
    styleGuideNotes: dedupe(doc.styleGuideNotes, styleNotes),
    contentPreferences: {
      ...doc.contentPreferences,
      preferredFormats: dedupe(doc.contentPreferences.preferredFormats, preferredFormats),
    },
  };
}

/**
 * Call after a user saves / selects a route.
 * Best-effort — never throws; never blocks the save flow.
 */
export async function learnFromRouteSelection(
  signal: RouteSelectionSignal,
  deps: { brandBrainEngine: IBrandBrainEngine },
): Promise<void> {
  if (!signal.organizationId?.trim() || !signal.title?.trim()) return;

  const styleNotes: string[] = [];
  if (signal.prompt?.trim()) {
    styleNotes.push(`Approved direction: ${signal.prompt.trim().slice(0, 200)}`);
  }
  if (signal.title.trim()) {
    styleNotes.push(`Approved route: ${signal.title.trim().slice(0, 80)}`);
  }

  const preferredFormats: string[] = [];
  if (signal.mediaKind) preferredFormats.push(`${signal.mediaKind} format`);
  if (signal.intent) preferredFormats.push(`${signal.intent} direction`);
  if (signal.capabilityId) preferredFormats.push(`capability:${signal.capabilityId}`);

  try {
    await deps.brandBrainEngine.ensureHydrated?.(signal.organizationId);
    const currentResult = await deps.brandBrainEngine.getCurrent(signal.organizationId);
    const existing = currentResult.ok ? currentResult.value : undefined;

    const baseDoc: BrandBrainDocument =
      existing?.document ?? emptyBrandBrainDocument(signal.organizationId);

    const updatedDoc = applySelectionToBrain(baseDoc, signal);

    const changelog = `Learned from route selection: "${signal.title.trim().slice(0, 60)}"${signal.favorite ? " (favourited)" : ""}`;

    await deps.brandBrainEngine.upsert({
      organizationId: signal.organizationId,
      document: updatedDoc,
      changelog,
      label: `route-selection`,
      createdBy: "selection-signal-learner",
    });
  } catch {
    // Best-effort — never block the route save
  }

  // Dual-write into product brand SoT for Brand Intelligence apply path.
  void mergePreferencesIntoProductBrand({
    organizationId: signal.organizationId,
    brandId: signal.brandId,
    source: `route-selection:${signal.title.trim().slice(0, 40)}`,
    preferences: {
      styleNotes,
      preferredFormats,
    },
  });
}
