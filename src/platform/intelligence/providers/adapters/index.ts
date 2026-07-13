/**
 * Adapters module barrel (M1 provider architecture — contracts only).
 *
 * NOTE: The M4.4 Provider Adapter Platform lives alongside these M1 stubs in
 * subfolders and is exported from `./adapter-platform` to avoid colliding with
 * the frozen M1 `IProviderAdapter` / `ProviderAdapterRequest` contracts that the
 * frozen provider factory + interfaces still depend on. See
 * `docs/ARCHITECTURE_REVIEW.md` (and ACP-A2) for the consolidation proposal.
 */

export * from "./provider-adapter";
export * from "./placeholder-provider-adapter";
