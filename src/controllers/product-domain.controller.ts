import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { usageAnalyticsService } from "../services/usage-analytics-service";
import { userPreferencesService } from "../services/user-preferences-service";
import { helpService } from "../services/help-service";
import { savedRouteService } from "../services/saved-route-service";
import { productSearchService } from "../services/product-search-service";

function orgIdFromUser(req: RequestUser): string | undefined {
  const org = req.user?.organization as { _id?: { toString(): string } } | null;
  return org?._id?.toString();
}

export const getUsageAnalytics = asyncHandler(async (req: RequestUser) => {
  const data = await usageAnalyticsService.summarize({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
  });
  return new ApiResponse(200, data, "Usage analytics");
});

export const getPreferences = asyncHandler(async (req: RequestUser) => {
  const data = await userPreferencesService.getOrCreate(req.user!.userId!);
  return new ApiResponse(200, data, "Preferences");
});

export const updatePreferences = asyncHandler(async (req: RequestUser) => {
  const data = await userPreferencesService.update(
    req.user!.userId!,
    req.body ?? {}
  );
  return new ApiResponse(200, data, "Preferences updated");
});

export const listHelpCategories = asyncHandler(async () => {
  await helpService.ensureSeed();
  const data = await helpService.listCategories();
  return new ApiResponse(200, data, "Help categories");
});

export const listHelpArticles = asyncHandler(async (req: RequestUser) => {
  await helpService.ensureSeed();
  const data = await helpService.list({
    category: req.query.category as string | undefined,
    q: req.query.q as string | undefined,
  });
  return new ApiResponse(200, data, "Help articles");
});

export const getHelpArticle = asyncHandler(async (req: RequestUser) => {
  await helpService.ensureSeed();
  const data = await helpService.getBySlug(req.params.slug);
  return new ApiResponse(200, data, "Help article");
});

export const listSavedRoutes = asyncHandler(async (req: RequestUser) => {
  const data = await savedRouteService.list({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
    favoritesOnly: req.query.favorites === "1",
    executionId:
      typeof req.query.executionId === "string"
        ? req.query.executionId
        : undefined,
  });
  return new ApiResponse(200, data, "Saved routes");
});

export const createSavedRoute = asyncHandler(async (req: RequestUser) => {
  const data = await savedRouteService.create({
    userId: req.user!.userId!,
    organizationId:
      (req.body?.organizationId as string | undefined) || orgIdFromUser(req),
    title: req.body?.title,
    prompt: req.body?.prompt,
    subtitle: req.body?.subtitle,
    intent: req.body?.intent,
    capabilityId: req.body?.capabilityId,
    artifactId: req.body?.artifactId,
    executionId: req.body?.executionId,
    sourceRouteId: req.body?.sourceRouteId,
    mediaKind: req.body?.mediaKind,
    pinned: req.body?.pinned,
    favorite: req.body?.favorite,
    brandId: req.body?.brandId,
  });
  return new ApiResponse(201, data, "Saved route created");
});

export const updateSavedRoute = asyncHandler(async (req: RequestUser) => {
  const data = await savedRouteService.update({
    userId: req.user!.userId!,
    routeId: req.params.routeId,
    patch: req.body ?? {},
  });
  return new ApiResponse(200, data, "Saved route updated");
});

export const deleteSavedRoute = asyncHandler(async (req: RequestUser) => {
  const data = await savedRouteService.remove({
    userId: req.user!.userId!,
    routeId: req.params.routeId,
  });
  return new ApiResponse(200, data, "Saved route deleted");
});

function parseTypes(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(",");
  const cleaned = list.map((t) => String(t).trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

export const globalSearch = asyncHandler(async (req: RequestUser) => {
  const data = await productSearchService.search({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
    brandId: req.query.brandId as string | undefined,
    q: String(req.query.q ?? ""),
    types: parseTypes(req.query.types) as never,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    cursor: req.query.cursor as string | undefined,
  });
  return new ApiResponse(200, data, "Search results");
});

export const getSearchSuggestions = asyncHandler(async (req: RequestUser) => {
  const data = await productSearchService.suggestions({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
    q: String(req.query.q ?? ""),
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return new ApiResponse(200, data, "Search suggestions");
});

export const getRecentSearches = asyncHandler(async (req: RequestUser) => {
  const data = await productSearchService.listRecent({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return new ApiResponse(200, data, "Recent searches");
});

export const clearRecentSearches = asyncHandler(async (req: RequestUser) => {
  const data = await productSearchService.clearRecent({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
  });
  return new ApiResponse(200, data, "Recent searches cleared");
});
