/**
 * Slug helpers — align inventory model ids with catalog bootstrap labels.
 */

export function slugCatalogModelLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function catalogBootstrapModelId(catalogProviderId: string, modelLabel: string): string {
  return `${catalogProviderId}:${slugCatalogModelLabel(modelLabel)}`;
}
