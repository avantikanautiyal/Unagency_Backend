/**
 * Product creation mode — AI / Hybrid / Human.
 * Server-enforced; clients must send via execution metadata.
 */

export type ProductMode = "ai" | "hybrid" | "human";

const PRODUCT_MODES: readonly ProductMode[] = ["ai", "hybrid", "human"];

export function isProductMode(value: unknown): value is ProductMode {
  return typeof value === "string" && PRODUCT_MODES.includes(value as ProductMode);
}

/** Accept `productMode` or legacy `creationMode` from client metadata. */
export function parseProductMode(
  metadata: Readonly<Record<string, unknown>> | undefined
): ProductMode | undefined {
  if (!metadata) return undefined;
  const raw = metadata.productMode ?? metadata.creationMode;
  return isProductMode(raw) ? raw : undefined;
}

/**
 * Resolved mode for server enforcement — defaults to AI when clients omit metadata.
 * Override via ENTERPRISE_DEFAULT_PRODUCT_MODE (ai | hybrid | human).
 */
export function resolveProductMode(
  metadata: Readonly<Record<string, unknown>> | undefined
): ProductMode {
  const explicit = parseProductMode(metadata);
  if (explicit) return explicit;
  const fromEnv = process.env.ENTERPRISE_DEFAULT_PRODUCT_MODE;
  if (isProductMode(fromEnv)) return fromEnv;
  return "ai";
}

export function productModeBlocksAiExecution(mode: ProductMode | undefined): boolean {
  return mode === "human";
}

/** AI and Hybrid run tool side-effects without manual approval chips. */
export function productModeAutoApprovesTools(mode: ProductMode | undefined): boolean {
  return mode === "ai" || mode === "hybrid";
}

export const PRODUCT_MODE_HUMAN_AI_BLOCKED =
  "AI execution is not available in human mode. Use collaboration chat instead.";
