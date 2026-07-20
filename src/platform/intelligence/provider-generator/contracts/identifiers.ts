/** Provider Generator identifiers. */

export type ProviderGenerationId = string & { readonly __brand: "ProviderGenerationId" };
export type GeneratedPackageId = string & { readonly __brand: "GeneratedPackageId" };

export function asProviderGenerationId(id: string): ProviderGenerationId {
  return id as ProviderGenerationId;
}

export function asGeneratedPackageId(id: string): GeneratedPackageId {
  return id as GeneratedPackageId;
}
