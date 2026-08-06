import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  clearRecentSearches,
  createSavedRoute,
  deleteSavedRoute,
  getHelpArticle,
  getPreferences,
  getRecentSearches,
  getSearchSuggestions,
  getUsageAnalytics,
  globalSearch,
  listHelpArticles,
  listHelpCategories,
  listSavedRoutes,
  updatePreferences,
  updateSavedRoute,
} from "../controllers/product-domain.controller";

export const analyticsRouter = Router();
analyticsRouter.get("/usage", VerifyRole(["customer"]), getUsageAnalytics);

export const preferencesRouter = Router();
preferencesRouter.get("/", VerifyRole(["customer"]), getPreferences);
preferencesRouter.patch("/", VerifyRole(["customer"]), updatePreferences);

export const helpRouter = Router();
helpRouter.get("/categories", VerifyRole(["customer"]), listHelpCategories);
helpRouter.get("/articles", VerifyRole(["customer"]), listHelpArticles);
helpRouter.get("/articles/:slug", VerifyRole(["customer"]), getHelpArticle);

export const savedRoutesRouter = Router();
savedRoutesRouter.get("/", VerifyRole(["customer"]), listSavedRoutes);
savedRoutesRouter.post("/", VerifyRole(["customer"]), createSavedRoute);
savedRoutesRouter.patch("/:routeId", VerifyRole(["customer"]), updateSavedRoute);
savedRoutesRouter.delete("/:routeId", VerifyRole(["customer"]), deleteSavedRoute);

export const searchRouter = Router();
searchRouter.get("/suggestions", VerifyRole(["customer"]), getSearchSuggestions);
searchRouter.get("/recent", VerifyRole(["customer"]), getRecentSearches);
searchRouter.delete("/recent", VerifyRole(["customer"]), clearRecentSearches);
searchRouter.get("/", VerifyRole(["customer"]), globalSearch);
